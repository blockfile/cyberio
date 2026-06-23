import React, { useState, useRef, useCallback, useEffect, useContext } from "react";
import "./world.css";
import roadCellsList from "./road_cells.json";   // road layout (built by scripts/buildRoads.py)
import { WalletContext } from "../../context/WalletConnect";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../../config/endpoints";
import CyberLanding from "../pages/CyberLanding";
// in-world tool panels (open as HUD overlays when a building is clicked)
import Inventory from "../pages/inventory";
import Market from "../pages/market";
import DrawCard from "../pages/drawcard";
import Play from "../pages/play";
import EarnNpc from "../pages/EarnNpc";
import DimensionPassStore from "../pages/DimensionPassStore";
import ArenaMap from "./ArenaMap";
import { AnimatePresence } from "framer-motion";
import LoadingScreen, { PanelLoader } from "./LoadingScreen";
import MapStatusPanel from "./MapStatusPanel";

// HD background scenes for the transition loading screen
import lsCity from "../assets/images/bg.jpg";
import lsInv from "../assets/images/bg2.jpg";
import lsEarn from "../assets/images/bg3.jpg";
import lsDraw from "../assets/images/bg4.jpg";
import lsMarket from "../assets/images/market-bg.jpg";
import lsArena from "../assets/images/duelfield.jpg";

// which component each shop building opens (by SHOPS[].panel key)
const PANEL_COMP = {
  inventory: Inventory,
  market: Market,
  draw: DrawCard,
  play: Play,
  earn: EarnNpc,
  store: DimensionPassStore,
};

// per-destination loading-screen copy + theme (shown while the transition plays)
const PANEL_LOADING = {
  arena:     { label: "ENTERING THE ARENA",       sub: "Syncing duel grid…",       accent: "#c060ff", dur: 1300, bg: lsArena },
  play:      { label: "ENTERING DUEL",            sub: "Shuffling the decks…",     accent: "#c060ff", dur: 1100, bg: lsArena },
  inventory: { label: "ACCESSING INVENTORY",      sub: "Decrypting your cards…",   accent: "#49b6ff", dur: 1000, bg: lsInv },
  market:    { label: "ENTERING MARKETPLACE",     sub: "Loading listings…",        accent: "#ff5ea8", dur: 1000, bg: lsMarket },
  draw:      { label: "ENTERING CARD SHOP",       sub: "Booting the minter…",      accent: "#ffd24a", dur: 1000, bg: lsDraw },
  store:     { label: "ENTERING DIMENSION STORE", sub: "Opening the rift…",        accent: "#37e0a0", dur: 1000, bg: lsCity },
  earn:      { label: "LOADING EARN",             sub: "Matching opponents…",      accent: "#9b7bff", dur: 1000, bg: lsEarn },
};
const EXIT_LOADING = { label: "RETURNING TO THE CITY", sub: "Neo-Kyoto · Sector 7", accent: "#49b6ff", dur: 950, bg: lsCity };

// Dense waterfront cyber-city v3 — HD, ~2x size, big park, animated water.
const TW = 64, TH = 32, DW = 128, TILE_TOP = 47;
const OX = 2640, OY = 360;
const GW = 44, GH = 40;
const WATER_X0 = 39, DOCK_X = 38;          // bigger harbor on the SE
const PLAZA_C = [11, 11];                   // central plaza centre (fountain)

const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;

// road layout: exact set of road tiles drawn by buildRoads.py (arterials + S-bends +
// roundabout ring). Single source of truth so buildings never spawn on a road.
const ROAD_CELLS = new Set(roadCellsList);
const PIER = new Set(["39,18", "40,18", "39,19", "40,19", "41,19", "38,18", "38,19"]);

// central plaza (cols/rows 8-14)
// central fountain plaza (unchanged)
const PLAZA = new Set();
for (let tx = 8; tx < 15; tx++) for (let ty = 8; ty < 15; ty++) PLAZA.add(`${tx},${ty}`);

// HOLO PAD — the marked block directly S of the fountain plaza (the red-circled land):
// the block (cols 8-14, rows 17-23) PLUS the arterial road strip (rows 15-16) between
// it and the plaza, so the two blocks merge into one cleared open lot. Buildings &
// roads there are removed; the BIG hologram sits on it.
const HOLO_PAD = new Set();
const HP_X0 = 8, HP_X1 = 14, HP_Y0 = 15, HP_Y1 = 23;   // pad tile bounds (inclusive)
for (let tx = HP_X0; tx <= HP_X1; tx++) for (let ty = HP_Y0; ty <= HP_Y1; ty++) HOLO_PAD.add(`${tx},${ty}`);
const PLAZA_CTR = [(HP_X0 + HP_X1) / 2, (HP_Y0 + HP_Y1) / 2];   // true pad centre → [11,19]

// ROUNDABOUTS — circular roads baked into the connected road_overlay (scripts/buildRoads.py).
// Each entry = { c:[col,row], statue }. Centres MUST match ROUNDABOUTS in buildRoads.py.
// Here we mark the areas so (a) each centre island shows grass with its statue, and
// (b) no buildings spawn under any ring.
const RA_R = 6.0;                                  // clear radius (tiles) — no buildings here
const RA_ISLAND_R = 2.2;                           // island radius (grass) = RA_IN in builder
const ROUNDABOUTS = [
  { c: [24.5, 24.5], statue: "ra_monument" },      // centre — crystal obelisk
  { c: [15.5, 33.5], statue: "ra_statue2" },       // south  — bronze hero figure
  { c: [33.5, 33.5], statue: "ra_statue3" },       // SE     — chrome sphere
];
const raDistTo = (tx, ty, c) => Math.hypot(tx - c[0], ty - c[1]);
const inRoundabout = (tx, ty) => ROUNDABOUTS.some((r) => raDistTo(tx, ty, r.c) <= RA_R);
const inRaIsland = (tx, ty) => ROUNDABOUTS.some((r) => raDistTo(tx, ty, r.c) <= RA_ISLAND_R);

// big PARK landmark (cols 17-23, rows 8-14) — grass + paths, props added below
const PARK = new Set();
for (let tx = 17; tx < 24; tx++) for (let ty = 8; ty < 15; ty++) PARK.add(`${tx},${ty}`);
const PARK_PATH = new Set();              // a neon walkway cross through the park
for (let tx = 17; tx < 24; tx++) PARK_PATH.add(`${tx},11`);
for (let ty = 8; ty < 15; ty++) PARK_PATH.add(`20,${ty}`);

const TALL = ["tower_future","tower_hotel","tower_cyber","tower_beats","tower_office_a","tower_office_b",
  "data_tower","tower_apt","tower_indus","tower_spiral","tower_screen","tower_red","tower_green","tower_pagoda","tower_antenna",
  "tower_neon","tower_bank","office_glass"];
const SHORT = ["cyber_mall","hospital","hotel","arcade","police","clinic","ramen_court","night_market",
  "cyber_cafe","server_hall","tech_shop","weapon_market","apartment_a","apartment_b","subway_hub","taxi_hub",
  "club_neon","noodle_bar","capsule_hotel","market_hall","power_plant"];
// (x0,y0,x1,y1,mega). Roads occupy cols/rows {6,7,15,16}; plaza is cols/rows 8-14.
// Blocks live INSIDE the safe zones (cols 2-4 / 9-13 / 18-20, rows likewise) so every
// building lot keeps a 1-tile sidewalk gap from roads & plaza — nothing overhangs.
// Build blocks programmatically: the land is divided by 2-wide arterials at
// {6,7},{15,16},{24,25},{33,34}. Between them are 6-wide block bands starting at
// 0,8,17,26,35. Inside each band we build on the inner tiles (skip the 2 edge tiles
// nearest the roads → sidewalk). A block is dropped if it overlaps plaza/park/water.
const BAND0 = [0, 8, 17, 26, 35];          // band start cols/rows
const EDGE = 1;                             // keep blocks ≥1 tile from the map border
const BLOCKS = [];
for (const bx of BAND0)
  for (const by of BAND0) {
    let x0 = bx + 2, x1 = bx + 5, y0 = by + 2, y1 = by + 5;     // inset 2 from band edge
    // clamp inside the map border so no building hangs over the void
    x1 = Math.min(x1, GW - 1 - EDGE); y1 = Math.min(y1, GH - 1 - EDGE);
    x0 = Math.max(x0, EDGE); y0 = Math.max(y0, EDGE);
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    if (x1 >= WATER_X0 - 1) continue;                            // skip water side
    const inCore = x0 >= 8 && x1 <= 23 && y0 >= 8 && y1 <= 14;   // plaza/park core
    if (inCore) continue;
    BLOCKS.push([x0, y0, x1, y1, null]);
  }
