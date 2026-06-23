// Best-effort OCR of the printed power badge on each of the 5000 card images.
// Writes server/util/cardMetadata.json { "<id>": { name, power, rarity } } and
// scripts/needs-review.json (low-confidence / failed reads to hand-fix).
const { createWorker } = require("tesseract.js");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "src/components/assets/images/webp.5k.nfts";
const OUT_META = "server/util/cardMetadata.json";
const OUT_REVIEW = "scripts/needs-review.json";
const TMP = "scripts/_ocr_tmp.png";

function rarityFor(p) {
  if (p >= 9) return "Legendary";
  if (p >= 7) return "Epic";
  if (p >= 4) return "Rare";
  return "Common";
}

// collect id -> filepath for all nft_<id>.webp
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else {
      const m = e.name.match(/nft_(\d+)\.webp$/i);
      if (m) acc[parseInt(m[1], 10)] = fp;
    }
  }
  return acc;
}

function prep(src, variant) {
  const v =
    variant === 2
      ? `-gravity NorthEast -crop 150x190+110+92 +repage -colorspace Gray -normalize -threshold 55% -negate -fill white -draw "polygon 95,0 150,0 150,70" -trim +repage -bordercolor white -border 30 -resize x120`
      : `-gravity NorthEast -crop 120x160+125+105 +repage -colorspace Gray -normalize -threshold 62% -negate -fill white -draw "polygon 78,0 120,0 120,55" -trim +repage -bordercolor white -border 28 -resize x110`;
  execSync(`magick "${src}" ${v} "${TMP}"`);
}

(async () => {
  const idMap = walk(ROOT, {});
  const ids = Object.keys(idMap).map(Number).sort((a, b) => a - b);
  console.log("[OCR] cards found:", ids.length, "range", ids[0], "-", ids[ids.length - 1]);

  const w = await createWorker("eng");
  await w.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "10" });

  const meta = {};
  const review = [];
  let done = 0;

  for (const id of ids) {
    const src = idMap[id];
    let best = { digit: "", conf: -1 };
    for (const variant of [1, 2]) {
      try { prep(src, variant); } catch (e) { continue; }
      let r;
      try { r = await w.recognize(TMP); } catch (e) { continue; }
      const digit = (r.data.text || "").replace(/\D/g, "");
      const conf = r.data.confidence || 0;
      if (digit && conf > best.conf) best = { digit, conf };
      if (best.conf >= 70) break;           // good enough, skip variant 2
    }
    let power = parseInt(best.digit, 10);
    let needsReview = false;
    if (!best.digit || Number.isNaN(power) || power < 1 || power > 10 || best.conf < 60) {
      needsReview = true;
      if (Number.isNaN(power) || power < 1 || power > 10) power = 1; // safe default until reviewed
    }
    meta[id] = { name: `#${id}`, power, rarity: rarityFor(power) };
    if (needsReview) review.push({ id, power, conf: Math.round(best.conf), raw: best.digit || null });

    if (++done % 250 === 0) {
      fs.writeFileSync(OUT_META, JSON.stringify(meta, null, 0));
      fs.writeFileSync(OUT_REVIEW, JSON.stringify(review, null, 1));
      console.log(`[OCR] ${done}/${ids.length}  review=${review.length}`);
    }
  }

  fs.writeFileSync(OUT_META, JSON.stringify(meta, null, 0));
  fs.writeFileSync(OUT_REVIEW, JSON.stringify(review, null, 1));
  await w.terminate();
  try { fs.unlinkSync(TMP); } catch (e) {}
  console.log(`[OCR] DONE. cards=${Object.keys(meta).length} needsReview=${review.length} (${OUT_REVIEW})`);
})().catch((e) => { console.error("[OCR] fatal:", e.message); process.exit(1); });
