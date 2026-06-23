// Generate HD pixel-art encounter PLAYER portraits via PixelLab → public/citymap/assets/enc_player<N>.png
// Matches the 3 in-game player avatars (charId 1..3). Run: PL_TOKEN=<token> node scripts/genEncounterPlayers.js
const fs = require("fs");

const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

// matched to the existing player1..3 sprites
const PLAYERS = [
  "cyberpunk hero, short spiky silver-white hair, dark navy bomber jacket over black shirt, confident",
  "cyberpunk hero in dark purple hooded techwear armor, sleek masked, neon-violet accents",
  "cyberpunk hero, spiky electric-blue hair, red and black bomber jacket, fingerless gloves",
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
  for (let i = 0; i < PLAYERS.length; i++) {
    if (fs.existsSync(`public/citymap/assets/enc_player${i + 1}.png`)) { ids[i] = null; console.log(`player${i + 1} exists — skip`); continue; }
    try {
      const resp = await rpc("tools/call", {
        name: "create_map_object",
        arguments: {
          description: PLAYERS[i] + ", full-body standing character, clean transparent background",
          width: 180, height: 264, view: "side",
          outline: "selective outline", shading: "medium shading", detail: "high detail",
        },
      });
      ids[i] = idOf(resp);
      console.log(`player${i + 1} submitted: ${ids[i] || "FAIL"}`);
    } catch (e) { console.error(`player${i + 1} submit error:`, e.message); }
  }
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    for (let a = 0; a < 30; a++) {
      await sleep(6000);
      try {
        const resp = await rpc("tools/call", { name: "get_map_object", arguments: { object_id: ids[i] } });
        const img = imgOf(resp);
        if (img) { fs.writeFileSync(`public/citymap/assets/enc_player${i + 1}.png`, Buffer.from(img, "base64")); console.log(`player${i + 1} SAVED (${Buffer.from(img, "base64").length} bytes)`); break; }
        console.log(`player${i + 1} poll ${a}: ${textOf(resp).slice(0, 50).replace(/\n/g, " ")}`);
      } catch (e) { console.error(`player${i + 1} poll error:`, e.message); }
    }
  }
  console.log("ALL DONE");
})();
