import React, { useRef, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../../config/endpoints";
import "./arena.css";
import Play from "../pages/play";
import MapStatusPanel from "./MapStatusPanel";

// A large WALKABLE, MULTIPLAYER isometric arena the city portal transports you into.
// Camera follows the player (the map is too big to fit on screen). Everyone shares the
// "arena" socket room and sees each other. Duel: click another player. Exit: walk into
// the EXIT PORTAL (or the top-bar button) to return to the Earn map.
const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;
const TW = 60, TH = 30, DW = 120, R = 18;          // iso geometry + arena radius (tiles) — 3× bigger
const ZOOM = 0.82;
const SCENE_W = 2520, SCENE_H = 1900, OX = 1260, OY = 950;
const SPAWN = [0, R - 5];                           // spawn near the south edge (not on the exit)
const EXIT_TILE = [0, 0];                           // EXIT portal dead-centre of the arena

const iso = (tx, ty) => ({ x: OX + (tx - ty) * TW, y: OY + (tx + ty) * TH });
// keep the player ~2 tiles inside the floor edge so the (tall) sprite never overhangs the void
const inArena = (tx, ty) => Math.hypot(tx, ty) <= R - 2.0;

const FLOOR = [];
for (let tx = -R; tx <= R; tx++)
  for (let ty = -R; ty <= R; ty++)
    if (Math.hypot(tx, ty) <= R + 0.001) FLOOR.push({ tx, ty });
FLOOR.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));
const EXIT_POS = iso(EXIT_TILE[0], EXIT_TILE[1]);

