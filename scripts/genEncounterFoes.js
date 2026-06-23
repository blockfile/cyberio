// Generate HD pixel-art encounter foe portraits via PixelLab → public/citymap/assets/enc_foe<N>.png
// Run: PL_TOKEN=<token> node scripts/genEncounterFoes.js
const fs = require("fs");

const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

// 6 distinct cyberpunk duelists (one per npcChar 1..6)
const FOES = [
  "cyberpunk street brawler, spiky neon-green mohawk, black leather jacket, glowing yellow visor",
  "cyberpunk hacker woman, long electric-blue ponytail, holographic teal jacket, cyber goggles",
  "augmented cyber bruiser, chrome robotic arm, bald head with magenta neon tattoos, sleeveless",
  "hooded netrunner in dark techwear cloak, glowing cyan face mask",
  "neon cyber-samurai, pink hair, glowing energy katana, sleek futuristic armor",
  "cyber rogue in a long trench coat, augmented glowing red eye, magenta neon highlights",
];

async function rpc(method, params) {
  const r = await fetch(EP, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
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
  for (let i = 0; i < FOES.length; i++) {
    if (fs.existsSync(`public/citymap/assets/enc_foe${i + 1}.png`)) { ids[i] = null; console.log(`foe${i + 1} exists — skip`); continue; }
    try {
      const resp = await rpc("tools/call", {
        name: "create_map_object",
        arguments: {
          description: FOES[i] + ", full-body standing character, clean transparent background",
          width: 180, height: 264, view: "side",
          outline: "selective outline", shading: "medium shading", detail: "high detail",
        },
      });
      ids[i] = idOf(resp);
      console.log(`foe${i + 1} submitted: ${ids[i] || "FAIL"}`);
    } catch (e) { console.error(`foe${i + 1} submit error:`, e.message); }
  }
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    for (let a = 0; a < 30; a++) {
      await sleep(6000);
      try {
        const resp = await rpc("tools/call", { name: "get_map_object", arguments: { object_id: ids[i] } });
        const img = imgOf(resp);
        if (img) {
          fs.writeFileSync(`public/citymap/assets/enc_foe${i + 1}.png`, Buffer.from(img, "base64"));
          console.log(`foe${i + 1} SAVED (${Buffer.from(img, "base64").length} bytes)`);
          break;
        }
        console.log(`foe${i + 1} poll ${a}: ${textOf(resp).slice(0, 50).replace(/\n/g, " ")}`);
      } catch (e) { console.error(`foe${i + 1} poll error:`, e.message); }
    }
  }
  console.log("ALL DONE");
})();
