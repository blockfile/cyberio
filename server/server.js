// server/server.js
const path = require("path");
const dotenv = require("dotenv");
const envName = process.env.NODE_ENV === "production" ? "production" : "development";

dotenv.config({ path: path.resolve(__dirname, `.env.${envName}`) });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const socketio = require("socket.io");
const bs58 = require("bs58");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
} = require("@solana/web3.js");

// ✅ SPL TOKEN (Tokenkeg + Token-2022 SAFE)
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

// deck / NFT helpers (DB-based)
const { buildDeckFromDb, getCardPowerFromSocket } = require("./util/deck");

const User = require("./model/User");
const Match = require("./model/Match");

// wallet NFT + inventory routes
const walletNftsRouter = require("./routes/walletNfts");
const inventoryRouter = require("./routes/inventory");
const earnNpcRouter = require("./routes/earnNpc");
const storeRoutes = require("./routes/store.routes");
const walletNftsRoutes = require("./routes/walletNfts.routes");
const earnRoutes = require("./routes/earn");
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:3004",
  "http://localhost:3005",
  "https://cyberio.fun",
  "https://www.cyberio.fun",
  "https://dapp.cyberio.io",
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const { attachEarnNpcSocket } = require("../server/sockets/earnNpc.socket");

/** ─ SOLANA / TREASURY & ENV ─ */
const SOLANA_RPC = process.env.SOLANA_RPC;
const connection = new Connection(SOLANA_RPC, "confirmed");

const treasurySecret = bs58.decode(process.env.TREASURY_PRIVATE_KEY);
const treasuryKeypair = Keypair.fromSecretKey(treasurySecret);
const TREASURY_PUBKEY = treasuryKeypair.publicKey.toBase58();

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** ✅ SPL WAGER CONFIG (SERVER) */
const WAGER_MINT = process.env.WAGER_MINT; // same mint client uses
const WAGER_DECIMALS = parseInt(process.env.WAGER_DECIMALS || "6", 10);

/** ─ RAKE SETTINGS ─ */
const RAKE_BPS = parseInt(process.env.RAKE_BPS || "0", 10);
const FEE_WALLET = process.env.FEE_WALLET || null; // fee wallet owner pubkey (not ATA)

function isRecoverableNetworkError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("fetch failed") ||
    msg.includes("EPROTO") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("TLS")
  );
}

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled rejection:", reason?.stack || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[process] Uncaught exception:", err?.stack || err);
  if (!isRecoverableNetworkError(err)) {
    process.exitCode = 1;
  }
});

/** Express middleware */
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
  })
);
app.use(express.json());

/** REST routes */
app.use("/api/user", require("./routes/user"));
app.use("/api/wallet-nfts", walletNftsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/earnNpc", earnNpcRouter);
app.use("/api/store", storeRoutes);
app.use("/api/wallet-nfts", walletNftsRoutes);
app.use("/api/earn", earnRoutes);

/** ─ Mongo connection ─ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // FIX: Drop old unique index { wallet, mint } that causes
    // "dup key: { wallet: null, mint: null }"
    try {
      const db = mongoose.connection.db;
      const coll = db.collection("nftassets");
      await coll.dropIndex("wallet_1_mint_1");
      console.log("🧹 Dropped legacy index wallet_1_mint_1 from nftassets");
    } catch (e) {
      if (e.codeName === "IndexNotFound") {
        console.log("ℹ️ Legacy index wallet_1_mint_1 not present, nothing to drop");
      } else {
        console.warn("⚠️ Could not drop legacy index wallet_1_mint_1:", e.message);
      }
    }
  })
  .catch((err) => console.error("❌ MongoDB error:", err));

/** ─ GAME CONSTANTS ─ */
const ROUND_SECONDS = 30;
const RECONNECT_SECONDS = 25;
const NEED_MIN_CARDS = 3;

/** ─ STATE ─ */
const queues = { quick: [], friendly: [] };
const rooms = new Map();
const roomState = new Map();

/** ─ IDEMPOTENCY ─ */
const usedTxids = new Set();
const usedEscrows = new Map(); // escrowId -> { wallet, amountRaw, txid, room }

/** ─ GENERIC HELPERS ─ */
function getRoomFor(socket) {
  return rooms.get(socket.id);
}
function getRoomState(room) {
  return roomState.get(room) || null;
}
function cleanupRoom(room) {
  const s = roomState.get(room);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  if (s.roundTicker) clearTimeout(s.roundTicker);
  if (s.oppDropTicker) clearTimeout(s.oppDropTicker);
  roomState.delete(room);
}

function clearRoomMembership(room, state) {
  const ids = [state?.playerAId, state?.playerBId].filter(Boolean);
  ids.forEach((id) => {
    rooms.delete(id);
    const player = io.sockets.sockets.get(id);
    if (!player) return;
    player.leave(room);
    player.opponent = null;
    player.fieldCard = null;
    player.hasEndedTurn = false;
  });
}

async function refundRoomPayments(room, state) {
  if (!state || state.escrowRefunded) return;
  const payments = Object.entries(state.payments || {});
  if (!payments.length) return;

  state.escrowRefunded = true;

  for (const [wallet, payment] of payments) {
    try {
      await refundFromTreasuryTokens({
        toWallet: wallet,
        amountRaw: payment.amountRaw,
        mint: payment.mint,
        decimals: payment.decimals,
      });

      const playerId = wallet === state.walletA ? state.playerAId : state.playerBId;
      const player = io.sockets.sockets.get(playerId);
      player?.emit("refundProcessed", {
        amountRaw: payment.amountRaw,
        decimals: payment.decimals,
        reason: "Match canceled before both players confirmed.",
      });
    } catch (e) {
      console.error("Refund canceled match failed:", e?.message || e);
    }
  }
}

async function cancelPendingRoom(room, leavingSocket, reason = "Opponent left the match.") {
  const state = getRoomState(room);
  if (!state || state.gameStarted) return false;

  state.canceled = true;
  state.phase = "canceled";

  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  const leavingWallet = leavingSocket?.wallet || null;
  io.to(room).emit("matchCanceled", {
    reason,
    by: leavingWallet,
  });

  await refundRoomPayments(room, state);
  clearRoomMembership(room, state);
  cleanupRoom(room);
  return true;
}

async function refundSubmittedPaymentIfValid({
  socket,
  wallet,
  txid,
  betAmountRaw,
  betMint,
  betDecimals,
  escrowId,
  reason,
}) {
  const mint = betMint || WAGER_MINT;
  const decimals = betDecimals != null ? Number(betDecimals) : WAGER_DECIMALS;

  if (!txid || !wallet || !betAmountRaw || !escrowId) {
    socket.emit("paymentError", { reason });
    return;
  }

  try {
    const verified = await verifyTreasuryTokenDepositWithEscrow({
      txid,
      expectedAmountRaw: betAmountRaw,
      fromWallet: wallet,
      escrowId,
      mint,
      decimals,
    });

    if (verified.ok) {
      await refundFromTreasuryTokens({
        toWallet: wallet,
        amountRaw: betAmountRaw,
        mint,
        decimals,
      });
      socket.emit("refundProcessed", {
        amountRaw: betAmountRaw,
        decimals,
        reason,
      });
    }
  } catch (e) {
    console.error("Refund submitted payment failed:", e?.message || e);
  }

  socket.emit("paymentError", { reason });
}
async function withRetry(fn, { tries = 5, baseDelayMs = 500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw last;
}
function removeFromQueues(sock) {
  ["quick", "friendly"].forEach((m) => {
    const q = queues[m];
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].id === sock.id) q.splice(i, 1);
    }
  });
}

