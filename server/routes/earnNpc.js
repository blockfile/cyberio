// server/routes/earnNpc.js
require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} = require("@solana/spl-token");
const bs58 = require("bs58");

// OPTIONAL payout safety model (recommended)
let NpcPayout = null;
try {
  NpcPayout = require("../model/NpcPayout");
} catch (e) {
  // If you didn't create the model yet, route still works, just not DB-idempotent.
  NpcPayout = null;
}

const router = express.Router();

/** =========================
 *  CONFIG (ENV)
 *  ========================= */
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const TOKEN_MINT = process.env.NPC_TOKEN_MINT; // SPL token mint address
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY; // bs58 secret key
const NPC_WIN_REWARD = Number(process.env.NPC_WIN_REWARD || "10"); // token units
const NPC_DECIMALS = Number(process.env.NPC_TOKEN_DECIMALS || "6"); // must match mint decimals

const connection = new Connection(SOLANA_RPC, "confirmed");

function mustEnv(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
}

function toBaseUnits(amountHuman, decimals) {
  // safe integer conversion (avoid floats)
  // example: 10 with decimals 6 => 10_000_000
  const s = String(amountHuman);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const baseStr = whole + fracPadded;
  // remove leading zeros
  const normalized = baseStr.replace(/^0+/, "") || "0";
  return BigInt(normalized);
}

function assertWallet(wallet) {
  try {
    const pk = new PublicKey(wallet);
    return pk.toBase58();
  } catch {
    throw new Error("Invalid wallet address");
  }
}

