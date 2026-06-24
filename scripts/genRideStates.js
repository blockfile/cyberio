// Generate "riding a motorbike" character STATES (PixelLab character API) for the 3 player chars,
// then download the 4 rotations into ride{N}_{s,e,n,w}.png.  Run: PL_TOKEN=<token> node scripts/genRideStates.js
const fs = require("fs");
const TOKEN = process.env.PL_TOKEN;
const EP = "https://api.pixellab.ai/mcp";
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const EDIT = "sitting on and riding a sleek black cyberpunk sport motorcycle with glowing cyan wheels, leaning forward gripping the handlebars, legs astride the bike";
const DMAP = { south: "s", east: "e", north: "n", west: "w" };
const CHARS = [
  { n: 1, src: "99b6fde2-21bc-4216-bb8d-6f33ec633bf8", state: "d8d01369-f1c1-4c13-895e-55aab9843995" }, // already made
  { n: 2, src: "1a7236be-e58e-4bd7-8ce3-88450d924a55", state: null },
  { n: 3, src: "1aad63e6-9f7a-46ef-b2e2-3908e1bc1378", state: null },
];

async function rpc(args) {
  const r = await fetch(EP, { method: "POST", headers: HEADERS, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: args }) });
  const txt = await r.text();
  return JSON.parse(txt.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join(""));
}
const textOf = (r) => { try { return r.result.content[0].text; } catch { return JSON.stringify(r); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. create states for chars that don't have one yet
  for (const c of CHARS) {
    if (c.state) { console.log(`char${c.n}: state exists ${c.state}`); continue; }
    const resp = await rpc({ name: "create_character_state", arguments: { character_id: c.src, edit_description: EDIT, use_color_palette_from_reference: false } });
    c.state = (textOf(resp).match(/id:\s*([0-9a-f-]{36})/) || [])[1] || null;
    console.log(`char${c.n}: created state ${c.state || "FAIL " + textOf(resp).slice(0, 100)}`);
    await sleep(3000);
  }
  // 2. poll each + download rotations
  for (const c of CHARS) {
    if (!c.state) continue;
    let done = false;
    for (let a = 0; a < 40 && !done; a++) {
      await sleep(7000);
      const t = textOf(await rpc({ name: "get_character", arguments: { character_id: c.state, include_preview: false } }));
      if (!/rotations:/.test(t)) { console.log(`char${c.n} poll ${a}: ${t.split("\n")[0]}`); continue; }
      const rots = [...t.matchAll(/(south|east|north|west):\s*(https:\/\/\S+\.png)/g)];
      for (const [, dir, url] of rots) {
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        fs.writeFileSync(`public/citymap/assets/ride${c.n}_${DMAP[dir]}.png`, buf);
      }
      console.log(`char${c.n}: SAVED ${rots.length} rotations -> ride${c.n}_{s,e,n,w}.png`);
      done = true;
    }
  }
  console.log("ALL DONE");
})();