/** ─ MEMO DECODE ─ */
function decodeMemoFromParsedTx(parsedTx) {
  try {
    if (!parsedTx?.transaction?.message) return null;
    const msg = parsedTx.transaction.message;

    if (Array.isArray(msg.instructions)) {
      for (const ix of msg.instructions) {
        if (ix.programId && ix.programId.toBase58?.() === MEMO_PROGRAM_ID) {
          if (ix.data) {
            const buf = Buffer.from(ix.data, "base64");
            return buf.toString("utf8");
          }
        }
        if (
          ix.program === "spl-memo" ||
          ix.programId?.toBase58?.() === MEMO_PROGRAM_ID
        ) {
          if (ix.parsed && typeof ix.parsed === "string") return ix.parsed;
          if (ix.data) {
            const buf = Buffer.from(ix.data, "base64");
            return buf.toString("utf8");
          }
        }
      }
    }

    const logs = parsedTx?.meta?.logMessages || [];
    const log = logs.find((l) => l.toLowerCase().includes("memo"));
    if (log) {
      const parts = log.split(":").map((s) => s.trim());
      return parts[parts.length - 1] || null;
    }
  } catch (e) {
    console.error("Memo decode error:", e?.message || e);
  }
  return null;
}

/** ✅ FIX: Resolve token program for a mint (Tokenkeg vs Token-2022) */
async function resolveTokenProgramIdForMint(mint) {
  const mintPk = new PublicKey(mint);
  const info = await withRetry(() => connection.getAccountInfo(mintPk), {
    tries: 5,
    baseDelayMs: 600,
  });
  if (!info) throw new Error("Mint account not found on chain.");

  const owner = info.owner.toBase58();
  if (owner === TOKEN_2022_PROGRAM_ID.toBase58()) return TOKEN_2022_PROGRAM_ID;
  if (owner === TOKEN_PROGRAM_ID.toBase58()) return TOKEN_PROGRAM_ID;

  throw new Error(`Unsupported token program for mint. Owner=${owner}`);
}

