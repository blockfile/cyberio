// Front + rear riderless motorbike views for the s (toward viewer) / n (away) facings.
// Run: PL_TOKEN=<token> node scripts/genBikeFR.js   (skips existing)
const fs = require("fs");
const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

const COMMON = "a sleek matte-black cyberpunk sport motorbike, glowing cyan neon wheels and underglow, EMPTY seat NO rider no person, chunky pixel-art game sprite, clean transparent background";
const IMAGES = [
  ["bikeonly_sf", "front view " + COMMON + ", headlight and handlebars facing straight toward the viewer, front wheel pointing at camera", 84, 96, "high top-down"],
  ["bikeonly_nb", "rear view " + COMMON + ", seen directly from behind, red taillight and rear wheel facing the viewer", 84, 96, "high top-down"],
];

async function rpc(method, params) {
  const r = await fetch(EP, { method: "POST", headers: HEADERS, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  const txt = await r.text();
  return JSON.parse(txt.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join(""));
}
const textOf = (r) => (r.result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
const idOf = (r) => (textOf(r).match(/[0-9a-f-]{36}/) || [])[0] || null;
const imgOf = (r) => { for (const c of r.result?.content || []) if (c.type === "image" && c.data) return c.data; return null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ids = [];
  for (let i = 0; i < IMAGES.length; i++) {
    const [name, desc, w, h, view] = IMAGES[i];
    if (fs.existsSync(`public/citymap/assets/${name}.png`)) { ids[i] = null; console.log(`${name} skip`); continue; }
    const resp = await rpc("tools/call", { name: "create_map_object", arguments: { description: desc, width: w, height: h, view, outline: "single color outline", shading: "flat shading", detail: "low detail" } });
    ids[i] = idOf(resp); console.log(`${name}: ${ids[i] || "FAIL " + textOf(resp).slice(0, 80)}`);
    await sleep(2500);
  }
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue; const name = IMAGES[i][0];
    for (let a = 0; a < 32; a++) {
      await sleep(6000);
      const resp = await rpc("tools/call", { name: "get_map_object", arguments: { object_id: ids[i] } });
      const img = imgOf(resp);
      if (img) { fs.writeFileSync(`public/citymap/assets/${name}.png`, Buffer.from(img, "base64")); console.log(`${name} SAVED`); break; }
    }
  }
  console.log("ALL DONE");
})();
