import React, { useState, useRef, useCallback } from "react";
import "./world.css";

/* =========================================================================
   Cyber City — TILE-BASED top-down map.
   Ground is a real tile grid (road / sidewalk / grass) that autotiles from a
   hand-authored MAP. Buildings are individual clickable React sprites placed
   on lots, each with neon/flicker animations. Plus moving taxis, an animated
   fountain, and rain + scanline ambience. Iso version: World.iso.bak.jsx.
   Keep plan.md updated.
   ========================================================================= */

const TILE = 64;                 // tile px on screen (= source tile size, 1:1 crisp)
const td = (n) => `${process.env.PUBLIC_URL}/citymap/td/${n}.png`;
const spr = (n) => `${process.env.PUBLIC_URL}/citymap/sprites/${n}.png`;

/* ---- Layout map -----------------------------------------------------------
   One char per tile. Legend:
     R road · .=building lot (grass/sidewalk under buildings) · ,=sidewalk ·
     g grass/park · P plaza (fountain)
   Roads form a grid around blocks of lots. Buildings are placed separately.
--------------------------------------------------------------------------- */
// 1-wide roads (R) separating 4-wide building blocks. Straight roads stay
// straight; only true crossings become 4-way crosswalk tiles.
const MAP = [
  "RRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "R....R....R....R....R....R",
  "R....R....R....R....R....R",
  "R....R....R.HH.R....R....R",
  "R....R....R.HH.R....R....R",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "R....R....R....R....R....R",
  "R....R....R.PP.R....R....R",
  "R....R....R.PP.R....R....R",
  "R....R....R....R....R....R",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "R....R....R....R....R....R",
  "R....R....R....R....R....R",
  "R....R....R....R....R....R",
  "R....R....R....R....R....R",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "RggggR....R....R....R....R",
  "RggggR....R....R....R....R",
  "R....R....R....R....R....R",
  "R....R....R....R....R....R",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRR",
];
const GH = MAP.length;
const GW = Math.max(...MAP.map((r) => r.length));
const at = (tx, ty) => (MAP[ty] && MAP[ty][tx]) || "R";
const isRoad = (tx, ty) => at(tx, ty) === "R";

/* ground tile chooser (autotiling for roads) */
function groundTile(tx, ty) {
  const c = at(tx, ty);
  if (c === "g") return { src: "grass" };
  if (c === "P") return { src: "pave" };          // plaza base = pavement (fountain on top)
  if (c === ",") return { src: "pave" };          // sidewalk path tiles
  if (c === ".") return { src: "grass" };          // building lots sit on grass (greener, like ref)
  if (c === "H") return { src: "pave" };
  // road: pick straight vs cross from neighbours
  const n = isRoad(tx, ty - 1), s = isRoad(tx, ty + 1), e = isRoad(tx + 1, ty), w = isRoad(tx - 1, ty);
  const ns = n || s, ew = e || w;
  if (ns && ew) return { src: "road_x" };
  if (ew) return { src: "road_h" };
  return { src: "road_v" };
}

const ground = [];
for (let ty = 0; ty < GH; ty++)
  for (let tx = 0; tx < GW; tx++)
    ground.push({ key: `g${tx}-${ty}`, ...groundTile(tx, ty), x: tx * TILE, y: ty * TILE });

/* ---- Buildings ------------------------------------------------------------
   Each building is a clickable sprite, placed by its lot's CENTRE tile (tx,ty
   = the tile whose top-left the building's bottom-centre anchors to). Sprites
   render at native size, anchored bottom-centre so they "sit" on the lot.
--------------------------------------------------------------------------- */
const LABELS = {
  cyber_mall: "Cyber Mall", hospital: "Hospital", police: "Police Station", hotel: "Hotel",
  arcade: "Arcade", data_tower: "Data Corp", ramen: "Ramen Street", apartment_a: "Apartment Block A",
  server_hall: "Server Hall", weapon_market: "Weapon Market", clinic: "Clinic",
};
const NEON = new Set(["cyber_mall", "data_tower", "arcade", "hotel", "ramen"]);   // strong glow
const FLICK = new Set(["arcade", "ramen", "weapon_market"]);                       // sign flicker