/** ✅ Ensure ATA exists (treasury and optional fee) — Tokenkeg/Token-2022 safe */
async function ensureAta({ mint, owner }) {
  const mintPk = new PublicKey(mint);
  const ownerPk = new PublicKey(owner);

  // ✅ detect correct token program for this mint
  const tokenProgramId = await resolveTokenProgramIdForMint(mint);

  // ✅ derive ATA with same token program
  const ata = await getAssociatedTokenAddress(
    mintPk,
    ownerPk,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const info = await connection.getAccountInfo(ata);
  if (info) return ata;

  // create ATA (payer = treasury)
  const ix = createAssociatedTokenAccountInstruction(
    treasuryKeypair.publicKey,
    ata,
    ownerPk,
    mintPk,
    tokenProgramId, // ✅ IMPORTANT
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(ix);
  tx.feePayer = treasuryKeypair.publicKey;
  const { blockhash } = await withRetry(() => connection.getLatestBlockhash(), {
    tries: 5,
    baseDelayMs: 600,
  });
  tx.recentBlockhash = blockhash;
  tx.sign(treasuryKeypair);

  const sig = await withRetry(() => connection.sendRawTransaction(tx.serialize()), {
    tries: 5,
    baseDelayMs: 600,
  });
  await withRetry(() => connection.confirmTransaction(sig, "confirmed"), {
    tries: 5,
    baseDelayMs: 600,
  });

  return ata;
}

/** ✅ Verify SPL token deposit + memo escrowId (Tokenkeg/Token-2022 safe) */
async function verifyTreasuryTokenDepositWithEscrow({
  txid,
  expectedAmountRaw,
  fromWallet,
  escrowId,
  mint,
  decimals,
}) {
  try {
    const tx = await withRetry(
      () =>
        connection.getParsedTransaction(txid, {
          maxSupportedTransactionVersion: 0,
        }),
      { tries: 5, baseDelayMs: 600 }
    );
    if (!tx || !tx.meta) return { ok: false, reason: "Tx not found" };

    // prevent re-processing same txid
    if (usedTxids.has(txid)) return { ok: false, reason: "Duplicate txid" };

    // memo must match
    const memo = decodeMemoFromParsedTx(tx);
    if (!memo || memo !== escrowId) {
      return { ok: false, reason: "Missing/invalid memo escrowId" };
    }

    const mintPk = new PublicKey(mint);
    const fromOwner = new PublicKey(fromWallet);
    const treasuryOwner = treasuryKeypair.publicKey;

    // ✅ detect correct token program for this mint
    const tokenProgramId = await resolveTokenProgramIdForMint(mint);

    // ✅ derive ATAs with correct token program
    const fromAta = await getAssociatedTokenAddress(
      mintPk,
      fromOwner,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const treasuryAta = await getAssociatedTokenAddress(
      mintPk,
      treasuryOwner,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Look for parsed SPL token transferChecked (or transfer) matching src/dst/mint/amount
    const ixs = tx.transaction.message.instructions || [];
    let matched = false;

    for (const ix of ixs) {
      // On mainnet parsed instruction program is usually "spl-token"
      // and applies to both Tokenkeg and Token-2022 in parsed form.
      if (ix.program !== "spl-token" || !ix.parsed) continue;

      const parsed = ix.parsed;
      const type = parsed.type;
      const info = parsed.info || {};

      const src = info.source;
      const dst = info.destination;
      const ixMint = info.mint;
      const tokenAmount = info.tokenAmount || info.amount;

      // Normalize raw amount
      let amountRaw = null;
      let ixDecimals = decimals;

      if (tokenAmount && typeof tokenAmount === "object") {
        amountRaw = tokenAmount.amount != null ? Number(tokenAmount.amount) : null;
        ixDecimals =
          tokenAmount.decimals != null ? Number(tokenAmount.decimals) : ixDecimals;
      } else if (typeof tokenAmount === "string" || typeof tokenAmount === "number") {
        amountRaw = Number(tokenAmount);
      }

      if (!src || !dst || !ixMint || amountRaw == null) continue;

      if (String(ixMint) !== mintPk.toBase58()) continue;
      if (String(src) !== fromAta.toBase58()) continue;
      if (String(dst) !== treasuryAta.toBase58()) continue;

      // for transferChecked ensure decimals match expectation
      if (type === "transferChecked" && Number(ixDecimals) !== Number(decimals)) {
        return { ok: false, reason: "Decimals mismatch" };
      }

      if (Number(amountRaw) !== Number(expectedAmountRaw)) {
        return { ok: false, reason: "Amount mismatch" };
      }

      matched = true;
      break;
    }

    if (!matched) return { ok: false, reason: "Token transfer not found" };

    return { ok: true, tokenProgramId: tokenProgramId.toBase58() };
  } catch (e) {
    console.error("RPC verify error:", e?.message || e);
    return { ok: false, reason: "RPC unavailable" };
  }
}

/** ✅ Send SPL tokens from treasury ATA to destination owner ATA (Tokenkeg/Token-2022 safe) */
async function sendTokensFromTreasury({ toWallet, amountRaw, mint, decimals }) {
  if (!amountRaw || amountRaw <= 0) return null;

  const mintPk = new PublicKey(mint);
  const toOwner = new PublicKey(toWallet);

  const treasuryOwner = treasuryKeypair.publicKey;

  // ✅ detect correct token program for this mint
  const tokenProgramId = await resolveTokenProgramIdForMint(mint);

  // ✅ ensure ATAs (derive + create) using correct token program inside ensureAta
  const fromAta = await ensureAta({ mint, owner: treasuryOwner.toBase58() });
  const toAta = await ensureAta({ mint, owner: toOwner.toBase58() });

  const tx = new Transaction().add(
    createTransferCheckedInstruction(
      fromAta,
      mintPk,
      toAta,
      treasuryOwner,
      Number(amountRaw),
      Number(decimals),
      [],
      tokenProgramId // ✅ IMPORTANT
    )
  );

  tx.feePayer = treasuryOwner;
  const { blockhash } = await withRetry(() => connection.getLatestBlockhash(), {
    tries: 5,
    baseDelayMs: 600,
  });
  tx.recentBlockhash = blockhash;
  tx.sign(treasuryKeypair);

  const sig = await withRetry(() => connection.sendRawTransaction(tx.serialize()), {
    tries: 5,
    baseDelayMs: 600,
  });
  await withRetry(() => connection.confirmTransaction(sig, "confirmed"), {
    tries: 5,
    baseDelayMs: 600,
  });

  return sig;
}

const refundFromTreasuryTokens = sendTokensFromTreasury;

/** Rake calc (basis points) */
function calcRakeSplit(potAmountRaw) {
  if (!RAKE_BPS || RAKE_BPS <= 0)
    return { rakeAmountRaw: 0, payoutAmountRaw: potAmountRaw };
  const rakeAmountRaw = Math.floor((potAmountRaw * RAKE_BPS) / 10_000);
  const payoutAmountRaw = Math.max(0, potAmountRaw - rakeAmountRaw);
  return { rakeAmountRaw, payoutAmountRaw };
}

/** Send rake (if configured) and winner payout */
async function distributePotWithRakeTokens({ potAmountRaw, winnerWallet, mint, decimals }) {
  const { rakeAmountRaw, payoutAmountRaw } = calcRakeSplit(potAmountRaw);

  if (rakeAmountRaw > 0 && FEE_WALLET) {
    try {
      await sendTokensFromTreasury({
        toWallet: FEE_WALLET,
        amountRaw: rakeAmountRaw,
        mint,
        decimals,
      });
      console.log(`🏦 Rake sent: ${rakeAmountRaw} raw -> ${FEE_WALLET}`);
    } catch (e) {
      console.error("❌ Failed sending rake:", e?.message || e);
    }
  } else if (rakeAmountRaw > 0 && !FEE_WALLET) {
    console.warn("⚠️ Rake configured but FEE_WALLET missing — skipping rake payout.");
  }

  if (payoutAmountRaw > 0 && winnerWallet) {
    await sendTokensFromTreasury({
      toWallet: winnerWallet,
      amountRaw: payoutAmountRaw,
      mint,
      decimals,
    });
    console.log(`👑 Winner paid: ${payoutAmountRaw} raw -> ${winnerWallet}`);
  }
}

/** ─ LOBBY/DECK HELPERS ─ */
function initSocketRound(s) {
  s.roundScore = 0;
  s.roundHistory = [];
  s.hand = [];
  s.fieldCard = null;
  s.hasEndedTurn = false;
}

// cards = [{ cid, image, name }]
function drawThree(cards) {
  const sel = [];
  const temp = [...cards];

  while (sel.length < 3 && temp.length) {
    const i = Math.floor(Math.random() * temp.length);
    const nft = temp.splice(i, 1)[0];

    sel.push({
      uid: `${Date.now()}-${sel.length}-${Math.random().toString(36).slice(2)}`,
      cid: nft.cid,
      image: nft.image || null,
      name: nft.name || null,
    });
  }

  return sel;
}

function consumePlayedCard(sock, uid) {
  if (!sock?.hand) return;
  sock.hand = sock.hand.filter((c) => c.uid !== uid);
}

/**
 * ✅ ADDITIVE FIX: build a full card payload so client can reveal NFT images.
 * - looks up by uid from sock.hand
 * - falls back to {uid,cid} if missing
 * - includes power for overlay convenience
 */
function getFullCardFromSocket(sock, uid, cid, power) {
  const fromHand = (sock?.hand || []).find((c) => c.uid === uid);
  if (fromHand) {
    return {
      uid: fromHand.uid,
      cid: fromHand.cid,
      image: fromHand.image || null,
      name: fromHand.name || null,
      skill: fromHand.skill || null,
      power: power != null ? power : undefined,
    };
  }
  return {
    uid: uid || null,
    cid: cid || null,
    image: null,
    name: null,
    skill: null,
    power: power != null ? power : undefined,
  };
}

/** ─ SOCKET.IO ─ */
io.on("connection", (socket) => {
  console.log("🟢 Player connected:", socket.id);
  attachEarnNpcSocket(io, socket, { buildDeckFromDb });

  socket.on("hello", ({ wallet }) => {
    socket.wallet = wallet;
  });

  socket.on("cancelFindMatch", () => {
    removeFromQueues(socket);
    const room = rooms.get(socket.id);
    if (room) {
      void cancelPendingRoom(room, socket, "Opponent canceled the match.");
      return;
    }
    socket.emit("searchCanceled");
  });

  socket.on("leaveMatch", async ({ reason } = {}) => {
    removeFromQueues(socket);
    const room = rooms.get(socket.id);
    if (!room) {
      socket.emit("searchCanceled");
      return;
    }

    const state = getRoomState(room);
    if (state?.gameStarted && !state.gameOver) {
      const other = socket.opponent;
      if (other) {
        state.gameOver = true;
        other.emit("duelResult", {
          winner: other.wallet,
          loser: socket.wallet,
          forfeit: true,
        });
      }
      cleanupRoom(room);
      if (state) clearRoomMembership(room, state);
      return;
    }

    await cancelPendingRoom(room, socket, reason || "Opponent left the match.");
  });

  // FIND MATCH
  socket.on("findMatch", async ({ wallet, mode, bet }) => {
    try {
      socket.wallet = wallet;

      const selectedMode = mode === "friendly" ? "friendly" : "quick";
      socket.mode = selectedMode;
      socket.bet = bet;

      const { cardIds, cardPowersMap } = await buildDeckFromDb(wallet);
      socket.userCards = cardIds;
      socket.cardPowers = cardPowersMap;

      if ((socket.userCards?.length || 0) < NEED_MIN_CARDS) {
        socket.emit("insufficientDeck", {
          you: socket.userCards?.length || 0,
          need: NEED_MIN_CARDS,
        });
        return;
      }

      removeFromQueues(socket);

      const q = queues[selectedMode];
      if (!q) {
        socket.emit("paymentError", { reason: "Invalid game mode." });
        return;
      }

      if (q.length) {
        let opponent = null;
        while (q.length) {
          const cand = q.shift();
          const stillHere = io.sockets.sockets.get(cand.id);
          if (!stillHere) continue;
          if (cand.id === socket.id) continue;

          if ((cand.userCards?.length || 0) < NEED_MIN_CARDS) {
            cand.emit?.("insufficientDeck", {
              you: cand.userCards?.length || 0,
              need: NEED_MIN_CARDS,
            });
            continue;
          }
          opponent = cand;
          break;
        }

        if (!opponent) {
          q.push(socket);
          return;
        }

        const room = `${socket.id}#${opponent.id}`;
        socket.join(room);
        opponent.join(room);
        rooms.set(socket.id, room);
        rooms.set(opponent.id, room);

        socket.opponent = opponent;
        opponent.opponent = socket;

        initSocketRound(socket);
        initSocketRound(opponent);

        roomState.set(room, {
          mode: socket.mode,
          payments: {}, // { [wallet]: { txid, amountRaw, escrowId, mint, decimals } }
          timer: null,
          deadline: null,
          gameStarted: false,
          gameOver: false,
          matchId: null,
          lockedBetAmountRaw: undefined,
          betMint: WAGER_MINT,
          betDecimals: WAGER_DECIMALS,
          playerAId: socket.id < opponent.id ? socket.id : opponent.id,
          playerBId: socket.id < opponent.id ? opponent.id : socket.id,
          walletA: socket.id < opponent.id ? socket.wallet : opponent.wallet,
          walletB: socket.id < opponent.id ? opponent.wallet : socket.wallet,
          pending: {},
          resolving: false,
          history: [],
          wins: { [socket.wallet]: 0, [opponent.wallet]: 0 },
          roundEndAt: null,
          roundTicker: null,
          oppDropTicker: null,
          oppReconnectDeadline: null,
          phase: "matching",
          escrowRefunded: false,
        });

        opponent.emit("matchFound", {
          opponentWallet: wallet,
          isFirst: true,
          mode: socket.mode,
        });
        socket.emit("matchFound", {
          opponentWallet: opponent.wallet,
          isFirst: false,
          mode: socket.mode,
        });

        if (socket.mode === "friendly") {
          const state = roomState.get(room);
          state.phase = "dueling";
          state.gameStarted = true;
          try {
            const matchDoc = await Match.create({
              player1: state.walletA,
              player2: state.walletB,
              bet: 0,
              totalPot: 0,
              rounds: [],
            });
            state.matchId = matchDoc._id;
          } catch (e) {
            console.error("Create friendly match doc failed:", e?.message || e);
          }
          dealHands(room);
        }
      } else {
        q.push(socket);
      }
    } catch (e) {
      console.error("findMatch error:", e?.message || e);
      socket.emit("paymentError", { reason: "Server error finding match." });
    }
  });

  // BETTING SIGNALS (Quick only)
  socket.on("sendBetProposal", ({ bet }) => {
    const room = getRoomFor(socket);
    const state = getRoomState(room);
    if (!state || state.mode !== "quick" || state.canceled) return;
    socket.bet = bet;
    socket.opponent?.emit("proposalReceived", {
      opponentWallet: socket.wallet,
      bet,
    });
  });

  socket.on("acceptProposal", ({ bet }) => {
    const room = getRoomFor(socket);
    const state = getRoomState(room);
    if (!state || state.mode !== "quick" || state.canceled) return;
    socket.bet = bet;
    state.phase = "confirming";
    state.acceptedBet = bet;
    socket.opponent?.emit("acceptProposal", { bet });
  });

  socket.on("beginDuelPayment", ({ wallet, betAmountRaw, escrowId } = {}, ack) => {
    const reply = (payload) => {
      if (typeof ack === "function") ack(payload);
    };

    const room = getRoomFor(socket);
    const state = getRoomState(room);
    const other = socket.opponent;

    if (wallet && socket.wallet && wallet !== socket.wallet) {
      reply({ ok: false, reason: "Wallet changed. Please reconnect and find a new match." });
      return;
    }

    if (!room || !state || state.mode !== "quick") {
      reply({ ok: false, reason: "Match is no longer active." });
      return;
    }

    if (state.canceled || state.phase === "canceled" || state.gameStarted) {
      reply({ ok: false, reason: "Match is no longer active." });
      return;
    }

    const otherOnline = !!(other && io.sockets.sockets.get(other.id));
    if (!otherOnline) {
      void cancelPendingRoom(room, socket, "Opponent left before payment.");
      reply({ ok: false, reason: "Opponent left before payment." });
      return;
    }

    state.phase = "confirming";
    state.paymentReady = state.paymentReady || {};
    state.paymentReady[socket.id] = {
      wallet: wallet || socket.wallet,
      betAmountRaw: betAmountRaw || null,
      escrowId: escrowId || null,
      at: Date.now(),
    };
    reply({ ok: true });
  });

  /**
   * ✅ CONFIRM & ESCROW (Quick only) - SPL token verified
   */
  socket.on(
    "confirmDuel",
    async ({ wallet, txid, betAmountRaw, betMint, betDecimals, escrowId }) => {
      const room = getRoomFor(socket);
      if (!room) {
        await refundSubmittedPaymentIfValid({
          socket,
          wallet,
          txid,
          betAmountRaw,
          betMint,
          betDecimals,
          escrowId,
          reason: "Match is no longer active. Refunded if payment was received.",
        });
        return;
      }
      const state = getRoomState(room);
      if (!state || state.mode !== "quick") {
        await refundSubmittedPaymentIfValid({
          socket,
          wallet,
          txid,
          betAmountRaw,
          betMint,
          betDecimals,
          escrowId,
          reason: "Match is no longer active. Refunded if payment was received.",
        });
        return;
      }
      const other = socket.opponent;

      const mint = betMint || state.betMint || WAGER_MINT;
      const decimals =
        betDecimals != null ? Number(betDecimals) : state.betDecimals || WAGER_DECIMALS;

      if (state.phase === "matching") state.phase = "confirming";

      if (state.canceled || state.phase === "canceled") {
        await refundSubmittedPaymentIfValid({
          socket,
          wallet,
          txid,
          betAmountRaw,
          betMint: mint,
          betDecimals: decimals,
          escrowId,
          reason: "Match was canceled. Refunded if payment was received.",
        });
        return;
      }

      const otherOnline = !!(other && io.sockets.sockets.get(other.id));
      if (!otherOnline) {
        await refundSubmittedPaymentIfValid({
          socket,
          wallet,
          txid,
          betAmountRaw,
          betMint: mint,
          betDecimals: decimals,
          escrowId,
          reason: "Opponent disconnected. Refunded if payment was received.",
        });
        clearRoomMembership(room, state);
        cleanupRoom(room);
        return;
      }

      // Idempotency
      if (usedTxids.has(txid)) {
        socket.emit("paymentError", { reason: "Duplicate transaction." });
        return;
      }
      if (usedEscrows.has(escrowId)) {
        try {
          await refundFromTreasuryTokens({
            toWallet: wallet,
            amountRaw: betAmountRaw,
            mint,
            decimals,
          });
        } catch (e) {
          console.error("Refund (dupe escrow) failed:", e?.message || e);
        }
        socket.emit("paymentError", { reason: "Duplicate escrow. Refunded." });
        return;
      }

      const verified = await verifyTreasuryTokenDepositWithEscrow({
        txid,
        expectedAmountRaw: betAmountRaw,
        fromWallet: wallet,
        escrowId,
        mint,
        decimals,
      });

      if (!verified.ok) {
        if (
          verified.reason === "Amount mismatch" ||
          verified.reason === "Missing/invalid memo escrowId" ||
          verified.reason === "Token transfer not found"
        ) {
          try {
            await refundFromTreasuryTokens({
              toWallet: wallet,
              amountRaw: betAmountRaw,
              mint,
              decimals,
            });
          } catch (e) {
            console.error("Refund (verify fail) failed:", e?.message || e);
          }
        }
        socket.emit("paymentError", { reason: verified.reason });
        return;
      }

      // lock room bet raw amount (must match both players)
      if (!state.lockedBetAmountRaw) state.lockedBetAmountRaw = betAmountRaw;
      else if (Number(betAmountRaw) !== Number(state.lockedBetAmountRaw)) {
        try {
          await refundFromTreasuryTokens({
            toWallet: wallet,
            amountRaw: betAmountRaw,
            mint,
            decimals,
          });
        } catch {}
        socket.emit("paymentError", { reason: "Bet amount mismatch. Refunded." });
        return;
      }

      if (state.payments[wallet]) {
        try {
          await refundFromTreasuryTokens({
            toWallet: wallet,
            amountRaw: betAmountRaw,
            mint,
            decimals,
          });
        } catch {}
        socket.emit("paymentError", { reason: "Duplicate payment. Refunded." });
        return;
      }

      usedTxids.add(txid);
      usedEscrows.set(escrowId, { wallet, amountRaw: betAmountRaw, txid, room });

      state.payments[wallet] = {
        txid,
        amountRaw: betAmountRaw,
        escrowId,
        mint,
        decimals,
      };

      // escrow countdown
      if (!state.deadline) {
        state.deadline = Date.now() + 120000;
        const tick = async () => {
          const secondsLeft = Math.max(
            0,
            Math.ceil((state.deadline - Date.now()) / 1000)
          );
          io.to(room).emit("awaitingOpponentPayment", { secondsLeft });

          if (secondsLeft <= 0) {
            if (!state.escrowRefunded) {
              state.escrowRefunded = true;
              const a = state.walletA,
                b = state.walletB;
              const pA = state.payments[a],
                pB = state.payments[b];

              if (pA && !pB) {
                await refundFromTreasuryTokens({
                  toWallet: a,
                  amountRaw: pA.amountRaw,
                  mint: pA.mint,
                  decimals: pA.decimals,
                });
                io.to(room).emit("refundProcessed", {
                  amountRaw: pA.amountRaw,
                  decimals: pA.decimals,
                });
              } else if (!pA && pB) {
                await refundFromTreasuryTokens({
                  toWallet: b,
                  amountRaw: pB.amountRaw,
                  mint: pB.mint,
                  decimals: pB.decimals,
                });
                io.to(room).emit("refundProcessed", {
                  amountRaw: pB.amountRaw,
                  decimals: pB.decimals,
                });
              }
            }
            cleanupRoom(room);
            return;
          }

          state.timer = setTimeout(tick, 1000);
        };
        state.timer = setTimeout(tick, 1000);
      }

      // both paid?
      if (other?.wallet && state.payments[other.wallet]) {
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
        state.phase = "dueling";

        // Store bet (token units) for DB display
        const betUnits =
          Number(state.lockedBetAmountRaw) / Math.pow(10, decimals);

        const matchDoc = await Match.create({
          player1: state.walletA,
          player2: state.walletB,
          bet: betUnits,
          totalPot: betUnits * 2,
          rounds: [],
        });
        state.matchId = matchDoc._id;
        state.gameStarted = true;

        roomState.set(room, state);
        dealHands(room);
      } else {
        other?.emit("opponentConfirmed");
      }
    }
  );

  // ── IN-GAME ─
  socket.on("playCard", ({ uid, cid }) => {
    const room = getRoomFor(socket);
    const state = getRoomState(room);
    if (!state) return;

    if (state.phase !== "dueling" || state.resolving) {
      socket.emit("rejectPlayed", { uid, reason: "Not accepting plays right now" });
      return;
    }

    const inHand = (socket.hand || []).some((c) => c.uid === uid && c.cid === cid);
    if (!inHand) {
      socket.emit("rejectPlayed", { uid, reason: "Card not in hand" });
      return;
    }

    // ✅ ADDITIVE FIX: store full card for later reveal (image/name)
    const full = (socket.hand || []).find((c) => c.uid === uid) || { uid, cid };
    socket.fieldCard = full;

    socket.emit("ackPlayed", { uid, cid });
    socket.opponent?.emit("opponentPlayedCard");
  });

  socket.on("endTurn", async ({ uid, cid }) => {
    const room = getRoomFor(socket);
    const state = getRoomState(room);
    if (!state || state.gameOver) return;

    const exists = (socket.hand || []).some((c) => c.uid === uid && c.cid === cid);
    if (!exists) return;

    socket.hasEndedTurn = true;

    // ✅ keep current logic, but store full card too if available
    const full = (socket.hand || []).find((c) => c.uid === uid) || { uid, cid };
    socket.fieldCard = full;

    socket.opponent?.emit("opponentEndedTurn");

    state.pending[socket.id] = { uid, cid, wallet: socket.wallet };

    const bothIn = state.pending[state.playerAId] && state.pending[state.playerBId];
    if (bothIn && !state.resolving) {
      state.resolving = true;
      await resolveRound(room);
      state.resolving = false;

      const sA = io.sockets.sockets.get(state.playerAId);
      const sB = io.sockets.sockets.get(state.playerBId);
      if (sA) sA.hasEndedTurn = false;
      if (sB) sB.hasEndedTurn = false;
      state.pending = {};
    }
  });

  socket.on("disconnect", async () => {
    removeFromQueues(socket);

    const room = rooms.get(socket.id);
    if (room) {
      const state = getRoomState(room);
      const other = socket.opponent;

      if (state?.gameStarted && !state.gameOver && other) {
        other.emit("opponentDisconnected");
        startReconnectGrace(room, other);
      } else {
        await cancelPendingRoom(room, socket, "Opponent disconnected before match started.");
      }
    }
    console.log("🔴 Player disconnected:", socket.id);
  });

  /** ─ GAME FLOW ─ */
  function dealHands(room, { bonusRound = false } = {}) {
    const state = getRoomState(room);
    if (!state || state.gameOver) return;
    const sA = io.sockets.sockets.get(state.playerAId);
    const sB = io.sockets.sockets.get(state.playerBId);
    if (!sA || !sB) return;

    sA.hand = drawThree(sA.userCards);
    sB.hand = drawThree(sB.userCards);
    sA.fieldCard = null;
    sB.fieldCard = null;
    sA.hasEndedTurn = false;
    sB.hasEndedTurn = false;

    state.pending = {};
    state.resolving = false;

    sA.emit("startDuel", {
      selfCards: sA.hand,
      opponentCards: ["back", "back", "back"],
      bonusRound,
    });
    sB.emit("startDuel", {
      selfCards: sB.hand,
      opponentCards: ["back", "back", "back"],
      bonusRound,
    });

    console.log(`🎲 ${state.mode.toUpperCase()} hand dealt`);
    startRoundTimer(room);
  }

  function startRoundTimer(room) {
    const state = getRoomState(room);
    if (!state || state.gameOver) return;
    if (state.roundTicker) clearTimeout(state.roundTicker);

    state.roundEndAt = Date.now() + ROUND_SECONDS * 1000;

    const tick = async () => {
      const sA = io.sockets.sockets.get(state.playerAId);
      const sB = io.sockets.sockets.get(state.playerBId);
      if (!sA || !sB || state.gameOver) return;

      const secLeft = Math.max(0, Math.ceil((state.roundEndAt - Date.now()) / 1000));
      sA.emit("roundTimerTick", { secondsLeft: secLeft });
      sB.emit("roundTimerTick", { secondsLeft: secLeft });

      if (secLeft <= 0) {
        for (const s of [sA, sB]) {
          if (!s.fieldCard) {
            const choice = s.hand?.[0];
            if (choice) {
              // ✅ keep existing behavior, but preserve full card
              s.fieldCard = {
                uid: choice.uid,
                cid: choice.cid,
                image: choice.image || null,
                name: choice.name || null,
                skill: choice.skill || null,
              };
              s.emit("opponentPlayedCard");
            }
          }
          s.hasEndedTurn = true;
          if (s.fieldCard) {
            state.pending[s.id] = { uid: s.fieldCard.uid, cid: s.fieldCard.cid, wallet: s.wallet };
          }
        }

        const bothIn = state.pending[state.playerAId] && state.pending[state.playerBId];
        if (bothIn && !state.resolving) {
          state.resolving = true;
          await resolveRound(room);
          state.resolving = false;
          state.pending = {};
          if (sA) sA.hasEndedTurn = false;
          if (sB) sB.hasEndedTurn = false;
        }
        return;
      }

      state.roundTicker = setTimeout(tick, 1000);
    };

    state.roundTicker = setTimeout(tick, 1000);
  }

  async function resolveRound(room) {
    const state = getRoomState(room);
    if (!state || state.gameOver) return;

    if (state.roundTicker) clearTimeout(state.roundTicker);
    state.roundTicker = null;
    state.roundEndAt = null;

    const sA = io.sockets.sockets.get(state.playerAId);
    const sB = io.sockets.sockets.get(state.playerBId);
    if (!sA || !sB) return;

    const aChoice = state.pending[state.playerAId];
    const bChoice = state.pending[state.playerBId];
    const aCard = aChoice?.cid;
    const bCard = bChoice?.cid;

    const pA = aCard ? getCardPowerFromSocket(sA, aCard) : 0;
    const pB = bCard ? getCardPowerFromSocket(sB, bCard) : 0;

    console.log("[ROUND] cards & power:", { aCard, bCard, pA, pB });

    let winnerWallet = "draw";
    if (pA > pB) {
      sA.roundScore += 1;
      winnerWallet = sA.wallet;
    } else if (pB > pA) {
      sB.roundScore += 1;
      winnerWallet = sB.wallet;
    }

    // ✅ ADDITIVE FIX: build full payloads BEFORE consuming from hand
    const aFull = getFullCardFromSocket(sA, aChoice?.uid, aCard, pA);
    const bFull = getFullCardFromSocket(sB, bChoice?.uid, bCard, pB);

    if (aChoice?.uid) consumePlayedCard(sA, aChoice.uid);
    if (bChoice?.uid) consumePlayedCard(sB, bChoice.uid);

    const roundObj = {
      roundNumber: roomState.get(room).history.length + 1,
      player1: sA.wallet,
      player2: sB.wallet,
      player1Card: aCard,
      player2Card: bCard,
      player1Power: pA,
      player2Power: pB,
      winner: winnerWallet,
      timestamp: new Date(),
    };

    roomState.get(room).history.push(roundObj);
    sA.roundHistory.push(roundObj);
    sB.roundHistory.push(roundObj);

    if (roomState.get(room).matchId) {
      await Match.findByIdAndUpdate(roomState.get(room).matchId, {
        $push: { rounds: roundObj },
      });
    }

    // ✅ FIX: send full opponent card object (includes image/name) for reveal
    sA.emit("revealOpponentCard", bFull);
    sB.emit("revealOpponentCard", aFull);

    // ✅ FIX: roundResolved should include full objects so overlay always shows both cards
    sA.emit("roundResolved", {
      yourCard: aFull,
      oppCard: bFull,
      winner:
        winnerWallet === "draw"
          ? "draw"
          : winnerWallet === sA.wallet
          ? "self"
          : "opponent",
    });

    sB.emit("roundResolved", {
      yourCard: bFull,
      oppCard: aFull,
      winner:
        winnerWallet === "draw"
          ? "draw"
          : winnerWallet === sB.wallet
          ? "self"
          : "opponent",
    });

    sA.emit("scoreUpdate", { selfScore: sA.roundScore, opponentScore: sB.roundScore });
    sB.emit("scoreUpdate", { selfScore: sB.roundScore, opponentScore: sA.roundScore });

    const aWins = sA.roundScore;
    const bWins = sB.roundScore;
    const played = roomState.get(room).history.length;
    const hadDraw = roomState.get(room).history.some((r) => r.winner === "draw");

    if (aWins === 2 || bWins === 2) {
      roomState.get(room).gameOver = true;
      await finalizeMatch(room);
      return;
    }

    if (played < 3) {
      startRoundTimer(room);
      return;
    }

    if (!hadDraw) {
      roomState.get(room).gameOver = true;
      await finalizeMatch(room);
      return;
    }

    setTimeout(() => dealHands(room, { bonusRound: true }), 600);
  }

  async function finalizeMatch(roomId) {
    const state = getRoomState(roomId);
    if (!state) return;
    const sA = io.sockets.sockets.get(state.playerAId);
    const sB = io.sockets.sockets.get(state.playerBId);
    if (!sA || !sB) return;

    const aWins = sA.roundScore;
    const bWins = sB.roundScore;
    const winner = aWins > bWins ? sA.wallet : sB.wallet;
    const loser = winner === sA.wallet ? sB.wallet : sA.wallet;

    const mint = state.betMint || WAGER_MINT;
    const decimals = state.betDecimals || WAGER_DECIMALS;

    const pA = state.payments?.[state.walletA];
    const pB = state.payments?.[state.walletB];
    const potAmountRaw = (pA?.amountRaw || 0) + (pB?.amountRaw || 0);

    const betUnits = Number(state.lockedBetAmountRaw || 0) / Math.pow(10, decimals);

    try {
      if (state.matchId) {
        await Match.findByIdAndUpdate(state.matchId, {
          winner,
          loser,
          bet: state.mode === "quick" ? betUnits : 0,
          totalPot: state.mode === "quick" ? betUnits * 2 : 0,
        });
      } else {
        await Match.create({
          winner,
          loser,
          player1: state.walletA,
          player2: state.walletB,
          bet: state.mode === "quick" ? betUnits : 0,
          totalPot: state.mode === "quick" ? betUnits * 2 : 0,
          rounds: state.history,
        });
      }

      if (potAmountRaw > 0) {
        await distributePotWithRakeTokens({
          potAmountRaw,
          winnerWallet: winner,
          mint,
          decimals,
        });
      }

      io.to(roomId).emit("duelResult", { winner, loser });
    } catch (e) {
      console.error("Failed to finalize match:", e?.message || e);
    }

    cleanupRoom(roomId);
    rooms.delete(sA.id);
    rooms.delete(sB.id);
  }

  function startReconnectGrace(room, survivorSocket) {
    const state = getRoomState(room);
    if (!state || state.gameOver) return;
    if (state.oppDropTicker) clearTimeout(state.oppDropTicker);

    state.oppReconnectDeadline = Date.now() + RECONNECT_SECONDS * 1000;
    const tick = async () => {
      const secLeft = Math.max(
        0,
        Math.ceil((state.oppReconnectDeadline - Date.now()) / 1000)
      );
      survivorSocket.emit("opponentReconnectCountdown", { secondsLeft: secLeft });

      if (secLeft <= 0) {
        state.gameOver = true;
        try {
          const sA = io.sockets.sockets.get(state.playerAId);
          const sB = io.sockets.sockets.get(state.playerBId);

          const winner = survivorSocket.wallet;
          const loser = sA?.wallet === winner ? sB?.wallet : sA?.wallet;

          const mint = state.betMint || WAGER_MINT;
          const decimals = state.betDecimals || WAGER_DECIMALS;

          const pA = state.payments?.[state.walletA];
          const pB = state.payments?.[state.walletB];
          const potAmountRaw = (pA?.amountRaw || 0) + (pB?.amountRaw || 0);

          const betUnits =
            Number(state.lockedBetAmountRaw || 0) / Math.pow(10, decimals);

          if (state.matchId) {
            await Match.findByIdAndUpdate(state.matchId, {
              winner,
              loser,
              bet: state.mode === "quick" ? betUnits : 0,
              totalPot: state.mode === "quick" ? betUnits * 2 : 0,
            });
          } else {
            await Match.create({
              winner,
              loser,
              player1: state.walletA,
              player2: state.walletB,
              bet: state.mode === "quick" ? betUnits : 0,
              totalPot: state.mode === "quick" ? betUnits * 2 : 0,
              rounds: state.history,
            });
          }

          if (potAmountRaw > 0) {
            await distributePotWithRakeTokens({
              potAmountRaw,
              winnerWallet: winner,
              mint,
              decimals,
            });
          }

          io.to(room).emit("duelResult", { winner, loser, forfeit: true });
        } catch (e) {
          console.error("Failed to save forfeit:", e?.message || e);
        }
        cleanupRoom(room);
        return;
      }

      state.oppDropTicker = setTimeout(tick, 1000);
    };

    state.oppDropTicker = setTimeout(tick, 1000);
  }

  socket.on("requestResume", () => {
    const room = getRoomFor(socket);
    const state = getRoomState(room);
    if (!room || !state) return;
    const meId = socket.id;
    const oppId = meId === state.playerAId ? state.playerBId : state.playerAId;
    const me = io.sockets.sockets.get(meId);
    const opp = io.sockets.sockets.get(oppId);

    const snap = {
      status: state.gameStarted && !state.gameOver ? "dueling" : "matchFound",
      selfScore: me?.roundScore || 0,
      opponentScore: opp?.roundScore || 0,
      selfCards: me?.hand || [],
      opponentCards: (opp?.hand || []).map(() => "back"),
      selfFieldCard: me?.fieldCard || null,
      opponentFieldCard: opp?.fieldCard ? opp.fieldCard.cid : null,
      youEnded: !!me?.hasEndedTurn,
      oppEnded: !!opp?.hasEndedTurn,
      roundSecondsLeft: state.roundEndAt
        ? Math.max(0, Math.ceil((state.roundEndAt - Date.now()) / 1000))
        : null,
    };
    socket.emit("resumeState", snap);
  });
});

async function warmupTreasuryAtas() {
  if (!WAGER_MINT) {
    console.warn(
      "WAGER_MINT not set. Quick match token betting will fail verification."
    );
    return;
  }

  try {
    await ensureAta({ mint: WAGER_MINT, owner: TREASURY_PUBKEY });
    console.log(`Treasury ATA ensured for mint ${WAGER_MINT}`);
    if (FEE_WALLET) {
      await ensureAta({ mint: WAGER_MINT, owner: FEE_WALLET });
      console.log(`Fee ATA ensured for mint ${WAGER_MINT}`);
    }
  } catch (e) {
    const log = isRecoverableNetworkError(e) ? console.warn : console.error;
    log(
      "Startup ATA warmup skipped; server will continue. Token payouts may fail until RPC recovers:",
      e?.message || e
    );
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Solana RPC: ${SOLANA_RPC}`);
  console.log(
    `Rake: ${RAKE_BPS} bps (${(RAKE_BPS / 100).toFixed(2)}%) -> ${
      FEE_WALLET || "DISABLED"
    }`
  );
  warmupTreasuryAtas();
  return;
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Using Solana RPC: ${SOLANA_RPC}`);
  console.log(
    `💰 Rake: ${RAKE_BPS} bps (${(RAKE_BPS / 100).toFixed(2)}%) → ${
      FEE_WALLET || "DISABLED"
    }`
  );

  if (!WAGER_MINT) {
    console.warn(
      "⚠️ WAGER_MINT not set. Quick match token betting will fail verification."
    );
  } else {
    // Ensure treasury ATA exists on startup
    try {
      await ensureAta({ mint: WAGER_MINT, owner: TREASURY_PUBKEY });
      console.log(`✅ Treasury ATA ensured for mint ${WAGER_MINT}`);
      if (FEE_WALLET) {
        await ensureAta({ mint: WAGER_MINT, owner: FEE_WALLET });
        console.log(`✅ Fee ATA ensured for mint ${WAGER_MINT}`);
      }
    } catch (e) {
      console.error("❌ Failed ensuring ATAs:", e?.message || e);
    }
  }
});
