import React, { useState } from "react";
import "./world.css";

/* =========================================================================
   Cyber City — hand-authored isometric layout.
   Irregular blocks (varied sizes), wide arterial roads, a central roundabout,
   a dedicated cyberpunk park, street lamps + stoplights, waterfront on the SE.
   Layout is driven by the MAP string below (see legend). Keep plan.md updated.
   ========================================================================= */

const TW = 64, TH = 32, DW = 128, TILE_TOP = 47;
const OX = 1760, OY = 360;

const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;
const iso = (tx, ty) => ({ x: OX + (tx - ty) * TW, y: OY + (tx + ty) * TH });

/* ---- Layout map -----------------------------------------------------------
   One char per tile. Rows top→bottom = ty 0..GH-1, cols = tx 0..GW-1.
   Legend:
     .  building lot (sidewalk/plot — buildings sit here)
     #  road (asphalt + yellow dashes)
     +  road intersection / crosswalk
     O  roundabout ring road
     o  roundabout centre island
     P  park grass
     p  park path (grass + neon walk)
     ~  water        d  dock / pier        =  plaza
   Blocks are intentionally different sizes (highway feel). Roads are 2-wide
   arterials; the roundabout sits where the two main arterials cross.
--------------------------------------------------------------------------- */
const MAP = [
  "..........##........##........",
  "..........##........##......~~",
  "..........##........##.....~~~",
  "###+##....##....+###+##....d~~",
  "###+##....##....+###+##....dd~",
  "..........##........##.....dd~",
  "..........##.......OOOO....ddd",
  "..........##......OOooOO...=~~",
  "PPPPpPPPP.##......OOooOO...~~~",
  "PpppppppP.++######OOooOO##d~~~",
  "PPPPpPPPP.##......OOooOO...d~~",
  "PPPPpPPPP.##.......OOOO....dd~",
  "..........##........##.....dd~",
  "..........##........##.....dd~",
  "###+##....##....+###+##....d~~",
  "###+##....##....+###+##....d~~",
  "..........##........##.....~~~",
  "..........##........##......~~",
  "..........##........##.......~",
  ".....=====.##......##........",
  ".....=====.##......##........",
  ".....=====.##......##........",
  "..........##......##.........",
  "..........##......##.........",
];
const GH = MAP.length;
const GW = Math.max(...MAP.map((r) => r.length));
const cell = (tx, ty) => (MAP[ty] && MAP[ty][tx]) || ".";

/* tile chosen per cell. neighbour-aware for road orientation. */
const is = (tx, ty, set) => set.has(cell(tx, ty));
const ROADCH = new Set(["#", "+", "O", "o"]);

function tileFor(tx, ty) {
  const c = cell(tx, ty);
  switch (c) {
    case "~": return { name: "isn_water" };
    case "d": return { name: "isn_dock" };
    case "=": return { name: "isn_plaza" };
    case "P": return { name: "isn_park" };
    case "p": return { name: "isn_parkpath" };
    case "o": return { name: "isn_round_mid" };
    case "O": return { name: "isn_round" };
    case "+": return { name: "isn_wetcross" };
    case "#": {
      // vertical road if N or S is road, horizontal if E or W is road
      const vert = is(tx, ty - 1, ROADCH) || is(tx, ty + 1, ROADCH);
      const horiz = is(tx - 1, ty, ROADCH) || is(tx + 1, ty, ROADCH);
      if (vert && horiz) return { name: "isn_wetcross" };
      return horiz ? { name: "isn_wetroad", flip: true } : { name: "isn_wetroad" };
    }
    default: return { name: "isn_lot" };
  }
}

const floor = [];
for (let ty = 0; ty < GH; ty++)
  for (let tx = 0; tx < GW; tx++) {
    const { name, flip } = tileFor(tx, ty);
    const { x, y } = iso(tx, ty);
    floor.push({ key: `f${tx}-${ty}`, name, flip, left: x - DW / 2, top: y - TILE_TOP, z: tx + ty });
  }
floor.sort((a, b) => a.z - b.z);