const LABELS = {
  tower_future:"Future Tower",tower_hotel:"Hotel Tower",tower_cyber:"Cyber Tower",tower_beats:"Beats Tower",
  tower_office_a:"Office Tower",tower_office_b:"Office Tower",data_tower:"Data Tower",tower_apt:"Apartments",
  tower_indus:"Industrial Tower",tower_spiral:"Spiral Tower",tower_screen:"Screen Tower",tower_red:"Red District",
  tower_green:"Biotech Tower",tower_pagoda:"Pagoda Tower",tower_antenna:"Comms Tower",
  cyber_mall:"Cyber Mall",hospital:"Hospital",hotel:"Hotel",arcade:"Arcade",police:"Police Station",clinic:"Clinic",
  ramen_court:"Ramen Street",night_market:"Night Market",cyber_cafe:"Cyber Cafe",server_hall:"Server Hall",
  tech_shop:"Tech Shop",weapon_market:"Weapon Market",apartment_a:"Apartments",apartment_b:"Apartments",
  subway_hub:"Subway Hub",taxi_hub:"Taxi Hub",mega_mall:"Mega Mall",mega_hq:"Corporate HQ",
  tower_neon:"Neon Tower",tower_bank:"Bank Tower",office_glass:"Glass Offices",club_neon:"Neon Club",
  noodle_bar:"Noodle Bar",capsule_hotel:"Capsule Hotel",market_hall:"Market Hall",power_plant:"Power Station",
};
const BUILDING = new Set([...TALL, ...SHORT, "mega_mall", "mega_hq"]);

const iso = (tx, ty) => ({ x: OX + (tx - ty) * TW, y: OY + (tx + ty) * TH });
const fxFor = (n) => n === "fountain" ? "anim" : n === "street_lamp" ? "lamp" : n === "stoplight" ? "stop" : n === "flying_taxi" ? "float"
  : (n === "hologram_sign" || n === "billboard_face" || n === "billboard_ad") ? "flicker"
  : (TALL.includes(n) || n === "mega_mall" || n === "mega_hq"
     || n === "ra_monument" || n === "ra_statue2" || n === "ra_statue3") ? "neon" : "";

// a tile is a road if it's in the exported road layout (arterials + S-bends + ring)
const roadAt = (tx, ty) => {
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return false;
  return ROAD_CELLS.has(`${tx},${ty}`);
};

function tileFor(tx, ty) {
  const k = `${tx},${ty}`;
  if (PIER.has(k)) return { name: "isn_dock", flip: false };
  if (tx >= WATER_X0) return { name: "isn_water", flip: false };
  if (tx === DOCK_X) return { name: "isn_dock", flip: false };
  if (HOLO_PAD.has(k)) return { name: "isn_plaza", flip: false };   // cleared merged pad (road removed)
  if (PLAZA.has(k)) return { name: "isn_plaza", flip: false };
  if (PARK_PATH.has(k)) return { name: "isn_parkpath", flip: false };
  if (PARK.has(k)) return { name: "isn_park", flip: false };
  // roundabout centre islands are paved (no grass) — they show as pavement through the ring's
  // transparent hole, with the statue on top.
  // roads = single CONTINUOUS overlay built from HD asphalt+sidewalk textures, so it's
  // both HD-textured AND fully connected (no tile seams). Ground under it = pavement.
  return { name: "isn_pave", flip: false };
}

const floor = [];
for (let tx = 0; tx < GW; tx++)
  for (let ty = 0; ty < GH; ty++) {
    const { name, flip } = tileFor(tx, ty);
    const { x, y } = iso(tx, ty);
    // HOLO_PAD tiles render ABOVE the baked road overlay (z500) so the cleared pad shows
    // through. Roundabout islands are plain pavement that shows through the ring's hole at
    // the default z (no special handling needed).
    let z = tx + ty;
    if (HOLO_PAD.has(`${tx},${ty}`)) z = 550 + tx + ty;
    floor.push({ key: `f${tx}-${ty}`, name, flip, left: x - DW / 2, top: y - TILE_TOP, z });
  }
floor.sort((a, b) => a.z - b.z);

const objs = [];
const lightPools = [];     // glowing pools cast on the ground by street lamps
const occupied = new Set(); // integer tiles taken by a building/prop (so trees don't overlap)
const RA_ISLAND_PROPS = new Set(["ra_monument", "ra_statue2", "ra_statue3", "neon_tree", "muted_tree", "park_tree"]);
const place = (name, tx, ty, w, kind = 2, dy = 0) => {
  // never drop props/buildings onto the cleared hologram pad. For the roundabout, block the
  // ring-road annulus, but allow island props (monument/trees) on the centre grass island.
  if (HOLO_PAD.has(`${tx},${ty}`)) return;
  if (inRoundabout(tx, ty) && !(inRaIsland(tx, ty) && RA_ISLAND_PROPS.has(name))) return;
  // never put a street lamp on a road tile (it'd stand in the middle of the street)
  if (name === "street_lamp" && ROAD_CELLS.has(`${Math.round(tx)},${Math.round(ty)}`)) return;
  const { x, y } = iso(tx, ty);
  if (name === "street_lamp") {
    // light pool sits on the ground at the lamp's base, just in front of it
    lightPools.push({ key: `lp-${tx}-${ty}-${lightPools.length}`, x, y: y + TH, z: 600 + Math.round((tx + ty) * 10) });
  }
  // the fountain is centred on its tile (basin sits mid-tile); everything else is
  // anchored bottom-centre at the tile's bottom corner.
  const ay = name === "fountain" ? y + dy : y + TH + dy;
  objs.push({ key: `${name}-${tx}-${ty}-${objs.length}`, name, w, dy,
    fx: fxFor(name), label: BUILDING.has(name) ? LABELS[name] : null,
    ax: x, ay, z: 1000 + Math.round((tx + ty) * 10) + kind });
  if (Number.isInteger(tx) && Number.isInteger(ty)) occupied.add(`${tx},${ty}`);
};

// is tile (tx,ty) a road / plaza / park / water / roundabout (i.e. NOT a building lot)?
const isRoadCell = (tx, ty) =>
  tx >= WATER_X0 || tx === DOCK_X || PLAZA.has(`${tx},${ty}`) || PARK.has(`${tx},${ty}`) ||
  HOLO_PAD.has(`${tx},${ty}`) || inRoundabout(tx, ty) || ROAD_CELLS.has(`${tx},${ty}`);
// a lot tile is safe to build on only if it AND its 4 neighbours are not road/
// plaza — guarantees a 1-tile sidewalk so buildings never overhang the street.
const safeLot = (tx, ty) => {
  // stay off the outermost ring so wide sprites never hang over the map edge
  if (tx < 1 || ty < 1 || tx > GW - 2 || ty > GH - 2) return false;
  if (isRoadCell(tx, ty)) return false;
  return !(isRoadCell(tx + 1, ty) || isRoadCell(tx - 1, ty) ||
           isRoadCell(tx, ty + 1) || isRoadCell(tx, ty - 1));
};

