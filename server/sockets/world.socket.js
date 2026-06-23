// server/sockets/world.socket.js
// Real-time presence for the isometric scenes. Two independent rooms:
//   "world" — the city map        "arena" — the duel arena map
// Each player joins a room, broadcasts position/character/wallet, and sees everyone
// else in the SAME room move live. Entering the arena = leave world room, join arena room.

const worldPlayers = new Map(); // socket.id -> { id, wallet, char, x, y, dir, moving }
const arenaPlayers = new Map();

function attachWorldSocket(io, socket) {
  // wires up join/move/char/leave for one room name backed by one players Map
  function makeRoom(room, players) {
    const leave = () => {
      if (!players.has(socket.id)) return;
      players.delete(socket.id);
      socket.to(room).emit(`${room}:left`, { id: socket.id });
      socket.leave(room);
    };

    socket.on(`${room}:join`, (data = {}) => {
      const wallet = String(data.wallet || "");
      // Single active session per wallet — the city presence is the gate. A newer tab/window
      // takes over and any older session for the same wallet is told it was superseded so it
      // can stop (prevents two tabs dueling/betting against themselves or duplicate avatars).
      if (room === "world" && wallet) {
        for (const [sid, o] of [...players]) {
          if (sid !== socket.id && o.wallet === wallet) {
            const old = io.sockets.sockets.get(sid);
            if (old) {
              old.emit("session:superseded", { reason: "Game opened in another tab or window." });
              old.leave(room);
            }
            players.delete(sid);
            socket.to(room).emit(`${room}:left`, { id: sid });
          }
        }
      }
      const p = {
        id: socket.id,
        wallet,
        char: String(data.char || "1"),
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        dir: data.dir || "s",
        moving: false,
      };
      players.set(socket.id, p);
      socket.join(room);
      socket.emit(`${room}:players`, [...players.values()].filter((o) => o.id !== socket.id));
      socket.to(room).emit(`${room}:player`, p);
    });

    socket.on(`${room}:move`, (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.x = Number(data.x) || 0;
      p.y = Number(data.y) || 0;
      p.dir = data.dir || p.dir;
      p.moving = !!data.moving;
      socket.to(room).emit(`${room}:moved`, { id: socket.id, x: p.x, y: p.y, dir: p.dir, moving: p.moving });
    });

    socket.on(`${room}:char`, (data = {}) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.char = String(data.char || p.char);
      socket.to(room).emit(`${room}:charChanged`, { id: socket.id, char: p.char });
    });

    socket.on(`${room}:leave`, leave);
    return leave;
  }

  const leaveWorld = makeRoom("world", worldPlayers);
  const leaveArena = makeRoom("arena", arenaPlayers);

  // ── direct PvP challenge handshake (relayed to a specific player's socket) ──
  // Both sides then open the duel with the shared challengeId → server pairs them.
  // mode: "friendly" | "bet" (+ bet amount) is carried through for display/future escrow.
  socket.on("duel:invite", ({ toId, challengeId, fromWallet, fromName, mode, bet } = {}) => {
    if (toId)
      io.to(toId).emit("duel:invited", {
        fromId: socket.id, challengeId, fromWallet, fromName,
        mode: mode || "friendly", bet: Number(bet) || 0,
      });
  });
  socket.on("duel:inviteAccept", ({ toId, challengeId, mode, bet } = {}) => {
    if (toId)
      io.to(toId).emit("duel:inviteAccepted", {
        challengeId, fromId: socket.id,
        mode: mode || "friendly", bet: Number(bet) || 0,
      });
  });
  socket.on("duel:inviteDecline", ({ toId, challengeId } = {}) => {
    if (toId) io.to(toId).emit("duel:inviteDeclined", { challengeId });
  });

  // ── "busy" status so others can see a DUELING tag over a player's head ──
  socket.on("arena:busy", ({ busy } = {}) => {
    socket.to("arena").emit("arena:busyChanged", { id: socket.id, busy: !!busy });
  });

  socket.on("disconnect", () => {
    socket.to("arena").emit("arena:busyChanged", { id: socket.id, busy: false });
    leaveWorld(); leaveArena();
  });
}

module.exports = { attachWorldSocket };