/* ---- Buildings ------------------------------------------------------------
   2–3 buildings clustered per block. Each entry = {name, tx, ty}. Buildings
   render at NATIVE size; trimmed PNGs are bottom-flush + h-centred so the
   anchor math is exact. Anchor = footprint diamond centre (slightly forward).
--------------------------------------------------------------------------- */
const TALL = ["tower_future", "tower_hotel", "tower_cyber", "tower_beats", "tower_office_a",
  "tower_office_b", "data_tower", "tower_apt", "tower_indus", "tower_spiral",
  "tower_screen", "tower_red", "tower_green", "tower_pagoda", "tower_antenna"];
const SHORT = ["cyber_mall", "hospital", "hotel", "arcade", "police", "clinic", "ramen_court",
  "night_market", "cyber_cafe", "server_hall", "tech_shop", "weapon_market",
  "apartment_a", "apartment_b", "subway_hub", "taxi_hub"];
const LABELS = {
  tower_future: "Future Tower", tower_hotel: "Hotel Tower", tower_cyber: "Cyber Tower",
  tower_beats: "Beats Tower", tower_office_a: "Office Tower", tower_office_b: "Office Tower",
  data_tower: "Data Tower", tower_apt: "Apartments", tower_indus: "Industrial Tower",
  tower_spiral: "Spiral Tower", tower_screen: "Screen Tower", tower_red: "Red District",
  tower_green: "Biotech Tower", tower_pagoda: "Pagoda Tower", tower_antenna: "Comms Tower",
  cyber_mall: "Cyber Mall", hospital: "Hospital", hotel: "Hotel", arcade: "Arcade",
  police: "Police Station", clinic: "Clinic", ramen_court: "Ramen Street",
  night_market: "Night Market", cyber_cafe: "Cyber Cafe", server_hall: "Server Hall",
  tech_shop: "Tech Shop", weapon_market: "Weapon Market", apartment_a: "Apartments",
  apartment_b: "Apartments", subway_hub: "Subway Hub", taxi_hub: "Taxi Hub",
  landmark_a: "Landmark Tower", landmark_b: "Arcology", mega_hq: "Mega HQ", mega_mall: "Mega Mall",
};
const BUILDING = new Set([...TALL, ...SHORT, "landmark_a", "landmark_b", "mega_hq", "mega_mall"]);

// explicit, hand-placed clusters: 2–3 buildings on each lot block, centred on lots.
const BUILDINGS = [
  // ── NW block (top-left lots, tx 0-9 / ty 0-2 & 5-7) ──
  ["landmark_a", 5, 1], ["tower_cyber", 2, 1], ["tower_office_a", 8, 1],
  ["cyber_mall", 2, 6], ["tower_beats", 5, 6], ["hotel", 8, 6],
  // ── N-centre block (tx 12-17 / ty 0-2 & 5-7) ──
  ["tower_future", 13, 1], ["tower_hotel", 16, 1],
  ["arcade", 13, 6], ["tower_screen", 16, 6],
  // ── NE-ish lots near water (tx 22-25 / ty 0-2) ──
  ["data_tower", 22, 1], ["tower_spiral", 24, 1],
  // ── E block under roundabout-right (tx 22-25 / ty 8-12 mixed) ──  (kept off water)
  // ── W block (tx 0-9 / ty 13-18) ──
  ["police", 2, 14], ["tower_red", 5, 14], ["night_market", 8, 14],
  ["clinic", 2, 17], ["tower_green", 5, 17], ["tech_shop", 8, 17],
  // ── centre block (tx 12-17 / ty 13-18) ──
  ["tower_apt", 13, 14], ["server_hall", 16, 14],
  ["weapon_market", 13, 17], ["tower_indus", 16, 17],
  // ── SW lots (tx 0-9 / ty 22-23) ──
  ["apartment_a", 2, 22], ["cyber_cafe", 5, 22], ["apartment_b", 8, 22],
  // ── S-centre lots (tx 12-17 / ty 22-23) ──
  ["subway_hub", 13, 22], ["tower_pagoda", 16, 22],
  // ── SE lots (tx 22-25 / ty 14-18) ──
  ["landmark_b", 23, 15], ["taxi_hub", 22, 17], ["tower_antenna", 24, 17],
  ["ramen_court", 22, 22], ["hospital", 24, 22],
];

