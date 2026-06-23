// Generate web-sized card thumbnails for the 5000-NFT pool.
// Source: src/components/assets/images/webp.5k.nfts/**/nft_<id>.webp  (2000x2500, ~170KB)
// Output: public/cards5k/<id>.webp  (~400x500, ~25KB) served statically by the client.
const { execSync } = require("child_process");
const fs = require("fs");

const idMap = JSON.parse(fs.readFileSync("scripts/_idmap.json", "utf8"));
const OUT = "public/cards5k";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ids = Object.keys(idMap).map(Number).sort((a, b) => a - b);
let done = 0, skipped = 0;
for (const id of ids) {
  const out = `${OUT}/${id}.webp`;
  if (fs.existsSync(out)) { skipped++; done++; continue; }
  try {
    execSync(`magick "${idMap[id]}" -resize 400x500 -quality 80 "${out}"`);
  } catch (e) {
    console.error("thumb fail", id, e.message.split("\n")[0]);
  }
  if (++done % 500 === 0) console.log(`[THUMBS] ${done}/${ids.length} (skipped ${skipped})`);
}
console.log(`[THUMBS] DONE ${done}/${ids.length} written, ${skipped} pre-existing`);
