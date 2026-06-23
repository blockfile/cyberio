// kNN badge-digit classifier. Isolation: fixed badge crop -> OTSU -> negate ->
// erase ring annulus (digit stays centered, no trim). Prototypes = hand-labeled ids 1-100.
// Modes:  node scripts/matchBadges.js loo     -> leave-one-out accuracy on labels
//         node scripts/matchBadges.js full    -> classify all 5000 -> cardMetadata.json
const { execSync } = require("child_process");
const fs = require("fs");

const idMap = JSON.parse(fs.readFileSync("scripts/_idmap.json", "utf8"));
const W = 64, H = 64, Np = W * H;
const CROP =
  `-gravity NorthEast -crop 200x200+138+87 +repage -colorspace Gray -normalize ` +
  `-auto-threshold OTSU -negate -fill none -stroke white -strokewidth 84 ` +
  `-draw "circle 100,100 100,-3" -resize ${W}x${H}! -threshold 50%`;

// hand-labeled badge values for ids 1-100 (read off scripts/_lab100.png)
const LABELS = {
  1:9,2:6,3:8,4:2,5:4,6:8,7:6,8:9,9:1,10:4,
  11:4,12:7,13:1,14:7,15:6,16:8,17:6,18:8,19:1,20:5,
  21:4,22:1,23:2,24:2,25:4,26:9,27:8,28:4,29:1,30:2,
  31:2,32:5,33:1,34:3,35:8,36:3,37:1,38:6,39:2,40:4,
  41:6,42:8,43:7,44:3,45:2,46:3,47:5,48:8,49:5,50:10,
  51:2,52:2,53:4,54:1,55:9,56:9,57:6,58:5,59:6,60:2,
  61:8,62:1,63:7,64:10,65:5,66:5,67:7,68:6,69:7,70:5,
  71:7,72:5,73:5,74:5,75:2,76:9,77:3,78:2,79:5,80:1,
  81:1,82:3,83:8,84:5,85:3,86:4,87:1,88:1,89:1,90:6,
  91:1,92:7,93:1,94:7,95:3,96:3,97:5,98:8,99:6,100:8,
};

const cache = {};
function bits(id) {
  if (cache[id]) return cache[id];
  execSync(`magick "${idMap[id]}" ${CROP} gray:scripts/_m.gray`);
  const b = fs.readFileSync("scripts/_m.gray");
  const a = new Uint8Array(Np);
  for (let i = 0; i < Np; i++) a[i] = b[i] < 128 ? 1 : 0;
  cache[id] = a;
  return a;
}
function dist(a, b) { let d = 0; for (let i = 0; i < Np; i++) if (a[i] !== b[i]) d++; return d; }
function rarityFor(p) { return p >= 9 ? "Legendary" : p >= 7 ? "Epic" : p >= 4 ? "Rare" : "Common"; }

const protoIds = Object.keys(LABELS).map(Number).filter((id) => idMap[id]);
const protos = protoIds.map((id) => ({ id, label: LABELS[id], v: bits(id) }));

// classify a bit-vector vs prototypes (optionally excluding one id for LOO). 3-NN vote.
function classify(a, excludeId) {
  const ds = [];
  for (const p of protos) { if (p.id === excludeId) continue; ds.push([dist(a, p.v), p.label]); }
  ds.sort((x, y) => x[0] - y[0]);
  const k = ds.slice(0, 3);
  const votes = {};
  for (const [d, lab] of k) votes[lab] = (votes[lab] || 0) + 1;
  let bestLab = k[0][1], bestVotes = 0;
  for (const lab in votes) if (votes[lab] > bestVotes) { bestVotes = votes[lab]; bestLab = +lab; }
  const margin = ds[1] ? ds[1][0] - ds[0][0] : 999;
  return { label: bestLab, best: ds[0][0], margin, agree: k.every((x) => x[1] === k[0][1]) };
}

const mode = process.argv[2] || "loo";

if (mode === "loo") {
  let ok = 0; const miss = [];
  for (const p of protos) {
    const r = classify(p.v, p.id);
    if (r.label === p.label) ok++; else miss.push(`${p.id}:g${r.label}/e${p.label}`);
  }
  console.log(`[LOO] accuracy ${ok}/${protos.length} = ${Math.round((100 * ok) / protos.length)}%`);
  console.log("[LOO] misses:", miss.join("  "));
} else {
  const ids = Object.keys(idMap).map(Number).sort((a, b) => a - b);
  const meta = {}, review = [];
  let done = 0;
  for (const id of ids) {
    let r;
    try { r = classify(bits(id), -1); } catch (e) { meta[id] = { name: `#${id}`, power: 1, rarity: "Common" }; review.push({ id, reason: "fail" }); continue; }
    const power = r.label;
    meta[id] = { name: `#${id}`, power, rarity: rarityFor(power) };
    if (r.best > Np * 0.22 || r.margin < Np * 0.03 || !r.agree || power === 10)
      review.push({ id, power, best: r.best, margin: r.margin });
    delete cache[id]; // free memory (keep prototypes cached separately? they're in protos.v)
    if (++done % 500 === 0) {
      fs.writeFileSync("server/util/cardMetadata.json", JSON.stringify(meta));
      fs.writeFileSync("scripts/needs-review.json", JSON.stringify(review, null, 1));
      console.log(`[MATCH] ${done}/${ids.length} review=${review.length}`);
    }
  }
  fs.writeFileSync("server/util/cardMetadata.json", JSON.stringify(meta));
  fs.writeFileSync("scripts/needs-review.json", JSON.stringify(review, null, 1));
  const hist = {}; for (const k in meta) hist[meta[k].power] = (hist[meta[k].power] || 0) + 1;
  console.log(`[MATCH] DONE cards=${Object.keys(meta).length} review=${review.length}`);
  console.log("[MATCH] power dist:", JSON.stringify(hist));
}
try { fs.unlinkSync("scripts/_m.gray"); } catch (e) {}