// deterministic shuffled "bag" — draws each building once before any repeats, so
// neighbouring blocks don't show duplicates. Seeded so the layout is stable.
function makeBag(list, seed0) {
  let s = seed0, pool = [];
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const refill = () => {
    pool = [...list];
    for (let i = pool.length - 1; i > 0; i--) {           // Fisher–Yates
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  };
  return () => { if (!pool.length) refill(); return pool.pop(); };
}
const drawTall = makeBag(TALL, 7);
const drawShort = makeBag(SHORT, 99);

// place buildings on INTEGER tiles spread across the block, only on lots that keep
// a sidewalk gap from roads/plaza (no overhang). Buildings drawn from no-repeat bags.
function fillBlock(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, ncols = 3, nrows = 3;
  for (let r = 0; r < nrows; r++) {
    const cy = Math.round(y0 + (h * r) / (nrows - 1));
    for (let c = 0; c < ncols; c++) {
      const cx = Math.round(x0 + (w * c) / (ncols - 1));
      if (!safeLot(cx, cy)) continue;            // would overhang a road/plaza → skip
      if (occupied.has(`${cx},${cy}`)) continue; // a shop already claimed this lot
      const name = r === 0 ? drawTall() : drawShort();
      place(name, cx, cy, Math.round(DW * 1.4));
    }
  }
}

// ---- GAME SHOPS: labelled store-NPC buildings with a big neon billboard above them ----
// Each is clickable (opens a store panel). Placed BEFORE the random fill so they keep their lot.
const SHOPS = [
  { name: "STORE",       building: "tech_shop",   tx: 13, ty: 4,  color: "#37e0a0", panel: "store" },     // Dimensional Pass
  { name: "INVENTORY",   building: "server_hall", tx: 4,  ty: 13, color: "#49b6ff", panel: "inventory" }, // W of plaza
  { name: "MARKETPLACE", building: "cyber_mall",  tx: 19, ty: 18, color: "#ff5ea8", panel: "market" },    // SE near hub
  { name: "CARD SHOP",   building: "club_neon",   tx: 3,  ty: 3,  color: "#ffd24a", panel: "draw" },      // NW — draw/buy cards
  { name: "EARN",        building: "tower_bank",  tx: 29, ty: 3,  color: "#9b7bff", panel: "earn" },      // NE — play-to-earn
  // ARENA is a PORTAL at a road end (built below), not a building.
];
const shopSigns = [];
SHOPS.forEach((shop) => {
  const { x, y } = iso(shop.tx, shop.ty);
  // reserve the lot + its neighbours so the BIG shop has clear breathing room
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]])
    occupied.add(`${shop.tx + dx},${shop.ty + dy}`);
  const w = Math.round(DW * 2.5);                                // BIG — easy to spot
  objs.push({ key: `shop-${shop.name}`, name: shop.building, w, dy: 0,
    fx: "neon", label: shop.name, shop, ax: x, ay: y + TH,
    z: 1000 + Math.round((shop.tx + shop.ty) * 10) + 3 });
  shopSigns.push({ key: `sign-${shop.name}`, text: shop.name, color: shop.color,
    x, y: y + TH - Math.round(w * 1.4), z: 6000 + (shop.tx + shop.ty) });
});

// ---- ARENA PORTAL: a glowing gateway at the SOUTH end of the central arterial (cols 15-16).
// Clicking it opens the duel. The OTHER road exits are capped with barricades below.
const ARENA_PORTAL = (() => {
  const tx = 15.5, ty = 38;                       // end of the central road, near the front (south) edge
  const { x, y } = iso(tx, ty);
  const w = Math.round(DW * 2.0);
  objs.push({ key: "arena-portal", name: "portal", w, dy: 0, fx: "portal",
    label: "ARENA", shop: { name: "ARENA", panel: "arena", color: "#c060ff" },
    ax: x, ay: y + TH, z: 9000 });
  shopSigns.push({ key: "sign-ARENA", text: "ARENA", color: "#c060ff",
    x, y: y + TH - Math.round(w * 1.15), z: 9500 });
  return { tx, ty };
})();

// ---- close every OTHER road exit at the map edges with a neon barricade ----
const ROAD_EXITS = [
  [6.5, 0], [15.5, 0], [24.5, 0], [33.5, 0],                 // top edge
  [6.5, 39], [24.5, 39], [33.5, 39],                         // bottom edge (skip 15.5 = ARENA portal)
  [0, 6.5], [0, 15.5], [0, 24.5], [0, 33.5],                 // left edge
  // right edge (tx≥39) is the harbor/water — no road exits there, so no barricades
];
ROAD_EXITS.forEach(([tx, ty]) => {
  const { x, y } = iso(tx, ty);
  objs.push({ key: `barr-${tx}-${ty}`, name: "barricade", w: Math.round(DW * 1.15), dy: 0,
    fx: null, label: null, ax: x, ay: y + TH, z: 2600 + Math.round((tx + ty) * 5) });
});

// interactables the avatar must be NEAR to use (shops need a click; the portal triggers on touch)
const INTERACTABLES = [
  ...SHOPS.map((s) => ({ key: `shop-${s.name}`, name: s.name, panel: s.panel,
    color: s.color, tx: s.tx, ty: s.ty, range: 3.4 })),
  { key: "arena-portal", name: "ARENA", panel: "arena", color: "#c060ff",
    tx: ARENA_PORTAL.tx, ty: ARENA_PORTAL.ty, range: 2.0, portal: true },
];

BLOCKS.forEach(([x0, y0, x1, y1], i) => {
  fillBlock(x0, y0, x1, y1);
  // fewer street lamps: one per every other block (was two per block)
  if (i % 2 === 0) place("street_lamp", x0, y0, Math.round(DW * 0.4), 3);
});

// ---- each roundabout centre island: just its glowing statue, centred on the paved island ----
for (const { c, statue } of ROUNDABOUTS) {
  place(statue, c[0], c[1], Math.round(DW * 1.6), 3);             // statue dead-centre, no greenery
}

// ---- central fountain plaza centrepiece + greenery (unchanged) ----
place("fountain", 11, 11, Math.round(DW * 2.2), 3);
place("stairs", 11, 13, Math.round(DW * 0.8), 3); place("stairs", 12, 9, Math.round(DW * 0.8), 3);
place("bench", 9, 9, Math.round(DW * 0.5), 3); place("bench", 13, 13, Math.round(DW * 0.5), 3);
place("muted_tree", 9, 13, Math.round(DW * 0.5), 1); place("muted_tree", 13, 9, Math.round(DW * 0.5), 1);

// ---- BIG hologram on the cleared HOLO_PAD (rendered as a CSS sprite element below) ----
const HOLO = (() => { const { x, y } = iso(PLAZA_CTR[0], PLAZA_CTR[1]); return { x, y: y + TH }; })();

// ---- modern fence ring around the whole holo pad (single clean diamond overlay) ----
// Built by scripts/buildHoloFence.py from the HP_* bounds; re-run that if the pad moves.
const HOLO_FENCE = { left: 1576, top: 998, z: 940 };

// ---- BIG PARK (cols 17-23, rows 8-14): trees, pond, benches, lamps ----
place("park_pond", 21, 12, Math.round(DW * 1.4), 1);
for (const [tx, ty] of [[18, 9], [22, 9], [18, 13], [22, 13], [19, 10], [21, 13]])
  place("park_tree", tx, ty, Math.round(DW * 0.85), 1);
place("bench", 18, 11, Math.round(DW * 0.5), 3); place("bench", 22, 11, Math.round(DW * 0.5), 3);
for (const [tx, ty] of [[17, 8], [23, 8], [17, 14], [23, 14]])
  place("street_lamp", tx, ty, Math.round(DW * 0.38), 3);

// ---- waterfront / industrial on the bigger pier (SE) ----
place("dock_crane", 39, 18, Math.round(DW * 1.0), 2);
place("pipes", 37, 20, Math.round(DW * 1.05), 2);
place("billboard_face", 36, 30, Math.round(DW * 1.25), 2);
// roadside props
place("hologram_sign", 7, 11, Math.round(DW * 0.7), 3);
place("flying_taxi", 11, 6, Math.round(DW * 0.7), 3);
place("subway_entrance", 3, 30, Math.round(DW * 0.8), 3);

// ---- scatter trees + street accessories across the map (deterministic) ----
// Eligible = inside the border, not a road/water/landmark, and not already occupied — i.e.
// the sidewalks and little gaps between buildings. Seeded RNG → stable layout.
// weighted mix (repeats = higher chance) — biased toward colourful blossoms + palms
const TREE_KINDS = [
  "blossom_tree", "blossom_tree", "blossom_tree", "blossom_tree",   // lots of pink
  "cyber_palm", "cyber_palm", "cyber_palm",                          // teal neon palms
  "neon_tree", "neon_tree", "park_tree", "muted_tree", "pine_tree", "bush",
];
const treeScale = (k) =>
  k === "bush" ? 0.55 : (k === "cyber_palm" || k === "pine_tree") ? 0.95 : 0.82;  // bigger trees
