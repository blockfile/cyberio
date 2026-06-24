// Generate distinct HD docs illustrations + a wide scrolling city-lights strip.
// Run: PL_TOKEN=<token> node scripts/genDocsExtra.js   (skips files that already exist)
const fs = require("fs");

const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

// [name, description, width, height]
const IMAGES = [
  ["docs_islands", "two floating cyberpunk islands, a neon city island and a battle arena island, connected by a glowing energy bridge, night sky", 256, 168],
  ["docs_player", "cyberpunk hero character with a neon jacket and glowing visor, confident pose, full body", 200, 240],
  ["docs_market", "cyberpunk neon marketplace stall with floating holographic trading cards and price tags, vendor booth", 256, 168],
  ["docs_pass", "a glowing holographic dimension pass keycard with neon circuit patterns and a chip, floating, magenta and cyan", 248, 152],
  ["docs_vault", "cyberpunk treasury vault with a heavy neon-lit door and stacks of glowing gold coins", 256, 168],
  ["docs_strip", "long horizontal cyberpunk city skyline silhouette at night, dense rows of neon window lights, seamless wide banner", 384, 88],
  ["docs_card", "a single vertical collectible trading card, ornate glowing neon border frame, a cyberpunk character portrait inside the card art window, a power number badge in the corner, holographic Hearthstone-style card", 184, 256],
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
          outline: "selective outline", shading: "medium shading", detail: "high detail",
        },
      });
      ids[i] = idOf(resp);
      console.log(`${name} submitted: ${ids[i] || "FAIL"}`);
    } catch (e) { console.error(`${name} submit error:`, e.message); }
    await sleep(1800); // spacing avoids the rapid-submit rate limit
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
