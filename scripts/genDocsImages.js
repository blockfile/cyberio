// Generate HD pixel-art illustrations for the in-game Docs browser → public/citymap/assets/docs_<name>.png
// Run: PL_TOKEN=<token> node scripts/genDocsImages.js
const fs = require("fs");

const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

const IMAGES = [
  ["docs_city", "cyberpunk neon city skyline at night, tall glowing skyscrapers and holographic billboards, purple and cyan neon, detailed"],
  ["docs_arena", "futuristic cyberpunk duel arena platform with a glowing magenta energy portal and neon ring, dark sci-fi"],
  ["docs_card", "a glowing holographic trading card with a bright neon frame, cyberpunk, magenta and cyan glow, floating"],
  ["docs_coin", "a shiny golden crypto coin with a glowing neon C emblem, cyberpunk, sparkle highlights"],
  ["docs_robot", "a cyberpunk robot card-duelist character, sleek neon armor and glowing cyan visor, full body, confident pose"],
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
    const [name, desc] = IMAGES[i];
    if (fs.existsSync(`public/citymap/assets/${name}.png`)) { ids[i] = null; console.log(`${name} exists — skip`); continue; }
    try {
      const resp = await rpc("tools/call", {
        name: "create_map_object",
        arguments: {
          description: desc + ", clean transparent background",
          width: 256, height: 168, view: "side",
          outline: "selective outline", shading: "medium shading", detail: "high detail",
        },
      });
      ids[i] = idOf(resp);
      console.log(`${name} submitted: ${ids[i] || "FAIL"}`);
    } catch (e) { console.error(`${name} submit error:`, e.message); }
  }
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    const name = IMAGES[i][0];
    for (let a = 0; a < 30; a++) {
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