const decoEligible = (tx, ty) =>
  tx >= 1 && ty >= 1 && tx <= GW - 2 && ty <= GH - 2 &&
  !isRoadCell(tx, ty) && !occupied.has(`${tx},${ty}`);
const nextToRoad = (tx, ty) =>
  ROAD_CELLS.has(`${tx + 1},${ty}`) || ROAD_CELLS.has(`${tx - 1},${ty}`) ||
  ROAD_CELLS.has(`${tx},${ty + 1}`) || ROAD_CELLS.has(`${tx},${ty - 1}`);
// ---- traffic stop lights at a sparse set of intersection corners (claimed before trees) ----
const isXCorner = (tx, ty) =>
  (ROAD_CELLS.has(`${tx + 1},${ty}`) || ROAD_CELLS.has(`${tx - 1},${ty}`)) &&
  (ROAD_CELLS.has(`${tx},${ty + 1}`) || ROAD_CELLS.has(`${tx},${ty - 1}`));
let sseed = 73145;
const srnd = () => (sseed = (sseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let tx = 1; tx < GW - 1; tx++)
  for (let ty = 1; ty < GH - 1; ty++) {
    if (!decoEligible(tx, ty) || !isXCorner(tx, ty)) continue;
    if (srnd() < 0.3) {
      place("stoplight", tx, ty, Math.round(DW * 0.42), 3);
      occupied.add(`${tx},${ty}`);
    }
  }

let dseed = 20260621;
const drnd = () => (dseed = (dseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let tx = 1; tx < GW - 1; tx++)
  for (let ty = 1; ty < GH - 1; ty++) {
    if (!decoEligible(tx, ty)) continue;
    const r = drnd();
    if (r < 0.48) {                                              // much denser tree cover
      const kind = TREE_KINDS[Math.floor(drnd() * TREE_KINDS.length)];
      place(kind, tx, ty, Math.round(DW * treeScale(kind)), 1);
      occupied.add(`${tx},${ty}`);                              // keep big canopies from stacking
    } else if (r < 0.54 && nextToRoad(tx, ty)) {
      place("bench", tx, ty, Math.round(DW * 0.55), 3);         // benches line the sidewalks
    } else if (r < 0.56 && nextToRoad(tx, ty)) {
      place("vending_machines", tx, ty, Math.round(DW * 0.55), 3);
    }
  }

objs.sort((a, b) => a.z - b.z);

// ---- NPCs: cyberpunk pedestrians (6 characters × 4 facings: s/e/n/w) ----
// Standby NPCs loiter (subtle idle sway); walkers stream along the avenues (footstep bob +
// a position loop that fades at the ends so the wrap is hidden). Sprites face their movement.
const npcStand = [];
const addStand = (n, d, tx, ty) => {
  const { x, y } = iso(tx, ty);
  npcStand.push({ key: `ns${npcStand.length}`, src: `npc${n}_${d}`, x, y: y + TH,
    z: 1000 + Math.round((tx + ty) * 10) + 6 });
};
// plaza loiterers
addStand(1, "s", 9, 12); addStand(2, "e", 12, 9); addStand(6, "s", 13, 12); addStand(4, "w", 10, 10);
// crowd watching the hologram (on the holo pad)
addStand(3, "n", 10, 21); addStand(5, "s", 12, 21); addStand(2, "n", 11, 20); addStand(6, "n", 13, 22);
// park goers
addStand(1, "s", 18, 13); addStand(4, "e", 22, 10); addStand(5, "w", 20, 13);
// roundabout sidewalks
addStand(4, "s", 16, 30); addStand(1, "e", 33, 30); addStand(3, "s", 24, 29);

// walkable = ground a pedestrian may stand on (the COLLISION map): not water/dock, not a
// building/tree/prop (occupied), not the fenced holo pad, not a roundabout island. Roads,
// plaza, park grass, sidewalks and empty lots are walkable.
const isWalkable = (tx, ty) => {
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return false;
  if (tx >= WATER_X0 || tx === DOCK_X) return false;
  if (HOLO_PAD.has(`${tx},${ty}`)) return false;
  if (inRaIsland(tx, ty)) return false;
  return !occupied.has(`${tx},${ty}`);
};
// spawn wandering pedestrians on walkable ROAD tiles
const WALK_SPAWN = [];
for (let tx = 0; tx < GW; tx++) for (let ty = 0; ty < GH; ty++)
  if (ROAD_CELLS.has(`${tx},${ty}`) && isWalkable(tx, ty)) WALK_SPAWN.push([tx, ty]);

// BFS shortest path on the walkable grid (for click-to-move). Returns the tiles to step
// through (excluding the start, including the target), or [] if blocked/unreachable.
function findPath(sx, sy, dx, dy) {
  if (!isWalkable(dx, dy) || (sx === dx && sy === dy)) return [];
  const key = (x, y) => x + "," + y;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]]; let head = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < q.length) {
    const [cx, cy] = q[head++];
    if (cx === dx && cy === dy) break;
    for (const [ox, oy] of DIRS) {
      const nx = cx + ox, ny = cy + oy, k = key(nx, ny);
      if (prev.has(k) || !isWalkable(nx, ny)) continue;
      prev.set(k, [cx, cy]); q.push([nx, ny]);
    }
  }
  if (!prev.has(key(dx, dy))) return [];
  const path = []; let cur = [dx, dy];
  while (cur && !(cur[0] === sx && cur[1] === sy)) { path.push(cur); cur = prev.get(key(cur[0], cur[1])); }
  return path.reverse();
}
let aseed = 1337;
const ar = () => (aseed = (aseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const NPC_WALK_CHARS = [1, 2, 3, 4, 5, 6];   // characters that have walk-cycle sheets
const N_WANDER = 30;
const npcAgents = [];
for (let i = 0; i < N_WANDER; i++) {
  const [tx, ty] = WALK_SPAWN[Math.floor(ar() * WALK_SPAWN.length)];
  npcAgents.push({ char: NPC_WALK_CHARS[Math.floor(ar() * NPC_WALK_CHARS.length)],
    tx, ty, speed: 0.85 + ar() * 1.0 });     // tiles/sec — some stroll, some hurry
}
// shop "doorstep" tiles = nearest walkable tile to each shop; ~1/3 of pedestrians are
// shoppers who path toward a shop, browse, then move on — feels like customers.
const SHOP_DOORS = SHOPS.map((s) => {
  for (let r = 2; r <= 5; r++)
    for (const [dx, dy] of [[0, r], [r, 0], [0, -r], [-r, 0], [r, r], [-r, -r], [r, -r], [-r, r]])
      if (isWalkable(s.tx + dx, s.ty + dy)) return [s.tx + dx, s.ty + dy];
  return [s.tx, s.ty];
});
for (let i = 0; i < npcAgents.length; i++)
  if (i % 3 === 0) npcAgents[i].target = SHOP_DOORS[i % SHOP_DOORS.length];

const SCENE_W = 5500, SCENE_H = 3160;

export default function World() {
  const [active, setActive] = useState(null);
  const [shop, setShop] = useState(null);       // open store-NPC panel (Store/Inventory/Marketplace)
  // HD transition overlay: { label, sublabel, accent, dur, bg }. On a refresh that will restore
  // the arena, show the loader immediately so the city never flashes before the arena pops in.
  const [loading, setLoading] = useState(() => {
    try {
      if (sessionStorage.getItem("cyb_view") === "arena")
        return { mini: false, label: "RESTORING ARENA", sublabel: "Reconnecting…", accent: "#c060ff", dur: 1200, bg: lsArena };
    } catch (e) { /* ignore */ }
    return null;
  });
  const [superseded, setSuperseded] = useState(false); // this wallet became active in another tab
  // Lite FX: weak/flickering GPUs can disable the heavy blend/blur/glow effects (persisted per device)
  const [liteFx, setLiteFx] = useState(() => {
    try { return localStorage.getItem("cyb_lite_fx") === "1"; } catch (e) { return false; }
  });
  useEffect(() => {
    document.body.classList.toggle("lite-fx", liteFx);
    try { localStorage.setItem("cyb_lite_fx", liteFx ? "1" : "0"); } catch (e) { /* ignore */ }
  }, [liteFx]);
  const loadingRef = useRef(false);             // freezes movement while a transition plays
  const [view, setView] = useState({ s: 0.5, x: 0, y: 0 });

  // Transition to a destination. The arena map jump (and exit to city) gets the full
  // cinematic LoadingScreen; tool panels get a quick PanelLoader (animated icon only).
  const transitionTo = useCallback((target) => {
    if (loadingRef.current) return;
    const isFull = !target || target.panel === "arena" || target.panel === "play";
    const meta = target
      ? (PANEL_LOADING[target.panel] || {
          label: `ENTERING ${target.name || ""}`.trim(),
          sub: "", accent: target.color || "#49b6ff", dur: 1000, bg: lsCity,
        })
      : EXIT_LOADING;
    const sublabel =
      target && target.panel === "play" && target.name ? target.name : meta.sub;
    const dur = isFull ? meta.dur : 820;
    loadingRef.current = true;
    setLoading({
      mini: !isFull,
      label: meta.label, sublabel,
      accent: meta.accent, dur, bg: meta.bg,
    });
    window.setTimeout(() => {
      setShop(target);
      loadingRef.current = false;
      window.setTimeout(() => setLoading(null), isFull ? 420 : 200);
    }, dur);
  }, []);
  const drag = useRef(null);
  const movedRef = useRef(false);
  const walkRefs = useRef([]);                   // dom nodes for the wandering NPCs
  const sceneRef = useRef(null);                 // the scene element (camera follows the player)
  const playerRef = useRef(null);                // the controllable avatar
  const destRef = useRef(null);                  // click-to-move destination marker
  const keysRef = useRef(new Set());
  const pathRef = useRef([]);                    // current click-to-move path (scene waypoints)
  const playerPosRef = useRef(null);             // live player position (for click pathfinding)
  const socketRef = useRef(null);                // socket.io connection (multiplayer presence)
  const remotesRef = useRef(new Map());          // id -> other connected players' live state
  const remoteNodes = useRef({});                // id -> dom node for each remote avatar
  const [nearKeys, setNearKeys] = useState(() => new Set()); // interactables in reach of the avatar
  // (dueling lives only on the ARENA map — the city/Earn map has no duel HUD)
  const shopRef = useRef(null);                  // current open panel (read inside the rAF loop)
  const nearKeysRef = useRef("");                // signature of last in-range set (avoid re-renders)
  const portalArmedRef = useRef(true);           // re-arm portal transport when leaving its range
  const [remoteIds, setRemoteIds] = useState([]);// which remote players to render
  const [presenceConnected, setPresenceConnected] = useState(false);
  const sRef = useRef(view.s);
  useEffect(() => { sRef.current = view.s; }, [view.s]);

  // connected wallet → the player's chosen character becomes a controllable avatar
  const walletCtx = useContext(WalletContext) || {};
  const connected = !!walletCtx.wallet;
  const walletAddr = walletCtx.wallet ? String(walletCtx.wallet) : "";
  const shortAddr = walletAddr ? `${walletAddr.slice(0, 4)}…${walletAddr.slice(-4)}` : "";

  // ---- session persistence: remember city/arena so a browser refresh restores it (per-tab) ----
  const initialViewRef = useRef(null);
  if (initialViewRef.current === null) {
    try { initialViewRef.current = sessionStorage.getItem("cyb_view") || ""; }
    catch (e) { initialViewRef.current = ""; }
  }
  const viewWriteRef = useRef(false);
  useEffect(() => {
    if (!viewWriteRef.current) { viewWriteRef.current = true; return; } // skip mount so restore isn't clobbered
    try {
      sessionStorage.setItem("cyb_view", shop?.panel === "arena" ? "arena" : "city");
      if (shop?.panel !== "arena") sessionStorage.removeItem("cyb_arena");
    } catch (e) { /* ignore */ }
  }, [shop]);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !connected) return;
    restoredRef.current = true;
    if (initialViewRef.current === "arena") {
      setShop({ name: "ARENA", panel: "arena", color: "#c060ff" }); // reopen the arena under the loader
      window.setTimeout(() => setLoading(null), 700);                // then fade the restore loader out
    } else {
      setLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  // safety: never trap on the restore loader if the wallet never reconnects
  useEffect(() => {
    if (initialViewRef.current !== "arena") return;
    const t = window.setTimeout(() => setLoading(null), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [charId, setCharId] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("CYBERIO_CHAR")) || "1"
  );
  const pickChar = (id) => {
    setCharId(id);
    try { localStorage.setItem("CYBERIO_CHAR", id); } catch (e) { /* ignore */ }
  };
  useEffect(() => { shopRef.current = shop; }, [shop]);   // live panel state for the rAF loop

  // NPC engine: each agent walks tile-to-tile, only onto WALKABLE tiles (collisions),
  // picking a new direction at each tile (prefers going straight). Positions are written
  // straight to the DOM each frame (no React re-render) for performance.
  useEffect(() => {
    const DIRS = [[1, 0, "e"], [-1, 0, "w"], [0, 1, "s"], [0, -1, "n"]];
    const G = npcAgents.map((a, i) => {
      const el = walkRefs.current[i];
      return { ...a, ntx: a.tx, nty: a.ty, t: Math.random(), dir: "s", _dir: null,
        el, sprite: el ? el.firstChild : null };
    });
    const pick = (g) => {
      const opts = DIRS.filter(([dx, dy]) => isWalkable(g.tx + dx, g.ty + dy));
      if (!opts.length) { g.ntx = g.tx; g.nty = g.ty; return; }
      if (g.target) {
        const [gx, gy] = g.target;
        if (Math.abs(g.tx - gx) + Math.abs(g.ty - gy) <= 1) {        // reached the shop
          g.pauseUntil = performance.now() + 1800 + Math.random() * 2600;
          g.target = SHOP_DOORS[(Math.random() * SHOP_DOORS.length) | 0];
          g.ntx = g.tx; g.nty = g.ty; return;                        // stop & browse
        }
        if (Math.random() < 0.82) {                                  // greedy step toward shop
          let best = opts[0], bd = Infinity;
          for (const o of opts) {
            const d = Math.abs(g.tx + o[0] - gx) + Math.abs(g.ty + o[1] - gy);
            if (d < bd) { bd = d; best = o; }
          }
          g.ntx = g.tx + best[0]; g.nty = g.ty + best[1]; g.dir = best[2]; return;
        }
      }
      const straight = opts.find(([, , dd]) => dd === g.dir);
      const c = straight && Math.random() < 0.72 ? straight : opts[(Math.random() * opts.length) | 0];
      g.ntx = g.tx + c[0]; g.nty = g.ty + c[1]; g.dir = c[2];
    };
    G.forEach(pick);
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const g of G) {
        if (!g.el) continue;
        const paused = g.pauseUntil && now < g.pauseUntil;
        if (paused) {
          if (!g._p) { g._p = true; if (g.sprite) g.sprite.style.animationPlayState = "paused"; }
        } else {
          if (g._p) { g._p = false; if (g.sprite) g.sprite.style.animationPlayState = "running"; }
          g.t += g.speed * dt;
          let guard = 0;
          while (g.t >= 1 && guard++ < 4) { g.tx = g.ntx; g.ty = g.nty; g.t -= 1; pick(g); }
        }
        const fx = g.tx + (g.ntx - g.tx) * g.t, fy = g.ty + (g.nty - g.ty) * g.t;
        const p = iso(fx, fy);
        g.el.style.transform = `translate3d(${p.x}px, ${p.y + TH}px, 0)`;
        const z = 1000 + Math.round((fx + fy) * 10) + 6;
        if (g._z !== z) { g._z = z; g.el.style.zIndex = z; }   // only touch zIndex on change
        if (g.sprite && g._dir !== g.dir) {
          g._dir = g.dir;
          g.sprite.style.backgroundImage = `url(${asset("npc" + g.char + "_walk_" + g.dir)})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ---- random speech bubbles above NPC heads (sometimes) ----
    const LINES = ["Choom!", "Got eddies?", "Preem!", "Nice chrome.", "Stay frosty.", "Watch it!",
      "Delta outta here.", "Neon never sleeps.", "Eyes up, samurai.", "Nova!", "Move, gonk!",
      "Hey choom!", "Need a ripper?", "So preem.", "Nice optics.", "Chipped in?", "...",
      "To the market!", "Wakey wakey.", "Flatline 'em."];
    const bubbleTimers = [];
    const talk = setInterval(() => {
      if (Math.random() < 0.35) return;                              // not every tick
      if (document.querySelectorAll(".npc-bubble.show").length >= 6) return;
      const free = document.querySelectorAll(".npc-bubble:not(.show)");
      if (!free.length) return;
      const b = free[(Math.random() * free.length) | 0];
      b.textContent = LINES[(Math.random() * LINES.length) | 0];
      b.classList.add("show");
      bubbleTimers.push(setTimeout(() => b.classList.remove("show"), 2200 + Math.random() * 1700));
    }, 650);

    return () => { cancelAnimationFrame(raf); clearInterval(talk); bubbleTimers.forEach(clearTimeout); };
  }, []);

  // ---- PLAYER: WASD-controlled avatar for the connected wallet's chosen character ----
  // Free 2D movement with tile-based collision (same walkable grid), directional walk
  // sprite, and a camera that follows the avatar. Driven straight to the DOM (no re-render).
  useEffect(() => {
    if (!connected) return;
    // spawn on the walkable road tile nearest the plaza centre
    let sx = 11, sy = 11, best = 1e9;
    for (const [tx, ty] of WALK_SPAWN) {
      const d = Math.abs(tx - 11) + Math.abs(ty - 11);
      if (d < best) { best = d; sx = tx; sy = ty; }
    }
    const s0 = iso(sx, sy);
    const P = { x: s0.x, y: s0.y + TH, dir: "s", _dir: null, _mv: null };
    playerPosRef.current = P;                          // live position for click pathfinding
    const el = playerRef.current;
    const sprite = el && el.firstChild;
    const SPEED = 165;                                  // scene px / sec
    const sceneWalkable = (x, y) => {
      const txf = ((x - OX) / TW + (y - TH - OY) / TH) / 2;
      const tyf = ((y - TH - OY) / TH - (x - OX) / TW) / 2;
      return isWalkable(Math.round(txf), Math.round(tyf));
    };
    const KEY = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const kd = (e) => { const m = KEY[e.code]; if (m) { e.preventDefault(); keysRef.current.add(m); } };
    const ku = (e) => { const m = KEY[e.code]; if (m) keysRef.current.delete(m); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (shopRef.current || loadingRef.current) { raf = requestAnimationFrame(loop); return; } // frozen while a HUD/arena/transition is open
      const k = keysRef.current;
      let dx = 0, dy = 0;
      if (k.has("up")) dy -= 1; if (k.has("down")) dy += 1;
      if (k.has("left")) dx -= 1; if (k.has("right")) dx += 1;
      let moving = false;
      if (dx || dy) {                                  // WASD takes over (cancels any path)
        pathRef.current = [];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const nx = P.x + dx * SPEED * dt, ny = P.y + dy * SPEED * dt;
        if (sceneWalkable(nx, P.y)) P.x = nx;          // axis-separated collision
        if (sceneWalkable(P.x, ny)) P.y = ny;
        P.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n");
        moving = true;
      } else if (pathRef.current.length) {             // click-to-move: follow the path
        const wp = pathRef.current[0];
        let vx = wp.x - P.x, vy = wp.y - P.y; const d = Math.hypot(vx, vy);
        if (d < 4) { pathRef.current.shift(); }
        else {
          vx /= d; vy /= d;
          P.x += vx * SPEED * dt; P.y += vy * SPEED * dt;
          P.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "e" : "w") : (vy > 0 ? "s" : "n");
          moving = true;
        }
      }
      // destination marker (visible while a path is active) — positioned via left/top so
      // its CSS pulse (transform) isn't clobbered
      if (destRef.current) {
        const path = pathRef.current;
        if (path.length) {
          const last = path[path.length - 1];
          destRef.current.style.left = `${last.x}px`;
          destRef.current.style.top = `${last.y}px`;
          destRef.current.style.opacity = "1";
        } else destRef.current.style.opacity = "0";
      }
      P.moving = moving;                               // exposed for multiplayer broadcast
      if (el) {
        if (P._wx !== P.x || P._wy !== P.y) {            // only write when the avatar actually moved
          P._wx = P.x; P._wy = P.y;
          el.style.transform = `translate3d(${P.x}px, ${P.y}px, 0)`;
          const pz = 1000 + Math.round(((P.y - TH - OY) / TH) * 10) + 7;
          if (P._z !== pz) { P._z = pz; el.style.zIndex = pz; }
        }
        if (sprite) {
          if (P._dir !== P.dir) {
            P._dir = P.dir;
            sprite.style.backgroundImage = `url(${asset("player" + charId + "_walk_" + P.dir)})`;
          }
          if (P._mv !== moving) {
            P._mv = moving;
            sprite.style.animationPlayState = moving ? "running" : "paused";
            if (!moving) sprite.style.backgroundPosition = "0 0";
          }
        }
      }
      if (sceneRef.current) {                           // camera follows the player
        const s = sRef.current;
        const camx = -s * (P.x - SCENE_W / 2), camy = -s * (P.y - SCENE_H / 2);
        const tf = `translate(-50%, -50%) translate3d(${camx}px, ${camy}px, 0) scale(${s})`;
        if (P._camtf !== tf) { P._camtf = tf; sceneRef.current.style.transform = tf; }
      }
      // ---- proximity: which interactables are in reach + walk-through portal transport ----
      {
        const pa = (P.x - OX) / TW, pb = (P.y - TH - OY) / TH;
        const ptx = (pa + pb) / 2, pty = (pb - pa) / 2;   // fractional player tile
        const inRange = [];
        for (const it of INTERACTABLES) {
          const d = Math.hypot(ptx - it.tx, pty - it.ty);
          if (d <= it.range) inRange.push(it.key);
          if (it.portal) {
            if (d <= it.range && portalArmedRef.current) {
              portalArmedRef.current = false;
              transitionTo({ name: it.name, panel: it.panel, color: it.color });
            } else if (d > it.range) portalArmedRef.current = true; // re-arm the moment you step out of the circle
          }
        }
        const sig = inRange.slice().sort().join("|");
        if (sig !== nearKeysRef.current) { nearKeysRef.current = sig; setNearKeys(new Set(inRange)); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [connected, charId]);

  // keep a ref of the chosen character + tell the server when it changes (no reconnect)
  const charIdRef = useRef(charId);
  useEffect(() => {
    charIdRef.current = charId;
    const s = socketRef.current;
    if (s && s.connected) s.emit("world:char", { char: charId });
  }, [charId]);

  // ---- ENTERING THE PORTAL fully transfers you to the arena: leave the Earn-map presence
  // (so no avatar lingers in the city); re-join when you come back. ----
  const wasArenaRef = useRef(false);
  useEffect(() => {
    const inArena = !!(shop && shop.panel === "arena");
    if (inArena === wasArenaRef.current) return;
    wasArenaRef.current = inArena;
    const s = socketRef.current;
    if (inArena) {
      if (s) s.emit("world:leave");
    } else {
      // Stepped out of the arena → place the avatar JUST OUTSIDE the city portal's trigger
      // circle (2 tiles north) and re-arm it, so you can simply walk back in to re-enter
      // (instead of being stuck disarmed inside the circle and having to click).
      const P = playerPosRef.current;
      if (P) {
        const so = iso(ARENA_PORTAL.tx - 0.5, ARENA_PORTAL.ty - 2);
        P.x = so.x; P.y = so.y + TH; P.dir = "s"; P.moving = false;
      }
      portalArmedRef.current = true;
      if (s) {
        const P2 = playerPosRef.current;
        s.emit("world:join", { wallet: walletAddr, char: charIdRef.current,
          x: P2 ? P2.x : 0, y: P2 ? P2.y : 0, dir: P2 ? P2.dir : "s" });
      }
    }
  }, [shop, walletAddr]);

  // ---- MULTIPLAYER PRESENCE: every connected wallet sees the others move live (socket.io) ----
  useEffect(() => {
    if (!connected) return;
    const socket = io(SOCKET_URL, { transports: ["websocket"], reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setPresenceConnected(true);
      const P = playerPosRef.current;
      socket.emit("world:join", { wallet: walletAddr, char: charIdRef.current,
        x: P ? P.x : 0, y: P ? P.y : 0, dir: P ? P.dir : "s" });
    });
    // another tab/window took over this wallet → stop here (no reconnect) and tell the user
    socket.on("session:superseded", () => {
      setPresenceConnected(false);
      setSuperseded(true);
      try { socket.disconnect(); } catch (e) { /* ignore */ }
    });
    socket.on("disconnect", () => {
      setPresenceConnected(false);
      remotesRef.current.clear();
      setRemoteIds([]);
    });
    const addRemote = (o) => {
      if (!o || o.id === socket.id) return;
      remotesRef.current.set(o.id, { char: String(o.char || "1"), wallet: o.wallet || "",
        dx: o.x, dy: o.y, tx: o.x, ty: o.y, dir: o.dir || "s", moving: false, _dir: null, _char: null, _mv: null });
      setRemoteIds([...remotesRef.current.keys()]);
    };
    socket.on("world:players", (list) => (list || []).forEach(addRemote));
    socket.on("world:player", addRemote);
    socket.on("world:moved", (m) => {
      const r = remotesRef.current.get(m.id);
      if (r) { r.tx = m.x; r.ty = m.y; r.dir = m.dir || r.dir; r.moving = !!m.moving; }
    });
    socket.on("world:charChanged", (m) => {
      const r = remotesRef.current.get(m.id);
      if (r) { r.char = String(m.char); r._char = null; }
    });
    socket.on("world:left", (m) => {
      remotesRef.current.delete(m.id);
      setRemoteIds([...remotesRef.current.keys()]);
    });
    // (no city duel handshake — dueling is arena-only)

    // broadcast my position ~10×/s
    const moveTimer = setInterval(() => {
      const P = playerPosRef.current;
      if (P && socket.connected) socket.emit("world:move", { x: P.x, y: P.y, dir: P.dir, moving: !!P.moving });
    }, 100);

    // smoothly interpolate the other players toward their last reported position
    let raf;
    const lerp = () => {
      remotesRef.current.forEach((r, id) => {
        const node = remoteNodes.current[id];
        if (!node) return;
        const ddx = r.tx - r.dx, ddy = r.ty - r.dy;
        if (Math.abs(ddx) < 0.1 && Math.abs(ddy) < 0.1) {
          if (!r._settled) {                            // snap + stop writing once it arrives
            r._settled = true; r.dx = r.tx; r.dy = r.ty;
            node.style.transform = `translate3d(${r.dx}px, ${r.dy}px, 0)`;
            const z = 1000 + Math.round(((r.dy - TH - OY) / TH) * 10) + 6;
            if (r._z !== z) { r._z = z; node.style.zIndex = z; }
          }
        } else {
          r._settled = false;
          r.dx += ddx * 0.25; r.dy += ddy * 0.25;
          node.style.transform = `translate3d(${r.dx}px, ${r.dy}px, 0)`;
          const z = 1000 + Math.round(((r.dy - TH - OY) / TH) * 10) + 6;
          if (r._z !== z) { r._z = z; node.style.zIndex = z; }
        }
        const spr = node.firstChild;
        if (spr) {
          if (r._char !== r.char || r._dir !== r.dir) {
            r._char = r.char; r._dir = r.dir;
            spr.style.backgroundImage = `url(${asset("player" + r.char + "_walk_" + r.dir)})`;
          }
          if (r._mv !== r.moving) {
            r._mv = r.moving;
            spr.style.animationPlayState = r.moving ? "running" : "paused";
            if (!r.moving) spr.style.backgroundPosition = "0 0";
          }
        }
      });
      raf = requestAnimationFrame(lerp);
    };
    raf = requestAnimationFrame(lerp);

    return () => {
      clearInterval(moveTimer); cancelAnimationFrame(raf);
      try { socket.emit("world:leave"); socket.disconnect(); } catch (e) { /* ignore */ }
      socketRef.current = null;
      setPresenceConnected(false);
      remotesRef.current.clear(); setRemoteIds([]);
    };
  }, [connected, walletAddr]);

  const onDown = (e) => { movedRef.current = false; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
    const nx = d.vx + dx, ny = d.vy + dy;
    setView((v) => ({ ...v, x: nx, y: ny }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = useCallback((e) => {
    setView((v) => ({ ...v, s: Math.min(1.6, Math.max(0.22, v.s * (e.deltaY < 0 ? 1.12 : 0.89))) }));
  }, []);
  const zoom = (f) => setView((v) => ({ ...v, s: Math.min(1.6, Math.max(0.22, v.s * f)) }));
  const reset = () => setView({ s: 0.5, x: 0, y: 0 });
  const guardClick = (cb) => (e) => { if (movedRef.current) return; e.stopPropagation(); cb(); };

  // click a tile → walk the avatar there (BFS path on the walkable grid; WASD can override)
  const onWorldClick = (e) => {
    if (!connected || movedRef.current) return;
    const scene = sceneRef.current, P = playerPosRef.current;
    if (!scene || !P) return;
    const rect = scene.getBoundingClientRect();
    const s = rect.width / SCENE_W;                   // current on-screen scale
    const sx = (e.clientX - rect.left) / s, sy = (e.clientY - rect.top) / s;
    const a = (sx - OX) / TW, b = (sy - OY) / TH;     // clicked scene point → tile
    const tx = Math.round((a + b) / 2), ty = Math.round((b - a) / 2);
    const pa = (P.x - OX) / TW, pb = (P.y - TH - OY) / TH;
    const ptx = Math.round((pa + pb) / 2), pty = Math.round((pb - pa) / 2);
    const tiles = findPath(ptx, pty, tx, ty);
    pathRef.current = tiles.map(([ttx, tty]) => { const p = iso(ttx, tty); return { x: p.x, y: p.y + TH }; });
  };

  return (
    <div className="world-viewport"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}>
      <div className="world-sheen" />
      <header className="world-hud">
        <h1>CYBER CITY</h1>
        <span>{active || "drag to pan · scroll / +− to zoom"}</span>
      </header>
      {connected && !shop && (
        <MapStatusPanel
          mapName="CYBER CITY"
          playerCount={presenceConnected ? remoteIds.length + 1 : 0}
          presenceConnected={presenceConnected}
        />
      )}
      <div className="world-zoom-ui">
        <button onClick={() => zoom(1.2)} title="Zoom in">+</button>
        <button onClick={() => zoom(0.8)} title="Zoom out">−</button>
        <button onClick={reset} title="Reset view">⟳</button>
        <button
          onClick={() => setLiteFx((v) => !v)}
          className={`world-fx-toggle${liteFx ? " on" : ""}`}
          title={liteFx ? "Lite FX is ON — tap for full effects" : "Tap if the screen flickers (Lite FX / performance mode)"}
        >FX</button>
      </div>
      <div className="world-scene world-scene--big" ref={sceneRef} onClick={onWorldClick}
        style={{ width: SCENE_W, height: SCENE_H,
          transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        {/* thick raised base slab under the whole map (purple platform side) */}
        <img className="world-floor" src={asset("base_slab")} alt="" draggable={false}
          style={{ left: 80, top: 328, zIndex: -1 }} />
        {floor.map((t) => (
          <img key={t.key} className={`world-floor ${t.name === "isn_water" ? "world-water" : ""}`}
            src={asset(t.name)} alt="" draggable={false}
            style={{ left: t.left, top: t.top, width: DW, zIndex: t.z, transform: t.flip ? "scaleX(-1)" : "none" }} />
        ))}
        {/* HD road network: one continuous overlay built from HD asphalt+sidewalk textures */}
        <img className="world-floor" src={asset("road_overlay")} alt="" draggable={false}
          style={{ left: OX - 2560, top: OY - 32, width: 5378, zIndex: 500 }} />
        {/* roundabout is now baked into the connected road_overlay (real merged ring) */}
        {/* modern fence ring around the whole hologram pad (clean diamond overlay) */}
        <img className="world-floor world-fence" src={asset("fence_overlay")} alt="" draggable={false}
          style={{ left: HOLO_FENCE.left, top: HOLO_FENCE.top, zIndex: HOLO_FENCE.z }} />
        {/* BIG hologram on the cleared pad — sci-fi podium + animated light beam +
            base-less translucent glitching talking head floating above the emitter. */}
        <img className="world-holo-base" src={asset("holo_base")} alt="" draggable={false}
          style={{ left: HOLO.x, top: HOLO.y, width: 220,
            zIndex: 1000 + Math.round((PLAZA_CTR[0] + PLAZA_CTR[1]) * 10) + 4 }} />
        <div className="world-holo"
          style={{ left: HOLO.x, top: HOLO.y - 72, backgroundImage: `url(${asset("holo_head")})`,
            zIndex: 1000 + Math.round((PLAZA_CTR[0] + PLAZA_CTR[1]) * 10) + 5 }} />
        {/* beam rendered IN FRONT of the head (screen blend) so the rays read over it */}
        <div className="world-holo-beam"
          style={{ left: HOLO.x, top: HOLO.y - 46,   /* emitter ≈ podium centre */
            zIndex: 1000 + Math.round((PLAZA_CTR[0] + PLAZA_CTR[1]) * 10) + 6 }} />
        {/* glowing light pools cast on the ground by the street lamps */}
        {lightPools.map((p) => (
          <div key={p.key} className="world-lightpool"
            style={{ left: p.x, top: p.y, zIndex: p.z }} />
        ))}
        {objs.map((o) => {
          const common = { left: o.ax, top: o.ay, zIndex: o.z };
          if (o.fx === "anim") {
            // scale the fountain to the requested width o.w; --fw drives the frame stepping
            return <div key={o.key} className="world-obj fountain-anim"
              style={{ ...common, backgroundImage: `url(${asset("fountain_anim")})`, "--fw": `${o.w}px` }} />;
          }
          if (o.label) {
            const reachable = nearKeys.has(o.key);
            return (
              <button key={o.key} className={`world-obj world-building ${o.shop ? "is-shop" : ""} ${o.fx ? `fx-${o.fx}` : ""} ${active === o.label ? "is-active" : ""} ${reachable ? "in-range" : ""}`}
                style={common} title={o.label}
                onClick={guardClick(() => {
                  if (!o.shop) return setActive(o.label);
                  if (reachable) transitionTo(o.shop);
                  else setActive(`${o.label} — walk closer to enter`);
                })}>
                <img src={asset(o.name)} alt={o.label} width={o.w} draggable={false} />
                {reachable && <span className="world-prompt">{o.shop && o.shop.panel === "arena" ? "ENTER ▶" : "OPEN ▶"}</span>}
              </button>
            );
          }
          return (
            <div key={o.key} className={`world-obj ${o.fx ? `fx-${o.fx}` : ""}`} style={common}>
              <img src={asset(o.name)} alt={o.name} width={o.w} draggable={false} />
            </div>
          );
        })}
        {/* NPCs — standby loiterers (breathing idle) + speech bubble */}
        {npcStand.map((p) => (
          <div key={p.key} className="world-standby" style={{ left: p.x, top: p.y, zIndex: p.z }}>
            <img className="world-npc idle" src={asset(p.src)} alt="" draggable={false} />
            <div className="npc-bubble" />
          </div>
        ))}
        {/* NPCs — wandering pedestrians: real walk-cycle sprites moved by the engine,
            colliding with buildings/trees/fences/water via the walkable grid */}
        {npcAgents.map((a, i) => (
          <div key={`wk${i}`} className="world-walker" ref={(el) => (walkRefs.current[i] = el)}>
            <div className="world-walker-sprite" />
            <div className="npc-bubble" />
          </div>
        ))}
        {/* big neon billboards over the shop buildings */}
        {shopSigns.map((s) => {
          const it = INTERACTABLES.find((i) => i.name === s.text);
          const reachable = it && nearKeys.has(it.key);
          return (
            <button key={s.key} className={`world-shop-sign ${reachable ? "in-range" : ""}`}
              style={{ left: s.x, top: s.y, zIndex: s.z, "--sign": s.color }}
              onClick={guardClick(() => {
                if (!it) return;
                if (reachable) transitionTo({ name: it.name, panel: it.panel, color: it.color });
                else setActive(`${it.name} — walk closer to enter`);
              })}>
              {s.text}
            </button>
          );
        })}
        {/* other connected players (multiplayer presence) */}
        {remoteIds.map((id) => {
          const r = remotesRef.current.get(id);
          if (!r) return null;
          const nm = r.wallet ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : "anon";
          return (
            <div key={id} className="world-remote" title={nm}
              ref={(el) => { if (el) remoteNodes.current[id] = el; else delete remoteNodes.current[id]; }}>
              <div className="world-walker-sprite remote-sprite" />
              <div className="remote-name">{nm}</div>
            </div>
          );
        })}
        {/* the connected wallet's controllable avatar (WASD / click-to-move) */}
        {connected && (
          <>
            <div className="world-dest" ref={destRef} />
            <div className="world-player" ref={playerRef}>
              <div className="world-walker-sprite player-sprite" />
              <div className="player-ring" />
              <div className="player-name">{shortAddr}</div>
            </div>
          </>
        )}
      </div>

      {/* not connected → cyberpunk connect gate over the LIVE city */}
      {!connected && <CyberLanding overlay onConnect={walletCtx.connectWallet} />}

      {/* character-select HUD (after wallet connected) */}
      {connected && (
        <div className="world-charbar">
          <div className="charbar-head">
            <span className="charbar-title">CHARACTER</span>
            <span className="charbar-addr">{shortAddr}</span>
          </div>
          <div className="charbar-row">
            {["1", "2", "3"].map((id) => (
              <button key={id} className={`charbar-opt ${charId === id ? "sel" : ""}`}
                onClick={() => pickChar(id)} title={`Character ${id}`}>
                <img src={asset(`player${id}_s`)} alt={`Character ${id}`} draggable={false} />
              </button>
            ))}
          </div>
          <span className="charbar-hint">move with WASD</span>
        </div>
      )}

      {/* in-world HUD panel — mounts the real tool component for the clicked building */}
      {shop && shop.panel === "arena" && (
        <ArenaMap
          charId={charId}
          wallet={walletAddr}
          onExit={() => transitionTo(null)}
          onDuel={(t) => transitionTo({ name: t ? `DUEL vs ${t.name}` : "ARENA DUEL", panel: "play", color: "#c060ff", challengeId: t?.challengeId })}
        />
      )}

      {/* dueling is arena-only — no duel HUD on the Earn (city) map */}
      {shop && shop.panel !== "arena" && (() => {
        const Comp = PANEL_COMP[shop.panel];
        return (
          <div
            className="world-panel-overlay"
            onClick={() => setShop(null)}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className={`world-panel world-panel--${shop.panel}`}
              style={{ "--sign": shop.color }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="world-panel-corner tl" />
              <span className="world-panel-corner tr" />
              <span className="world-panel-corner bl" />
              <span className="world-panel-corner br" />
              <div className="world-panel-scan" />
              <div className="world-panel-bar">
                <span className="world-panel-title">{shop.name}</span>
                <button
                  className="world-panel-close"
                  onClick={() => setShop(null)}
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="world-panel-body">
                {Comp ? (
                  <Comp embedded challengeId={shop.challengeId} />
                ) : (
                  <div className="shop-body">
                    <p>Welcome to the {shop.name.toLowerCase()}.</p>
                    <p className="shop-soon">Coming soon…</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* single-session lock: this wallet is now active in another tab/window */}
      {superseded && (
        <div className="world-superseded">
          <div className="world-superseded-card">
            <div className="ss-title">SESSION MOVED</div>
            <div className="ss-text">
              This wallet is now active in another tab or window. Only one session can run at a time.
            </div>
            <button className="ss-btn" onClick={() => window.location.reload()}>
              USE HERE (RELOAD)
            </button>
          </div>
        </div>
      )}

      {/* transition loaders: quick animated icon for tool panels, full scene for the arena jump */}
      <AnimatePresence>
        {loading &&
          (loading.mini ? (
            <PanelLoader
              key="world-loading"
              accent={loading.accent}
              label={loading.label}
              sublabel={loading.sublabel}
              dur={loading.dur}
            />
          ) : (
            <LoadingScreen
              key="world-loading"
              label={loading.label}
              sublabel={loading.sublabel}
              accent={loading.accent}
              dur={loading.dur}
              bg={loading.bg}
            />
          ))}
      </AnimatePresence>
    </div>
  );
}