// blocks: 4-wide lots at cols {1,6,11,16,21}, 4-tall rows {1,6,11,16}.
// [sprite, blockCol, blockRow] — building is centred in the 4x4 block.
const BUILDINGS = [
  ["apartment_a", 1, 1], ["police", 6, 1], ["cyber_mall", 11, 1], ["data_tower", 16, 1], ["clinic", 21, 1],
  ["weapon_market", 1, 6], ["arcade", 6, 6], /* plaza @ 11,6 */ ["hospital", 16, 6], ["hotel", 21, 6],
  ["ramen", 1, 11], ["server_hall", 6, 11], ["cyber_mall", 11, 11], ["apartment_a", 16, 11], ["data_tower", 21, 11],
  ["clinic", 6, 16], ["arcade", 11, 16], ["weapon_market", 16, 16], ["police", 21, 16],
];
// centre of a 4-wide block = col+2 tiles; bottom anchor at block vertical centre+a bit.
const blockCentrePx = (c, r) => ({
  cx: (c + 2) * TILE,
  by: (r + 2) * TILE + TILE * 0.85,
});

const objs = BUILDINGS.map(([name, c, r], i) => {
  const { cx, by } = blockCentrePx(c, r);
  return {
    key: `${name}-${i}`, name, label: LABELS[name] || name,
    cx, by, neon: NEON.has(name), flick: FLICK.has(name),
    z: 100 + Math.round(by),
  };
});

/* moving taxis along the 1-wide avenues (road rows/cols are 0,5,10,15,20,25) */
const TAXIS = [
  { lane: "h", track: 5, dur: 13, delay: 0 },
  { lane: "h", track: 15, dur: 17, delay: 3, rev: true },
  { lane: "v", track: 10, dur: 15, delay: 1 },
  { lane: "v", track: 20, dur: 19, delay: 5, rev: true },
];

export default function World() {
  const [active, setActive] = useState(null);
  const [view, setView] = useState({ s: 0.92, x: 0, y: 0 });
  const drag = useRef(null);

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    setView((v) => ({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = useCallback((e) => {
    setView((v) => ({ ...v, s: Math.min(1.8, Math.max(0.35, v.s * (e.deltaY < 0 ? 1.12 : 0.89))) }));
  }, []);

  const W = GW * TILE, H = GH * TILE;

  return (
    <div className="world-viewport"
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}>
      <div className="world-rain" />
      <div className="world-scanlines" />
      <div className="world-sheen" />
      <header className="world-hud">
        <h1>CYBER CITY</h1>
        <span>{active || "drag to pan · scroll to zoom · click a building"}</span>
      </header>

      <div className="td-stage" style={{ width: W, height: H,
        transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.s})` }}>
        {/* ground */}
        {ground.map((t) => (
          <img key={t.key} className="td-tile" src={td(t.src)} alt="" draggable={false}
            style={{ left: t.x, top: t.y, width: TILE, height: TILE }} />
        ))}

        {/* moving taxis (under buildings) */}
        {TAXIS.map((tx, i) => (
          <img key={`taxi${i}`} src={spr("taxi")} alt="" draggable={false}
            className={`td-taxi ${tx.lane === "h" ? "taxi-h" : "taxi-v"} ${tx.rev ? "rev" : ""}`}
            style={{
              [tx.lane === "h" ? "top" : "left"]: tx.track * TILE + TILE * 0.18,
              animationDuration: `${tx.dur}s`, animationDelay: `${tx.delay}s`,
              ["--span"]: `${(tx.lane === "h" ? W : H)}px`,
            }} />
        ))}

        {/* fountain plaza prop — centred on the plaza block (cols 11-14, rows 6-9) */}
        <div className="td-obj fountain-glow" style={{ left: 13 * TILE, top: 9.4 * TILE, zIndex: 90 }}>
          <img src={spr("fountain_plaza")} alt="Central Plaza" draggable={false} />
        </div>

        {/* buildings */}
        {objs.map((o) => (
          <button key={o.key}
            className={`td-obj td-building ${o.neon ? "neon" : ""} ${o.flick ? "flick" : ""} ${active === o.label ? "is-active" : ""}`}
            style={{ left: o.cx, top: o.by, zIndex: o.z }}
            title={o.label}
            onClick={(e) => { if (drag.current && drag.current.moved) return; e.stopPropagation(); setActive(o.label); }}>
            <img src={spr(o.name)} alt={o.label} draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
