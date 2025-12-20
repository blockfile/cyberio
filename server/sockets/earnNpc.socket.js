// server/sockets/earnNpc.socket.js
// Play.jsx-style Earn NPC (server) + Token-2022 support
// REQUIRED BEHAVIOR (your request):
// - Requires active Dimension Pass
// - Requires >= 2 NFT cards with power < 5
// - 10 matches/day (win/lose both count)
// - 1000 CYBERIO per match WIN, 0 if lose
// - 10,000/day cap (so to reach 10k you must win 10/10)
// - After 10 matches, cooldown for 24 hours (lockedUntil)
// - DRAW discards both cards
// - Score does NOT change on draw
// - If DRAW happens at match point (e.g. 1–1 when roundsToWin=2), trigger BONUS redeal
// - BONUS RESETS roundsPlayed = 0 BUT KEEPS SCORE
// - NPC card is only revealed for modal (client shows back on field)
// - Supports BOTH Tokenkeg and Token-2022 mints (auto-detect mint owner program)
// - Uses ATA derivation/creation with correct token program id + TransferChecked

const crypto = require("crypto");
const bs58 = require("bs58");
const { Connection, PublicKey, Keypair, Transaction } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const NpcPayout = require("../model/NpcPayout");
const EarnDaily = require("../model/EarnDaily");
const DimensionPass = require("../model/DimensionPass"); // ✅ required
const NftAssetDb = require("../model/NftAssetDb"); // ✅ required (reads your nftassets collection)
const CARD_META = require("../util/cardMetadata.json");

// ===== CONFIG =====
const ROUNDS_TO_WIN = Number(process.env.EARN_ROUNDS_TO_WIN || 2);

// P2E rules (fixed)
const MATCHES_PER_DAY = Number(process.env.EARN_MATCHES_PER_DAY || 10);
const WIN_PAYOUT = Number(process.env.EARN_WIN_PAYOUT || 1000);
const DAILY_CAP = Number(process.env.EARN_DAILY_CAP || 10000);

// requirements
const LOW_POWER_THRESHOLD = Number(process.env.EARN_LOW_POWER_THRESHOLD || 5);
const LOW_POWER_MIN_COUNT = Number(process.env.EARN_LOW_POWER_MIN_COUNT || 2);

// payouts config (token mint)
const TOKEN_MINT = process.env.SD_TOKEN_MINT || process.env.NPC_TOKEN_MINT;
const RPC = process.env.SOLANA_RPC;
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;

if (!RPC) console.warn("⚠️ SOLANA_RPC is missing");
if (!TOKEN_MINT) console.warn("⚠️ TOKEN_MINT (SD_TOKEN_MINT or NPC_TOKEN_MINT) is missing");
if (!TREASURY_PRIVATE_KEY) console.warn("⚠️ TREASURY_PRIVATE_KEY is missing");

const connection = new Connection(RPC, "confirmed");

// ===== HELPERS =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSessionId() {
  return crypto.randomUUID?.() || `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function assertWallet(w) {
  try {
    return new PublicKey(w).toBase58();
  } catch {
    throw new Error("Invalid wallet");
  }
}

function loadTreasury() {
  const secret = bs58.decode(TREASURY_PRIVATE_KEY);
  return Keypair.fromSecretKey(secret);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function pow10(decimals) {
  let x = 1n;
  for (let i = 0; i < Number(decimals || 0); i++) x *= 10n;
  return x;
}

async function resolveTokenProgramId(mintPk) {
  const info = await connection.getAccountInfo(mintPk);
  if (!info) throw new Error("Mint account not found on chain");
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(`Unsupported mint owner program: ${info.owner.toBase58()}`);
}

function parseSendTxError(e) {
  const msg = String(e?.message || e || "Unknown error");
  const logs =
    e?.logs || (typeof e?.getLogs === "function" ? e.getLogs() : null) || null;
  return { msg, logs };
}

// NPC deck from JSON meta
function pickNpcHand(size = 3) {
  const ids = shuffle(Object.keys(CARD_META)).slice(0, size);
  return ids.map((cid, i) => ({
    uid: `npc-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    cid: String(cid),
    name: CARD_META[cid]?.name || `NPC-${cid}`,
    power: Number(CARD_META[cid]?.power || 0),
    image: CARD_META[cid]?.image || null,
  }));
}

