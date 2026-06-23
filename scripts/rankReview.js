// The matcher flags most cards (badge artifacts inflate pixel-distance), so the raw
// needs-review.json isn't actionable. Rank by ambiguity (smallest margin between the
// top-2 prototype matches) and emit the worst N as a hand-fix shortlist.
const fs = require("fs");
const rev = JSON.parse(fs.readFileSync("scripts/needs-review.json", "utf8"));
const withMargin = rev.filter((r) => typeof r.margin === "number");
const ranked = withMargin.sort((a, b) => a.margin - b.margin || b.best - a.best);
const N = Math.min(500, ranked.length);
const top = ranked.slice(0, N).map((r) => ({ id: r.id, power: r.power, margin: r.margin }));
fs.writeFileSync("scripts/needs-review-top.json", JSON.stringify(top, null, 1));
console.log(`flagged total=${rev.length}; wrote ${N} most-ambiguous -> scripts/needs-review-top.json`);