const objs = [];
let zc = 0;
const place = (name, tx, ty, w, kind = 2, dy = 0) => {
  const { x, y } = iso(tx, ty);
  objs.push({
    key: `${name}-${tx}-${ty}-${zc++}`, name, w, dy,
    fx: fxFor(name), label: BUILDING.has(name) ? LABELS[name] : null,
    ax: x, ay: y + TH + dy, z: 1000 + Math.round((tx + ty) * 10) + kind,
  });
};
function fxFor(n) {
  if (n === "fountain") return "anim";
  if (n === "street_lamp") return "lamp";
  if (n === "stoplight") return "stop";
  if (n === "flying_taxi") return "float";
  if (n === "hologram_sign" || n === "billboard_face" || n === "billboard_ad") return "flicker";
  if (TALL.includes(n) || n === "landmark_a" || n === "landmark_b") return "neon";
  return "";
}

for (const [n, tx, ty] of BUILDINGS) place(n, tx, ty, 0);

// roundabout centrepiece: a glowing landmark on the island
place("fountain", 20, 9, Math.round(DW * 1.0), 3);

// plaza greenery (SW small plaza ty19-21, tx5-9)
place("muted_tree", 5, 20, Math.round(DW * 0.5), 1);
place("muted_tree", 9, 20, Math.round(DW * 0.5), 1);
place("bench", 7, 19, Math.round(DW * 0.5), 3);

// park props (NW park, tx0-8 ty8-12)
place("park_tree", 1, 8, Math.round(DW * 0.85), 1);
place("park_tree", 7, 8, Math.round(DW * 0.85), 1);
place("park_tree", 1, 12, Math.round(DW * 0.85), 1);
place("park_tree", 7, 12, Math.round(DW * 0.85), 1);
place("park_pond", 4, 10, Math.round(DW * 1.1), 1);

// waterfront / industrial on the pier
place("dock_crane", 26, 4, Math.round(DW * 1.0), 2);
place("flying_taxi", 20, 6, Math.round(DW * 0.7), 3);

// street lamps along arterials (at lot corners next to roads — sparse, small)
const LAMPS = [[9, 2], [9, 13], [18, 2], [18, 13], [11, 8], [21, 2], [21, 13], [9, 5],
  [18, 5], [9, 16], [18, 16], [11, 13]];
for (const [tx, ty] of LAMPS) place("street_lamp", tx, ty, Math.round(DW * 0.2), 3);

// stoplights at the main intersections (small)
const STOPS = [[10, 9], [11, 9], [18, 3], [10, 3], [10, 14], [18, 14]];
for (const [tx, ty] of STOPS) place("stoplight", tx, ty, Math.round(DW * 0.22), 3);

objs.sort((a, b) => a.z - b.z);

export default function World() {
  const [active, setActive] = useState(null);
  return (
    <div className="world-viewport">
      <div className="world-sheen" />
      <header className="world-hud">
        <h1>CYBER CITY</h1>
        <span>{active || "click a building"}</span>
      </header>
      <div className="world-scene world-scene--big">
        {floor.map((t) => (
          <img key={t.key} className="world-floor" src={asset(t.name)} alt="" draggable={false}
            style={{ left: t.left, top: t.top, width: DW, zIndex: t.z, transform: t.flip ? "scaleX(-1)" : "none" }} />
        ))}
        {objs.map((o) => {
          const common = { left: o.ax, top: o.ay, zIndex: o.z };
          if (o.fx === "anim")
            return <div key={o.key} className="world-obj fountain-anim" style={{ ...common, backgroundImage: `url(${asset("fountain_anim")})` }} />;
          if (o.label)
            return (
              <button key={o.key} className={`world-obj world-building ${o.fx ? `fx-${o.fx}` : ""} ${active === o.label ? "is-active" : ""}`}
                style={common} title={o.label} onClick={() => setActive(o.label)}>
                <img src={asset(o.name)} alt={o.label} width={o.w || undefined} draggable={false} />
              </button>
            );
          return (
            <div key={o.key} className={`world-obj ${o.fx ? `fx-${o.fx}` : ""}`} style={common}>
              <img src={asset(o.name)} alt={o.name} width={o.w || undefined} draggable={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
