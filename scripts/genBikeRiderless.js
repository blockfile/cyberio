// Generate a riderless cyberpunk motorbike (4 iso directions) → public/citymap/assets/bikeonly_<dir>.png
// The player's real character sprite gets composited on top later, so NO rider here.
// Run: PL_TOKEN=<token> node scripts/genBikeRiderless.js   (skips files that already exist)
const fs = require("fs");

const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

const BASE = "a sleek matte-black cyberpunk sport motorbike, glowing cyan neon wheels, rims and underglow, EMPTY seat with NO rider and no person, parked, chunky pixel-art game sprite";
const IMAGES = [
  ["bikeonly_s", BASE + ", front view, headlight facing toward the viewer", 96, 88],
  ["bikeonly_n", BASE + ", rear view seen from behind, red taillight", 96, 88],
  ["bikeonly_e", BASE + ", side profile view facing right", 112, 80],
  ["bikeonly_w", BASE + ", side profile view facing left", 112, 80],
];

async function rpc(method, params) {
  const r = await fetch(EP, { method: "POST", headers: HEADERS, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  const txt = await r.text();
  const data = txt.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
  return JSON.parse(data);
}
const textOf = (resp) => (resp.result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
const idOf = (resp) => (textOf(resp).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0] || null;
const imgOf = (resp) => { for (const c of resp.result?.content || []) if (c.type === "image" && c.data) return c.data; return null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!TOKEN) { console.error("PL_TOKEN missing"); process.exit(1); }
  const ids = [];
  for (let i = 0; i < IMAGES.length; i++) {
    const [name, desc, w, h] = IMAGES[i];
    if (fs.existsSync(`public/citymap/assets/${name}.png`)) { ids[i] = null; console.log(`${name} exists — skip`); continue; }
    try {
      const resp = await rpc("tools/call", {
        name: "create_map_object",
        arguments: {
          description: desc + ", clean transparent background",
          width: w, height: h, view: "side",
          outline: "single color outline", shading: "flat shading", detail: "low detail",
        },
      });
      ids[i] = idOf(resp);
      console.log(`${name} submitted: ${ids[i] || "FAIL"}`);
    } catch (e) { console.error(`${name} submit error:`, e.message); }
    await sleep(1800);
  }
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    const name = IMAGES[i][0];
    for (let a = 0; a < 32; a++) {
      await sleep(6000);
      try {
        const resp = await rpc("tools/call", { name: "get_map_object", arguments: { object_id: ids[i] } });
        const img = imgOf(resp);
        if (img) { fs.writeFileSync(`public/citymap/assets/${name}.png`, Buffer.from(img, "base64")); console.log(`${name} SAVED (${Buffer.from(img, "base64").length} bytes)`); break; }
        console.log(`${name} poll ${a}: ${textOf(resp).slice(0, 50).replace(/\n/g, " ")}`);
      } catch (e) { console.error(`${name} poll error:`, e.message); }
    }
  }
  console.log("ALL DONE");
})();