export default function ArenaMap({ charId = "1", wallet = "", name = "", onExit, onDuel }) {
  const sceneRef = useRef(null), playerRef = useRef(null);
  const keys = useRef(new Set()), pathRef = useRef([]);
  const playerPosRef = useRef(null);
  const socketRef = useRef(null);
  const remotesRef = useRef(new Map());
  const remoteNodes = useRef({});
  const charIdRef = useRef(charId);
  const nameRef = useRef(name);                     // display name (nickname or short wallet)
  const exitArmedRef = useRef(false);               // arm once you step away from the exit portal
  const [remoteIds, setRemoteIds] = useState([]);
  const [presenceConnected, setPresenceConnected] = useState(false);
  const [duelTarget, setDuelTarget] = useState(null);
  const [pendingInvite, setPendingInvite] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [activeDuel, setActiveDuel] = useState(null);      // in-arena duel overlay {challengeId,mode,bet,name}
  const [duelOver, setDuelOver] = useState(false);         // duel finished (result shown) — clears DUELING
  const [busyIds, setBusyIds] = useState(() => new Set()); // remote ids currently dueling/matching
  const [betInput, setBetInput] = useState(50);            // custom wager amount (CYBERIO)
  const activeDuelRef = useRef(null);
  const shortAddr = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "anon";

  useEffect(() => { charIdRef.current = charId; }, [charId]);
  useEffect(() => {
    nameRef.current = name;
    const s = socketRef.current;
    if (s && s.connected) s.emit("arena:name", { name });
  }, [name]);
  const onDuelRef = useRef(onDuel), onExitRef = useRef(onExit);
  useEffect(() => { onDuelRef.current = onDuel; onExitRef.current = onExit; });
  useEffect(() => { activeDuelRef.current = activeDuel; }, [activeDuel]);
  // tell the arena room we're busy (in a duel / matching) so others show a DUELING tag
  const emitBusy = (b) => {
    try { socketRef.current && socketRef.current.emit("arena:busy", { busy: b }); }
    catch (e) { /* ignore */ }
  };
  // Broadcast DUELING declaratively from state — busy whenever a request is pending or a duel
  // is in progress, and cleared the instant the duel ends or you leave. (Fires for BOTH players.)
  useEffect(() => {
    emitBusy(!!(pendingInvite || incomingInvite || (activeDuel && !duelOver)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, incomingInvite, activeDuel, duelOver]);

  // ---- local movement (WASD / click) + camera follow + exit-portal proximity ----
  useEffect(() => {
    const el = playerRef.current, sprite = el && el.firstChild;
    const c = iso(SPAWN[0], SPAWN[1]);
    // restore last arena position after a refresh (sessionStorage, per-tab)
    let sx = c.x, sy = c.y, sdir = "s";
    try {
      const saved = JSON.parse(sessionStorage.getItem("cyb_arena") || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        sx = saved.x; sy = saved.y; sdir = saved.dir || "s";
      }
    } catch (e) { /* ignore */ }
    const P = { x: sx, y: sy, dir: sdir, _dir: null, _mv: null, moving: false };
    playerPosRef.current = P;
    const SPEED = 165;
    const sceneWalkable = (x, y) => {
      const a = (x - OX) / TW, b = (y - OY) / TH;
      return inArena((a + b) / 2, (b - a) / 2);
    };
    const KEY = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const isTyping = (e) => {
      const t = e.target || document.activeElement;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const kd = (e) => {
      if (isTyping(e)) return;
      if (e.code === "KeyE") {                          // "E" → request a duel with the nearest player
        e.preventDefault();
        const P = playerPosRef.current; if (!P) return;
        let best = null, bd = Infinity;
        remotesRef.current.forEach((r, id) => {
          const d = Math.hypot(P.x - r.tx, P.y - r.ty);
          if (d < bd) { bd = d; best = { id, r }; }
        });
        if (best && bd < 800) {                         // a player is reasonably nearby
          const r = best.r;
          const nm = r.name || (r.wallet ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : "anon");
          setDuelTarget({ id: best.id, name: nm, wallet: r.wallet || "" });
        }
        return;
      }
      const m = KEY[e.code]; if (m) { e.preventDefault(); keys.current.add(m); }
    };
    const ku = (e) => { if (isTyping(e)) return; const m = KEY[e.code]; if (m) keys.current.delete(m); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    // persist arena position so a browser refresh drops you back where you were
    const saveArena = () => {
      const cur = playerPosRef.current;
      if (cur) {
        try { sessionStorage.setItem("cyb_arena", JSON.stringify({ x: cur.x, y: cur.y, dir: cur.dir })); }
        catch (e) { /* ignore */ }
      }
    };
    const saveTimer = setInterval(saveArena, 700);
    window.addEventListener("beforeunload", saveArena);
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (activeDuelRef.current) { keys.current.clear(); pathRef.current = []; }  // frozen during a duel
      const k = keys.current; let dx = 0, dy = 0;
      if (k.has("up")) dy -= 1; if (k.has("down")) dy += 1;
      if (k.has("left")) dx -= 1; if (k.has("right")) dx += 1;
      let moving = false;
      if (dx || dy) {
        pathRef.current = [];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const nx = P.x + dx * SPEED * dt, ny = P.y + dy * SPEED * dt;
        if (sceneWalkable(nx, P.y)) P.x = nx;
        if (sceneWalkable(P.x, ny)) P.y = ny;
        P.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : (dy > 0 ? "s" : "n");
        moving = true;
      } else if (pathRef.current.length) {
        const wp = pathRef.current[0]; let vx = wp.x - P.x, vy = wp.y - P.y; const d = Math.hypot(vx, vy);
        if (d < 4) pathRef.current.shift();
        else {
          vx /= d; vy /= d;
          const nx = P.x + vx * SPEED * dt, ny = P.y + vy * SPEED * dt;
          if (sceneWalkable(nx, ny)) { P.x = nx; P.y = ny; moving = true; } else pathRef.current = [];
          P.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "e" : "w") : (vy > 0 ? "s" : "n");
        }
      }
      P.moving = moving;
      if (el) {
        el.style.transform = `translate(${P.x}px, ${P.y}px)`;
        el.style.zIndex = 100000 + Math.round(((P.y - OY) / TH) * 10);
        if (sprite) {
          if (P._dir !== P.dir) { P._dir = P.dir; sprite.style.backgroundImage = `url(${asset("player" + charIdRef.current + "_walk_" + P.dir)})`; }
          if (P._mv !== moving) { P._mv = moving; sprite.style.animationPlayState = moving ? "running" : "paused"; if (!moving) sprite.style.backgroundPosition = "0 0"; }
        }
      }
      // camera follows the player
      if (sceneRef.current)
        sceneRef.current.style.transform =
          `translate(-50%, -50%) translate(${-ZOOM * (P.x - SCENE_W / 2)}px, ${-ZOOM * (P.y - SCENE_H / 2)}px) scale(${ZOOM})`;
      // exit-portal: walk into it to leave. Use TILE distance (the portal sprite is drawn
      // lifted above its tile, so pixel distance to the sprite would never match). Armed
      // once you've stepped away, so you don't bounce out the instant you spawn.
      {
        const a = (P.x - OX) / TW, b = (P.y - OY) / TH;
        const ptx = (a + b) / 2, pty = (b - a) / 2;
        const td = Math.hypot(ptx - EXIT_TILE[0], pty - EXIT_TILE[1]);
        if (td <= 1.8 && exitArmedRef.current) { exitArmedRef.current = false; onExitRef.current && onExitRef.current(); }
        else if (td > 3.2) exitArmedRef.current = true;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      saveArena();
      clearInterval(saveTimer);
      window.removeEventListener("beforeunload", saveArena);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
    };
  }, []);

  // ---- multiplayer presence in the "arena" room ----
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"], reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setPresenceConnected(true);
      const P = playerPosRef.current;
      socket.emit("arena:join", { wallet, name: nameRef.current, char: charIdRef.current, x: P ? P.x : 0, y: P ? P.y : 0, dir: P ? P.dir : "s" });
    });
    socket.on("disconnect", () => {
      setPresenceConnected(false);
      remotesRef.current.clear();
      setRemoteIds([]);
      setBusyIds(new Set());
    });
    const addRemote = (o) => {
      if (!o || o.id === socket.id) return;
      remotesRef.current.set(o.id, { char: String(o.char || "1"), wallet: o.wallet || "", name: o.name || "",
        dx: o.x, dy: o.y, tx: o.x, ty: o.y, dir: o.dir || "s", moving: false, _dir: null, _char: null, _mv: null });
      setRemoteIds([...remotesRef.current.keys()]);
    };
    socket.on("arena:players", (list) => (list || []).forEach(addRemote));
    socket.on("arena:player", addRemote);
    socket.on("arena:moved", (m) => {
      const r = remotesRef.current.get(m.id);
      if (r) { r.tx = m.x; r.ty = m.y; r.dir = m.dir || r.dir; r.moving = !!m.moving; }
    });
    socket.on("arena:charChanged", (m) => {
      const r = remotesRef.current.get(m.id);
      if (r) { r.char = String(m.char); r._char = null; }
    });
    socket.on("arena:nameChanged", (m) => {
      const r = remotesRef.current.get(m.id);
      if (r) { r.name = String(m.name || ""); setRemoteIds([...remotesRef.current.keys()]); }
    });
    socket.on("arena:left", (m) => {
      remotesRef.current.delete(m.id);
      setRemoteIds([...remotesRef.current.keys()]);
      setDuelTarget((d) => (d && d.id === m.id ? null : d));
      setBusyIds((prev) => {
        if (!prev.has(m.id)) return prev;
        const next = new Set(prev); next.delete(m.id); return next;
      });
    });

    // ── direct PvP challenge handshake (arena) ──
    socket.on("duel:invited", ({ fromId, challengeId, fromName, mode, bet }) =>
      setIncomingInvite({
        fromId, challengeId, fromName: fromName || "anon",
        mode: mode || "friendly", bet: Number(bet) || 0,
      }));
    socket.on("duel:inviteAccepted", ({ challengeId, mode, bet }) => {
      setPendingInvite(null);
      setDuelOver(false);
      // open the duel as an overlay ON the arena (we stay on the arena map)
      setActiveDuel({ challengeId, mode: mode || "friendly", bet: Number(bet) || 0, name: "opponent" });
    });
    socket.on("duel:inviteDeclined", () => setPendingInvite(null));
    // others' DUELING status (tag over their head)
    socket.on("arena:busyChanged", ({ id, busy }) =>
      setBusyIds((prev) => {
        const next = new Set(prev);
        if (busy) next.add(id); else next.delete(id);
        return next;
      }));

    const moveTimer = setInterval(() => {
      const P = playerPosRef.current;
      if (P && socket.connected) socket.emit("arena:move", { x: P.x, y: P.y, dir: P.dir, moving: !!P.moving });
    }, 100);

    let raf;
    const lerp = () => {
      remotesRef.current.forEach((r, id) => {
        const node = remoteNodes.current[id];
        if (!node) return;
        r.dx += (r.tx - r.dx) * 0.25; r.dy += (r.ty - r.dy) * 0.25;
        node.style.transform = `translate(${r.dx}px, ${r.dy}px)`;
        node.style.zIndex = 100000 + Math.round(((r.dy - OY) / TH) * 10);
        const spr = node.firstChild;
        if (spr) {
          if (r._char !== r.char || r._dir !== r.dir) {
            r._char = r.char; r._dir = r.dir;
            spr.style.backgroundImage = `url(${asset("player" + r.char + "_walk_" + r.dir)})`;
          }
          if (r._mv !== r.moving) {
            r._mv = r.moving; spr.style.animationPlayState = r.moving ? "running" : "paused";
            if (!r.moving) spr.style.backgroundPosition = "0 0";
          }
        }
      });
      raf = requestAnimationFrame(lerp);
    };
    raf = requestAnimationFrame(lerp);

    return () => {
      clearInterval(moveTimer); cancelAnimationFrame(raf);
      try { socket.emit("arena:leave"); socket.disconnect(); } catch (e) { /* ignore */ }
      socketRef.current = null; setPresenceConnected(false); remotesRef.current.clear(); setRemoteIds([]);
    };
  }, [wallet]);

  // send a duel request to the right-clicked player with the chosen mode
  const sendChallenge = (mode, bet) => {
    const t = duelTarget;
    if (!t) return;
    setDuelTarget(null);
    const cid = `chal-${(socketRef.current && socketRef.current.id) || "x"}-${Date.now()}`;
    if (socketRef.current)
      socketRef.current.emit("duel:invite", {
        toId: t.id, challengeId: cid, fromWallet: wallet, fromName: shortAddr, mode, bet,
      });
    setPendingInvite({ challengeId: cid, toName: t.name, mode, bet });
  };

  // click → walk straight toward the clicked scene point
  const onSceneClick = (e) => {
    const scene = sceneRef.current; if (!scene) return;
    const rect = scene.getBoundingClientRect();
    const s = rect.width / SCENE_W;
    pathRef.current = [{ x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s }];
  };

  return (
    <div className="arena-scene">
      <div className="arena-bar">
        <span className="arena-title">⚔ ARENA</span>
        <span className="arena-subtitle">walk into the EXIT portal to leave</span>
      </div>

      {!activeDuel && (
        <MapStatusPanel
          mapName="ARENA"
          variant="arena"
          playerCount={presenceConnected ? remoteIds.length + 1 : 0}
          presenceConnected={presenceConnected}
          displayName={name}
        />
      )}

      <div className="arena-fit">
        <div className="arena-iso" ref={sceneRef} onClick={onSceneClick} style={{ width: SCENE_W, height: SCENE_H }}>
          {FLOOR.map((t) => {
            const p = iso(t.tx, t.ty);
            return <img key={`${t.tx},${t.ty}`} className="arena-tile" src={asset("arena_iso")} alt=""
              draggable={false} style={{ left: p.x, top: p.y, width: DW, zIndex: Math.round((t.tx + t.ty) * 10) }} />;
          })}
          {/* EXIT PORTAL — walk into it to return to the Earn map (z above floor so it isn't clipped) */}
          <img className="arena-portal-out" src={asset("portal")} alt="exit"
            draggable={false} style={{ left: EXIT_POS.x, top: EXIT_POS.y, zIndex: 50000 }} />
          <div className="arena-portal-label" style={{ left: EXIT_POS.x, top: EXIT_POS.y, zIndex: 50001 }}>EXIT</div>

          {/* other players in the arena (right-click to duel) */}
          {remoteIds.map((id) => {
            const r = remotesRef.current.get(id);
            if (!r) return null;
            const nm = r.name || (r.wallet ? `${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)}` : "anon");
            const busy = busyIds.has(id);
            return (
              <div key={id} className={`world-remote clickable${busy ? " is-busy" : ""}`}
                ref={(el) => { if (el) remoteNodes.current[id] = el; else delete remoteNodes.current[id]; }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setDuelTarget({ id, name: nm, wallet: r.wallet || "" }); }}
                title={busy ? `${nm} — in a duel` : `${nm} — right-click to duel`}>
                <div className="world-walker-sprite remote-sprite" />
                <div className="remote-name">{nm}</div>
                {busy
                  ? <div className="remote-dueling">⚔ DUELING</div>
                  : <div className="remote-tag">⚔</div>}
              </div>
            );
          })}

          <div className="world-player arena-player" ref={playerRef}>
            <div className="world-walker-sprite player-sprite" />
            <div className="player-ring" />
            <div className="player-name">{name || shortAddr}</div>
          </div>
        </div>
      </div>

      <div className="arena-actions">
        <p className="arena-hint">Right-click a player (or press E) to duel · WASD / click to move · walk into the EXIT portal to leave</p>
      </div>

      {duelTarget && (
        <div className="world-duelhud" onClick={() => setDuelTarget(null)}>
          <div className="duelhud-card" onClick={(e) => e.stopPropagation()}>
            <div className="duelhud-head">CHALLENGE PLAYER</div>
            <div className="duelhud-name">{duelTarget.name}</div>

            <button className="duelhud-mode duelhud-mode--friendly" onClick={() => sendChallenge("friendly", 0)}>
              🤝 FRIENDLY DUEL
            </button>

            <div className="duelhud-betbox">
              <div className="duelhud-betlabel">
                ⚔ BET · <b>{betInput}</b> CYBERIO — winner takes pot
              </div>
              <input
                type="range" min="1" max="100000" step="1"
                value={Number(betInput) || 1}
                className="duelhud-betslider"
                onChange={(e) => setBetInput(+e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="duelhud-betpresets">
                {[10, 50, 100, 500, 1000, 10000].map((a) => (
                  <button
                    key={a}
                    className={`duelhud-preset${Number(betInput) === a ? " is-active" : ""}`}
                    onClick={() => setBetInput(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <button
                className="duelhud-bet"
                onClick={() => {
                  const a = Math.max(1, Math.floor(Number(betInput) || 0));
                  if (a > 0) sendChallenge("bet", a);
                }}
              >
                ⚔ SEND BET CHALLENGE
              </button>
            </div>

            <button className="duelhud-btn" onClick={() => setDuelTarget(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {pendingInvite && (
        <div className="world-duelhud">
          <div className="duelhud-card">
            <div className="duelhud-head">CHALLENGE SENT</div>
            <div className="duelhud-name">{pendingInvite.toName}</div>
            <div className="duelhud-sub">
              {pendingInvite.mode === "bet" ? `BET · ${pendingInvite.bet} CYBERIO` : "FRIENDLY"}
            </div>
            <div className="duelhud-actions">
              <span className="duelhud-wait">Waiting for accept…</span>
              <button className="duelhud-btn" onClick={() => setPendingInvite(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {incomingInvite && (
        <div className="world-duelhud">
          <div className="duelhud-card">
            <div className="duelhud-head">INCOMING CHALLENGE</div>
            <div className="duelhud-name">{incomingInvite.fromName}</div>
            <div className="duelhud-sub">
              {incomingInvite.mode === "bet" ? `BET · ${incomingInvite.bet} CYBERIO` : "FRIENDLY"}
            </div>
            <div className="duelhud-actions">
              <button className="duelhud-btn duelhud-btn--go" onClick={() => {
                const inv = incomingInvite; setIncomingInvite(null);
                if (socketRef.current) socketRef.current.emit("duel:inviteAccept", { toId: inv.fromId, challengeId: inv.challengeId, mode: inv.mode, bet: inv.bet });
                setDuelOver(false);
                setActiveDuel({ challengeId: inv.challengeId, mode: inv.mode, bet: inv.bet, name: inv.fromName });
              }}>✔ ACCEPT</button>
              <button className="duelhud-btn" onClick={() => {
                const inv = incomingInvite; setIncomingInvite(null);
                if (socketRef.current) socketRef.current.emit("duel:inviteDecline", { toId: inv.fromId, challengeId: inv.challengeId });
              }}>DECLINE</button>
            </div>
          </div>
        </div>
      )}

      {/* the duel plays as an overlay ON the arena — you never leave the arena map */}
      {activeDuel && (
        <div className="arena-duel-overlay">
          <div className="arena-duel-bar" style={{ "--sign": activeDuel.mode === "bet" ? "#ffd24a" : "#c060ff" }}>
            <span className="arena-duel-title">
              ⚔ {activeDuel.mode === "bet" ? `BET DUEL · ${activeDuel.bet} CYBERIO` : "FRIENDLY DUEL"}
            </span>
            <button
              className="arena-duel-leave"
              onClick={() => { setActiveDuel(null); setDuelOver(false); }}
            >
              ✕ LEAVE DUEL
            </button>
          </div>
          <div className="arena-duel-body">
            <Play
              embedded
              challengeId={activeDuel.challengeId}
              mode={activeDuel.mode}
              bet={activeDuel.bet}
              onResult={() => setDuelOver(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