function computeWinner(playerCard, npcCard) {
  const p = Number(playerCard?.power || 0);
  const n = Number(npcCard?.power || 0);
  if (p > n) return "self";
  if (n > p) return "opponent";
  return "draw";
}

/**
 * Transfer reward safely for BOTH Tokenkeg and Token-2022 mints.
 * Uses TransferChecked.
 * amountUi = whole tokens (1000 means 1000.000000 if decimals 6)
 */
async function transferReward(wallet, amountUi) {
  if (!TOKEN_MINT || !TREASURY_PRIVATE_KEY) return null;
  if (!amountUi || amountUi <= 0) return null;

  const treasury = loadTreasury();
  const mintPk = new PublicKey(TOKEN_MINT);
  const userPk = new PublicKey(wallet);

  const tokenProgramId = await resolveTokenProgramId(mintPk);

  const mintInfo = await getMint(connection, mintPk, "confirmed", tokenProgramId);
  const decimals = mintInfo.decimals;

  // Treat amountUi as whole tokens
  const amountRaw = BigInt(Math.floor(Number(amountUi))) * pow10(decimals);

  const fromAta = await getAssociatedTokenAddress(
    mintPk,
    treasury.publicKey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const toAta = await getAssociatedTokenAddress(
    mintPk,
    userPk,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ix = [];

  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    ix.push(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey, // payer
        toAta,              // ata
        userPk,             // owner
        mintPk,             // mint
        tokenProgramId,     // important for Token-2022
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  ix.push(
    createTransferCheckedInstruction(
      fromAta,
      mintPk,
      toAta,
      treasury.publicKey,
      amountRaw,
      decimals,
      [],
      tokenProgramId
    )
  );

  const tx = new Transaction().add(...ix);
  tx.feePayer = treasury.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(treasury);

  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  } catch (e) {
    const { msg, logs } = parseSendTxError(e);
    const extra = logs ? `\nLogs:\n${JSON.stringify(logs, null, 2)}` : "";
    throw new Error(`Reward transfer failed: ${msg}${extra}`);
  }
}

// ===== P2E ELIGIBILITY HELPERS =====

async function getPassStatus(wallet) {
  // expected schema: { wallet, expiresAt }
  const pass = await DimensionPass.findOne({ wallet }).lean();
  const expiresAt = pass?.expiresAt || null;
  const hasActive = !!(expiresAt && new Date(expiresAt) > new Date());
  return { hasActive, expiresAt };
}

async function getLowPowerCount(wallet) {
  // expected schema: nftassets.ownerWallet + nftassets.power
  const count = await NftAssetDb.countDocuments({
    ownerWallet: wallet,
    power: { $lt: LOW_POWER_THRESHOLD },
  });
  return Number(count || 0);
}

async function loadLowPowerDeck(wallet) {
  const assets = await NftAssetDb.find(
    { ownerWallet: wallet, power: { $lt: LOW_POWER_THRESHOLD } },
    { cid: 1, name: 1, image: 1, power: 1 }
  )
    .limit(200)
    .lean();

  const cardIds = assets.map((a) => ({
    cid: String(a.cid ?? a._id),
    name: a.name || null,
    image: a.image || null,
  }));

  const cardPowersMap = {};
  for (const a of assets) {
    const cid = String(a.cid ?? a._id);
    cardPowersMap[cid] = Number(a.power || 0);
  }

  return { cardIds, cardPowersMap };
}

async function getOrCreateEarnDaily(wallet) {
  const day = todayKey();
  return EarnDaily.findOneAndUpdate(
    { wallet, day },
    {
      $setOnInsert: {
        wallet,
        day,
        total: 0,
        matchesPlayed: 0,
        lockedUntil: null,
      },
    },
    { new: true, upsert: true }
  );
}

function computeRemainingToday(cap, earned) {
  return Math.max(0, Number(cap || 0) - Number(earned || 0));
}

async function checkDailyLock(wallet) {
  const rec = await getOrCreateEarnDaily(wallet);
  const lockedUntil = rec.lockedUntil ? new Date(rec.lockedUntil) : null;

  if (lockedUntil && lockedUntil > new Date()) {
    return {
      ok: false,
      code: "MATCH_LIMIT",
      message: "Daily match limit reached. Please wait for cooldown.",
      lockedUntil,
      rec,
    };
  }

  if (Number(rec.matchesPlayed || 0) >= MATCHES_PER_DAY) {
    // set lock if not set
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await EarnDaily.updateOne({ wallet, day: rec.day }, { $set: { lockedUntil: until } });
    return {
      ok: false,
      code: "MATCH_LIMIT",
      message: "Daily match limit reached. Cooldown started (24 hours).",
      lockedUntil: until,
      rec: { ...rec.toObject?.() || rec, lockedUntil: until },
    };
  }

  return { ok: true, rec };
}

/**
 * Win payout is FIXED = 1000, but capped by DAILY_CAP.
 * Idempotency is per sessionId.
 */
async function computeAndPayDailyCappedWinReward(wallet, sessionId) {
  const day = todayKey();

  const rec = await getOrCreateEarnDaily(wallet);
  const earned = Number(rec.total || 0);
  const remaining = computeRemainingToday(DAILY_CAP, earned);

  if (remaining <= 0) {
    return {
      amount: 0,
      txid: null,
      reason: "Daily cap reached.",
      dailyCap: DAILY_CAP,
      earnedToday: earned,
      remainingToday: 0,
      winPayout: WIN_PAYOUT,
    };
  }

  // idempotency per match/session
  const existing = await NpcPayout.findOne({ wallet, sessionId });
  if (existing) {
    return {
      amount: existing.amount,
      txid: existing.txid,
      alreadyPaid: true,
      dailyCap: DAILY_CAP,
      earnedToday: earned,
      remainingToday: remaining,
      winPayout: WIN_PAYOUT,
    };
  }

  const amount = Math.min(WIN_PAYOUT, remaining);

  let txid = null;
  try {
    txid = await transferReward(wallet, amount);
  } catch (e) {
    // If payout transfer fails, still store record with txid:null to prevent looping payments
    // You may choose to allow retry logic, but this prevents spam.
    txid = null;
  }

  await NpcPayout.create({ wallet, sessionId, amount, txid });
  const after = await EarnDaily.findOneAndUpdate(
    { wallet, day },
    { $inc: { total: amount } },
    { new: true }
  );

  const earnedAfter = Number(after?.total || earned + amount);

  return {
    amount,
    txid,
    dailyCap: DAILY_CAP,
    earnedToday: earnedAfter,
    remainingToday: computeRemainingToday(DAILY_CAP, earnedAfter),
    winPayout: WIN_PAYOUT,
  };
}

// ===== SESSION STATE =====
// wallet -> session
const sessions = new Map();

/**
 * Match-point draw:
 * - For roundsToWin=2 (BO3), match point is 1-1
 * - generalized: (roundsToWin-1) vs (roundsToWin-1)
 */
function isMatchPointDraw(s, winner) {
  if (winner !== "draw") return false;
  const target = Math.max(0, Number(s.roundsToWin || ROUNDS_TO_WIN) - 1);
  return s.selfScore === target && s.opponentScore === target;
}

/**
 * BONUS redeal rule (your request):
 * - resets roundsPlayed to 0
 * - keeps score
 * - refreshes both piles with 3 cards each
 * Emits earnNpc:bonusHand for your UI.
 */
async function dealBonusHand(socket, s, buildDeckFromDb) {
  const wallet = s.wallet;

  const { cardIds, cardPowersMap } = await buildDeckFromDb(wallet);
  if (!cardIds || cardIds.length < 3) {
    socket.emit("earnNpc:insufficientDeck", { you: cardIds?.length || 0, need: 3 });
    return;
  }

  const playerHandBase = shuffle(cardIds).slice(0, 3);
  const playerHand = playerHandBase.map((c, i) => {
    const cid = String(c.cid);
    return {
      uid: `pbonus-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      cid,
      image: c.image || null,
      name: c.name || null,
      power: Number(cardPowersMap?.[cid] ?? 0),
    };
  });

  const npcHand = pickNpcHand(3);

  // ✅ Reset roundsPlayed to 0 (but KEEP score)
  s.roundsPlayed = 0;

  // Replace piles, clear fields
  s.selfCards = playerHand;
  s.opponentCards = npcHand;
  s.selfFieldCard = null;
  s.opponentFieldCard = null;

  socket.emit("earnNpc:bonusHand", {
    selfCards: playerHand,
    npcCards: new Array(npcHand.length).fill("back"),
    npcProfile: { name: "NEON NPC", rank: "P2E BOT" },
  });

  // Safe score sync
  socket.emit("earnNpc:scoreUpdate", {
    selfScore: s.selfScore,
    opponentScore: s.opponentScore,
  });
}

function attachEarnNpcSocket(io, socket, { buildDeckFromDb }) {
  // Optional bind
  socket.on("hello", ({ wallet }) => {
    try {
      if (wallet) socket.data.wallet = assertWallet(wallet);
    } catch {}
  });

  // START
  socket.on("earnNpc:start", async ({ wallet }) => {
    try {
      wallet = assertWallet(wallet);
      socket.data.wallet = wallet;

      // ✅ PASS CHECK
      const pass = await getPassStatus(wallet);
      if (!pass.hasActive) {
        socket.emit("earnNpc:eligibilityFailed", {
          code: "PASS_REQUIRED",
          message: "Active Dimension Pass required.",
          expiresAt: pass.expiresAt,
        });
        return;
      }

      // ✅ LOW POWER CHECK
      const lowCount = await getLowPowerCount(wallet);
      if (lowCount < LOW_POWER_MIN_COUNT) {
        socket.emit("earnNpc:eligibilityFailed", {
          code: "LOW_POWER_RULE",
          message: `Need at least ${LOW_POWER_MIN_COUNT} NFTs with power below ${LOW_POWER_THRESHOLD}.`,
          lowCount,
        });
        return;
      }

      // ✅ DAILY LOCK / MATCH LIMIT CHECK
      const lock = await checkDailyLock(wallet);
      if (!lock.ok) {
        socket.emit("earnNpc:eligibilityFailed", {
          code: lock.code,
          message: lock.message,
          lockedUntil: lock.lockedUntil || null,
        });
        return;
      }

      // ✅ Build deck from DB
      const { cardIds, cardPowersMap } = await buildDeckFromDb(wallet);
      if (!cardIds || cardIds.length < 3) {
        return socket.emit("earnNpc:insufficientDeck", {
          you: cardIds?.length || 0,
          need: 3,
        });
      }

      const playerHandBase = shuffle(cardIds).slice(0, 3);
      const playerHand = playerHandBase.map((c, i) => {
        const cid = String(c.cid);
        return {
          uid: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          cid,
          image: c.image || null,
          name: c.name || null,
          power: Number(cardPowersMap?.[cid] ?? 0),
        };
      });

      const npcHand = pickNpcHand(3);

      const sessionId = makeSessionId();

      // Ensure EarnDaily exists and send counts to UI
      const rec = await getOrCreateEarnDaily(wallet);
      const earnedToday = Number(rec.total || 0);
      const matchesPlayedToday = Number(rec.matchesPlayed || 0);

      sessions.set(wallet, {
        sessionId,
        wallet,
        roundsToWin: ROUNDS_TO_WIN,
        selfScore: 0,
        opponentScore: 0,
        selfCards: playerHand,
        opponentCards: npcHand,
        selfFieldCard: null,
        opponentFieldCard: null,
        roundsPlayed: 0,
        // bonus control
        bonusAvailable: false,
        bonusUsed: false,
        passExpiresAt: pass.expiresAt || null,
      });

      socket.emit("earnNpc:startDuel", {
        selfCards: playerHand,
        npcCards: new Array(npcHand.length).fill("back"),
        npcProfile: { name: "NEON NPC", rank: "P2E BOT" },
        rules: {
          roundsToWin: ROUNDS_TO_WIN,

          // P2E UI fields used by your EarnNpc.jsx
          dailyCap: DAILY_CAP,
          earnedToday,
          remainingToday: computeRemainingToday(DAILY_CAP, earnedToday),

          winPayout: WIN_PAYOUT,
          matchesPerDay: MATCHES_PER_DAY,
          matchesPlayedToday,
          remainingMatchesToday: Math.max(0, MATCHES_PER_DAY - matchesPlayedToday),

          passExpiresAt: pass.expiresAt || null,
          poolBalance: 0,
          requirements: {
            lowPowerThreshold: LOW_POWER_THRESHOLD,
            lowPowerMinCount: LOW_POWER_MIN_COUNT,
          },
        },
        bonusRound: false,
      });

      socket.emit("earnNpc:scoreUpdate", { selfScore: 0, opponentScore: 0 });
    } catch (e) {
      socket.emit("earnNpc:error", { message: e.message || "Start failed" });
    }
  });

  // PLAY
  socket.on("earnNpc:playCard", ({ uid }) => {
    try {
      const wallet = socket.data.wallet;
      if (!wallet) throw new Error("No wallet bound. Call earnNpc:start again.");

      const s = sessions.get(wallet);
      if (!s) throw new Error("No active Earn duel session.");

      if (s.selfFieldCard) return;

      const idx = s.selfCards.findIndex((c) => c.uid === uid);
      if (idx === -1) return socket.emit("earnNpc:error", { message: "Card not in hand." });

      // consume your selected card
      s.selfFieldCard = s.selfCards.splice(idx, 1)[0];
      socket.emit("earnNpc:ackPlayed", { uid: s.selfFieldCard.uid });

      // NPC consumes one card
      if (!s.opponentCards.length) throw new Error("NPC has no cards left.");
      const npcPickIdx = Math.floor(Math.random() * s.opponentCards.length);
      const npc = s.opponentCards.splice(npcPickIdx, 1)[0];
      s.opponentFieldCard = npc;

      // UI: show back on field, reveal only for modal
      socket.emit("earnNpc:opponentPlayedCard");
      setTimeout(() => socket.emit("earnNpc:revealOpponentCard", npc), 650);
    } catch (e) {
      socket.emit("earnNpc:error", { message: e.message || "Play failed" });
    }
  });

  // END TURN
  socket.on("earnNpc:endTurn", async () => {
    try {
      const wallet = socket.data.wallet;
      if (!wallet) throw new Error("No wallet bound. Call earnNpc:start again.");

      const s = sessions.get(wallet);
      if (!s) throw new Error("No active Earn duel session.");

      if (!s.selfFieldCard || !s.opponentFieldCard) {
        return socket.emit("earnNpc:error", { message: "Play a card first." });
      }

      const winner = computeWinner(s.selfFieldCard, s.opponentFieldCard);

      // score changes only if not draw
      if (winner === "self") s.selfScore++;
      if (winner === "opponent") s.opponentScore++;

      // count a resolved round attempt
      s.roundsPlayed++;

      socket.emit("earnNpc:roundResolved", {
        yourCard: s.selfFieldCard,
        oppCard: s.opponentFieldCard,
        winner,
      });

      // do not emit scoreUpdate on draw (UI expects no change)
      if (winner !== "draw") {
        socket.emit("earnNpc:scoreUpdate", {
          selfScore: s.selfScore,
          opponentScore: s.opponentScore,
        });
      }

      // clear fields after resolution
      s.selfFieldCard = null;
      s.opponentFieldCard = null;

      // If match-point draw and bonus not used, make bonus available and wait for client request.
      if (isMatchPointDraw(s, winner) && !s.bonusUsed) {
        s.bonusAvailable = true;
        return;
      }

      // WIN CONDITIONS:
      // - First to roundsToWin
      // - OR max 3 roundsPlayed within the CURRENT "segment"
      //   (bonus resets roundsPlayed to 0, so it becomes a fresh segment)
      const selfWon = s.selfScore >= s.roundsToWin;
      const oppWon = s.opponentScore >= s.roundsToWin;
      const maxRoundsReached = s.roundsPlayed >= 3;

      if (!selfWon && !oppWon && !maxRoundsReached) return;

      // If 3 rounds reached without first-to-2, higher score wins; tie => draw no payout
      const finalSelfWon =
        selfWon || (!oppWon && maxRoundsReached && s.selfScore > s.opponentScore);

      // ✅ Match counts even if lose
      const day = todayKey();
      const recBefore = await getOrCreateEarnDaily(wallet);

      // If already locked (shouldn't happen mid-session, but safe)
      if (recBefore.lockedUntil && new Date(recBefore.lockedUntil) > new Date()) {
        socket.emit("earnNpc:duelResult", {
          winner: "NPC",
          loser: wallet,
          forfeit: false,
          payout: {
            amount: 0,
            txid: null,
            reason: "Cooldown active.",
            dailyCap: DAILY_CAP,
            earnedToday: Number(recBefore.total || 0),
            remainingToday: computeRemainingToday(DAILY_CAP, Number(recBefore.total || 0)),
            matchesPerDay: MATCHES_PER_DAY,
            matchesPlayedToday: Number(recBefore.matchesPlayed || 0),
            remainingMatchesToday: Math.max(0, MATCHES_PER_DAY - Number(recBefore.matchesPlayed || 0)),
            passExpiresAt: s.passExpiresAt,
            winPayout: WIN_PAYOUT,
            poolBalance: 0,
          },
        });
        sessions.delete(wallet);
        return;
      }

      // Increment matches played (win/lose both count)
      const recAfterMatch = await EarnDaily.findOneAndUpdate(
        { wallet, day },
        { $inc: { matchesPlayed: 1 } },
        { new: true, upsert: true }
      );

      let payout = { amount: 0, txid: null, reason: null };

      if (finalSelfWon) {
        // ✅ fixed 1000 payout, capped by daily cap
        payout = await computeAndPayDailyCappedWinReward(wallet, s.sessionId);
        if (payout.amount <= 0) {
          payout.reason = payout.reason || "No payout available (cap reached).";
        }
      } else {
        payout = {
          amount: 0,
          txid: null,
          reason:
            maxRoundsReached && s.selfScore === s.opponentScore
              ? "Match ended in a draw."
              : "You lost the match.",
          dailyCap: DAILY_CAP,
          earnedToday: Number(recAfterMatch.total || 0),
          remainingToday: computeRemainingToday(DAILY_CAP, Number(recAfterMatch.total || 0)),
          winPayout: WIN_PAYOUT,
        };
      }

      // After match, apply cooldown if matches reached limit
      let lockedUntil = recAfterMatch.lockedUntil ? new Date(recAfterMatch.lockedUntil) : null;
      if (Number(recAfterMatch.matchesPlayed || 0) >= MATCHES_PER_DAY) {
        lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await EarnDaily.updateOne({ wallet, day }, { $set: { lockedUntil } });
      }

      // refresh final EarnDaily state for UI
      const recFinal = await EarnDaily.findOne({ wallet, day }).lean();
      const earnedFinal = Number(recFinal?.total || 0);
      const playedFinal = Number(recFinal?.matchesPlayed || 0);

      socket.emit("earnNpc:duelResult", {
        winner: finalSelfWon ? wallet : "NPC",
        loser: finalSelfWon ? "NPC" : wallet,
        forfeit: false,
        payout: {
          ...payout,
          dailyCap: DAILY_CAP,
          earnedToday: earnedFinal,
          remainingToday: computeRemainingToday(DAILY_CAP, earnedFinal),

          matchesPerDay: MATCHES_PER_DAY,
          matchesPlayedToday: playedFinal,
          remainingMatchesToday: Math.max(0, MATCHES_PER_DAY - playedFinal),

          passExpiresAt: s.passExpiresAt,
          lockedUntil: lockedUntil || null,
          winPayout: WIN_PAYOUT,
          poolBalance: 0,
        },
      });

      sessions.delete(wallet);
    } catch (e) {
      socket.emit("earnNpc:error", { message: e.message || "End turn failed" });
    }
  });

  // BONUS REDRAW REQUEST (client calls after closing modal)
  socket.on("earnNpc:bonusRedraw", async ({ wallet }) => {
    try {
      wallet = assertWallet(wallet || socket.data.wallet);
      socket.data.wallet = wallet;

      const s = sessions.get(wallet);
      if (!s) throw new Error("No active Earn duel session.");

      if (!s.bonusAvailable) {
        return socket.emit("earnNpc:error", { message: "Bonus redeal not available." });
      }
      if (s.bonusUsed) {
        return socket.emit("earnNpc:error", { message: "Bonus redeal already used." });
      }

      s.bonusUsed = true;
      s.bonusAvailable = false;

      await dealBonusHand(socket, s, buildDeckFromDb);
    } catch (e) {
      socket.emit("earnNpc:error", { message: e.message || "Bonus redraw failed" });
    }
  });

  socket.on("disconnect", () => {
    const wallet = socket.data.wallet;
    if (wallet) sessions.delete(wallet);
  });
}

module.exports = { attachEarnNpcSocket };