function makeSessionId() {
  return crypto.randomUUID?.() || `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

/** =========================
 *  SIMPLE RATE LIMIT (no package)
 *  10 requests per minute per IP
 *  ========================= */
const RL_MAX = 10;
const RL_WINDOW_MS = 60_000;
const rlStore = new Map(); // ip -> { count, resetAt }

function rateLimit(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();
  const entry = rlStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rlStore.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return next();
  }

  if (entry.count >= RL_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down.",
      error_code: "RATE_LIMITED",
      retryAfterSeconds: retryAfter,
    });
  }

  entry.count += 1;
  rlStore.set(ip, entry);
  return next();
}

/** =========================
 *  OPTIONAL: DB idempotency helpers
 *  ========================= */
async function getExistingPayout(wallet, sessionId) {
  if (!NpcPayout) return null;
  return NpcPayout.findOne({ wallet, sessionId }).lean();
}

async function claimPayout(wallet, sessionId, amount) {
  if (!NpcPayout) return { claimed: true, already: null };

  try {
    await NpcPayout.create({
      wallet,
      sessionId,
      txid: null,
      amount,
      createdAt: new Date(),
    });
    return { claimed: true, already: null };
  } catch (e) {
    // duplicate key means already claimed/paid
    if (String(e?.code) === "11000") {
      const existing = await getExistingPayout(wallet, sessionId);
      return { claimed: false, already: existing };
    }
    throw e;
  }
}

async function savePayoutTx(wallet, sessionId, txid, amount) {
  if (!NpcPayout) return;
  await NpcPayout.updateOne(
    { wallet, sessionId },
    { $set: { txid: txid || null, amount, createdAt: new Date() } }
  );
}

/** =========================
 *  TREASURY + TOKEN TRANSFER
 *  ========================= */
function loadTreasuryKeypair() {
  mustEnv("TREASURY_PRIVATE_KEY", TREASURY_PRIVATE_KEY);
  const secret = bs58.decode(TREASURY_PRIVATE_KEY);
  return Keypair.fromSecretKey(secret);
}

async function transferRewardTokens({ toWallet, amountHuman }) {
  mustEnv("NPC_TOKEN_MINT", TOKEN_MINT);

  const treasury = loadTreasuryKeypair();
  const mintPk = new PublicKey(TOKEN_MINT);
  const toPk = new PublicKey(toWallet);

  const amountBase = toBaseUnits(amountHuman, NPC_DECIMALS); // BigInt
  if (amountBase <= 0n) {
    return { skipped: true, txid: null, amountHuman, amountBase: "0" };
  }

  const fromAta = await getAssociatedTokenAddress(mintPk, treasury.publicKey);
  const toAta = await getAssociatedTokenAddress(mintPk, toPk);

  const ix = [];

  // create recipient ATA if missing
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    ix.push(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey, // payer
        toAta,
        toPk,
        mintPk
      )
    );
  }

  // transfer
  ix.push(
    createTransferInstruction(
      fromAta,
      toAta,
      treasury.publicKey,
      Number(amountBase) // NOTE: safe if within JS Number range
    )
  );

  const tx = new Transaction().add(...ix);
  tx.feePayer = treasury.publicKey;

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  tx.sign(treasury);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(sig, "confirmed");

  return {
    skipped: false,
    txid: sig,
    amountHuman,
    amountBase: amountBase.toString(),
  };
}

/**
 * IMPORTANT:
 * createTransferInstruction amount expects a number, but SPL tokens can exceed JS safe range.
 * For your use-case (small rewards like 10 tokens), this is fine.
 * If later you want big payouts, we’ll switch to a BigInt-safe transfer builder.
 */

/** =========================
 *  NPC LOGIC (simple)
 *  ========================= */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Example: NPC power depends on difficulty
function npcPickPower(difficulty) {
  if (difficulty === "hard") return randInt(55, 95);
  if (difficulty === "normal") return randInt(35, 75);
  return randInt(20, 60); // easy
}

// Example: player power comes from chosen cardPower (from client) + small roll
function playerComputePower(cardPower) {
  const base = Number(cardPower || 0);
  const roll = randInt(0, 12);
  return Math.max(0, base + roll);
}

/** =========================
 *  ROUTES
 *  ========================= */

/**
 * POST /api/earnNpc/start
 * body: { wallet, difficulty?: "easy"|"normal"|"hard" }
 */
router.post("/start", rateLimit, async (req, res) => {
  try {
    const wallet = assertWallet(req.body.wallet);
    const difficulty = req.body.difficulty || "normal";

    const sessionId = makeSessionId();

    // you can also store server-side session state if you want,
    // but for minimal flow we return a sessionId and verify payout with DB idempotency.
    return res.json({
      success: true,
      sessionId,
      difficulty,
      reward: {
        tokenMint: TOKEN_MINT || null,
        amount: NPC_WIN_REWARD,
        decimals: NPC_DECIMALS,
      },
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: e.message || "Invalid request",
    });
  }
});

/**
 * POST /api/earnNpc/play
 * body: {
 *   wallet,
 *   sessionId,
 *   difficulty?: "easy"|"normal"|"hard",
 *   card: { uid, cid, power }  // power is required for outcome calculation
 * }
 */
router.post("/play", rateLimit, async (req, res) => {
  try {
    const wallet = assertWallet(req.body.wallet);
    const sessionId = String(req.body.sessionId || "").trim();
    const difficulty = req.body.difficulty || "normal";
    const card = req.body.card || {};

    if (!sessionId) throw new Error("Missing sessionId");
    if (card.power == null) throw new Error("Missing card.power");

    // compute fight
    const playerPower = playerComputePower(card.power);
    const npcPower = npcPickPower(difficulty);

    let outcome = "draw";
    if (playerPower > npcPower) outcome = "win";
    else if (npcPower > playerPower) outcome = "lose";

    let payout = null;

    // payout only when player wins
    if (outcome === "win") {
      // DB-backed idempotency if model exists
      const existing = await getExistingPayout(wallet, sessionId);
      if (existing) {
        payout = {
          tokenMint: TOKEN_MINT,
          amount: existing.amount,
          txid: existing.txid,
          alreadyPaid: true,
          createdAt: existing.createdAt,
        };
      } else {
        // claim first (prevents concurrent double-pay)
        const claim = await claimPayout(wallet, sessionId, NPC_WIN_REWARD);

        if (!claim.claimed && claim.already) {
          payout = {
            tokenMint: TOKEN_MINT,
            amount: claim.already.amount,
            txid: claim.already.txid,
            alreadyPaid: true,
            createdAt: claim.already.createdAt,
          };
        } else {
          // send SPL reward
          try {
            const pay = await transferRewardTokens({
              toWallet: wallet,
              amountHuman: NPC_WIN_REWARD,
            });

            await savePayoutTx(wallet, sessionId, pay.txid, NPC_WIN_REWARD);

            payout = {
              tokenMint: TOKEN_MINT,
              amount: NPC_WIN_REWARD,
              amountBaseUnits: pay.amountBase,
              txid: pay.txid,
              skipped: !!pay.skipped,
              alreadyPaid: false,
            };
          } catch (payErr) {
            // record exists with txid:null; avoids repeated auto-payout
            console.error("NPC payout failed:", payErr?.message || payErr);
            payout = {
              tokenMint: TOKEN_MINT,
              amount: NPC_WIN_REWARD,
              txid: null,
              error:
                "Payout failed on server. Check treasury token balance/config.",
              alreadyPaid: false,
            };
          }
        }
      }
    }

    return res.json({
      success: true,
      sessionId,
      wallet,
      difficulty,
      fight: {
        player: { power: playerPower, card: { uid: card.uid, cid: card.cid } },
        npc: { power: npcPower },
      },
      outcome, // "win" | "lose" | "draw"
      payout,  // null or payout object
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: e.message || "Invalid request",
    });
  }
});

/**
 * Optional: GET /api/earnNpc/payouts/:wallet
 * (only works if NpcPayout model exists)
 */
router.get("/payouts/:wallet", rateLimit, async (req, res) => {
  try {
    const wallet = assertWallet(req.params.wallet);

    if (!NpcPayout) {
      return res.json({
        success: true,
        payouts: [],
        note: "NpcPayout model not installed; payouts not persisted.",
      });
    }

    const list = await NpcPayout.find({ wallet })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ success: true, payouts: list });
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: e.message || "Invalid request",
    });
  }
});

module.exports = router;
