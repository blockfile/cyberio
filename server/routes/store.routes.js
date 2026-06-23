const express = require("express");
const crypto = require("crypto");
const bs58 = require("bs58");
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const DimensionPass = require("../model/DimensionPass");
const PassPurchaseIntent = require("../model/PassPurchaseIntent");
const {
  getParsedTransactionWithRetry,
  verifyPassPaymentTransaction,
} = require("../util/passPayment");

const router = express.Router();

/**
 * CONFIG
 */
const RPC = process.env.SOLANA_RPC;
const CYBERIO_MINT = process.env.SD_TOKEN_MINT;
const TREASURY_PUBLIC_KEY = process.env.FEE_WALLET;

if (!RPC) console.warn("⚠️ SOLANA_RPC missing");
if (!CYBERIO_MINT) console.warn("⚠️ CYBERIO_MINT missing");
if (!TREASURY_PUBLIC_KEY) console.warn("⚠️ TREASURY_PUBLIC_KEY missing");

const connection = new Connection(RPC, "confirmed");

function assertWallet(w) {
  try {
    return new PublicKey(w).toBase58();
  } catch {
    throw new Error("Invalid wallet");
  }
}

function nowUtc() {
  return new Date();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d;
}

function getPriceForDuration(durationDays) {
  const d = Number(durationDays);
  if (d === 7) return Number(process.env.PASS_PRICE_7 || 5);
  if (d === 15) return Number(process.env.PASS_PRICE_30 || 15);
  if (d === 30) return Number(process.env.PASS_PRICE_90 || 35);
  return null;
}

async function resolveOnChainTokenProgramIdForMint(mintPk) {
  const info = await connection.getAccountInfo(mintPk);
  if (!info) throw new Error("Mint account not found on-chain");

  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;

  throw new Error(`Unsupported mint owner program: ${info.owner.toBase58()}`);
}

function assertTxid(value) {
  const txid = String(value || "").trim();
  try {
    if (bs58.decode(txid).length !== 64) throw new Error("bad length");
    return txid;
  } catch {
    throw new Error("Invalid transaction signature.");
  }
}

async function resolvePurchaseTokenConfig(mintPk) {
  // The mint account owner is authoritative. An env default can silently select
  // Tokenkeg for a Token-2022 mint and produce transactions that can never run.
  const tokenProgramId = await resolveOnChainTokenProgramIdForMint(mintPk);
  const mintInfo = await getMint(connection, mintPk, "confirmed", tokenProgramId);
  return {
    tokenProgramId,
    decimals: Number(mintInfo.decimals),
    source: "chain",
  };
}

function pow10(decimals) {
  let x = 1n;
  for (let i = 0; i < Number(decimals || 0); i++) x *= 10n;
  return x;
}

/**
 * GET active pass
 * UI calls: GET /api/store/pass/active/:wallet
 */
router.get("/pass/active/:wallet", async (req, res) => {
  try {
    const wallet = assertWallet(req.params.wallet);
    const pass = await DimensionPass.findOne({ wallet }).lean();

    const active = !!(pass && pass.expiresAt && new Date(pass.expiresAt) > nowUtc());

    return res.json({
      success: true,
      active,
      pass: pass || null,
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Bad request" });
  }
});

/**
 * GET pass status (Dapp.jsx tries first)
 * GET /api/store/pass-status?wallet=
 */
router.get("/pass-status", async (req, res) => {
  try {
    const wallet = assertWallet(req.query.wallet);
    const pass = await DimensionPass.findOne({ wallet }).lean();
    const hasActive = !!(pass && pass.expiresAt && new Date(pass.expiresAt) > nowUtc());

    return res.json({
      hasActive,
      expiresAt: hasActive ? pass.expiresAt : null,
      pass: pass || null,
    });
  } catch (e) {
    return res.status(400).json({ hasActive: false, error: e.message || "Bad request" });
  }
});

/**
 * Recover purchases whose token transaction was submitted but not confirmed by
 * the app yet. Only non-sensitive intent fields are returned.
 */
router.get("/pass/pending/:wallet", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const wallet = assertWallet(req.params.wallet);
    const pending = await PassPurchaseIntent.find({
      wallet,
      status: "PENDING",
      expiresAt: { $gt: nowUtc() },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      pending: pending.map((intent) => ({
        escrowId: intent.escrowId,
        durationDays: intent.durationDays,
        priceUi: intent.priceUi,
        amountRaw: intent.amountRaw,
        memo: intent.memo,
        submittedTxid: intent.submittedTxid || "",
        createdAt: intent.createdAt,
        expiresAt: intent.expiresAt,
      })),
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Pending lookup failed" });
  }
});

/** Save the signature before RPC confirmation so refreshes are recoverable. */
router.post("/pass/submit", async (req, res) => {
  try {
    const wallet = assertWallet(req.body.wallet);
    const escrowId = String(req.body.escrowId || "").trim();
    const txid = assertTxid(req.body.txid);
    if (!escrowId) throw new Error("Missing escrowId.");

    const intent = await PassPurchaseIntent.findOne({ escrowId });
    if (!intent) throw new Error("Purchase intent not found (expired or invalid).");
    if (intent.wallet !== wallet) throw new Error("Wallet mismatch.");
    if (intent.status === "CONFIRMED") return res.json({ success: true, confirmed: true });
    if (intent.status !== "PENDING") throw new Error(`Intent is not pending (status=${intent.status}).`);
    if (new Date(intent.expiresAt) <= nowUtc()) throw new Error("Intent expired. Create a new intent.");
    if (intent.submittedTxid && intent.submittedTxid !== txid) {
      throw new Error("This purchase already has a different transaction signature.");
    }

    intent.submittedTxid = txid;
    // Once payment may have been sent, keep recovery available for 24 hours.
    intent.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await intent.save();

    return res.json({ success: true, pending: true });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Submit failed" });
  }
});

/**
 * POST create purchase intent
 * UI calls: POST /api/store/pass/intent { wallet, durationDays }
 * returns: intent { mint, treasuryAta, tokenProgramId, amountRaw, decimals, memo, escrowId }
 */
router.post("/pass/intent", async (req, res) => {
  try {
    if (!CYBERIO_MINT || !TREASURY_PUBLIC_KEY) {
      throw new Error("Store not configured (CYBERIO_MINT/TREASURY_PUBLIC_KEY missing).");
    }

    const wallet = assertWallet(req.body.wallet);
    const durationDays = Number(req.body.durationDays);

    const priceUi = getPriceForDuration(durationDays);
    if (!priceUi) throw new Error("Invalid pass durationDays.");

    const activePass = await DimensionPass.findOne({
      wallet,
      expiresAt: { $gt: nowUtc() },
    }).lean();
    if (activePass && Number(activePass.durationDays) === durationDays) {
      throw new Error(
        `Your ${durationDays}-day Dimension Pass is already active until ${new Date(
          activePass.expiresAt
        ).toISOString()}. Choose a different duration to extend it.`
      );
    }

    const mintPk = new PublicKey(CYBERIO_MINT);
    const treasuryPk = new PublicKey(TREASURY_PUBLIC_KEY);

    const { tokenProgramId, decimals, source: tokenConfigSource } =
      await resolvePurchaseTokenConfig(mintPk);

    // amountRaw = priceUi * 10^decimals
    const amountRaw = (BigInt(Math.floor(priceUi)) * pow10(decimals)).toString();

    // Treasury ATA (owner = treasury wallet)
    const treasuryAta = await getAssociatedTokenAddress(
      mintPk,
      treasuryPk,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const escrowId = crypto.randomUUID();
    const memo = `CYBERIO_PASS|${wallet}|${durationDays}|${amountRaw}|${escrowId}`;

    // Create intent with TTL (10 minutes)
    const intentExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PassPurchaseIntent.create({
      escrowId,
      wallet,
      durationDays,
      priceUi,
      amountRaw,
      mint: mintPk.toBase58(),
      treasuryAta: treasuryAta.toBase58(),
      tokenProgramId: tokenProgramId.toBase58(),
      memo,
      expiresAt: intentExpiresAt,
      status: "PENDING",
    });

    return res.json({
      success: true,
      intent: {
        escrowId,
        mint: mintPk.toBase58(),
        treasuryAta: treasuryAta.toBase58(),
        tokenProgramId: tokenProgramId.toBase58(),
        amountRaw,
        decimals,
        memo,
        durationDays,
        priceUi,
        tokenConfigSource,
      },
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Intent failed" });
  }
});

/**
 * POST confirm purchase
 * UI calls: POST /api/store/pass/confirm
 * { wallet, durationDays, txid, escrowId, amountRaw }
 *
 * Backend will:
 * - load intent
 * - verify on-chain tx exists and contains:
 *    (A) memo exactly intent.memo
 *    (B) token transfer of intent.amountRaw to intent.treasuryAta
 * - then upsert DimensionPass with expiresAt (extend if active)
 */
router.post("/pass/confirm", async (req, res) => {
  try {
    const wallet = assertWallet(req.body.wallet);
    const durationDays = Number(req.body.durationDays);
    const escrowId = String(req.body.escrowId || "").trim();
    const amountRawClient = String(req.body.amountRaw || "").trim();

    if (!escrowId) throw new Error("Missing escrowId.");

    const intent = await PassPurchaseIntent.findOne({ escrowId });
    if (!intent) throw new Error("Purchase intent not found (expired or invalid).");

    const txid = assertTxid(req.body.txid || intent.submittedTxid || intent.confirmedTxid);

    // Bind the request to its intent before returning an idempotent success.
    if (intent.wallet !== wallet) throw new Error("Wallet mismatch.");
    if (Number(intent.durationDays) !== durationDays) throw new Error("Duration mismatch.");
    if (String(intent.amountRaw) !== amountRawClient) throw new Error("Amount mismatch.");

    if (intent.status !== "PENDING") {
      // idempotent success
      if (intent.status === "CONFIRMED") {
        const pass = await DimensionPass.findOne({ wallet: intent.wallet }).lean();
        return res.json({ success: true, pass });
      }
      throw new Error(`Intent is not pending (status=${intent.status}).`);
    }

    if (new Date(intent.expiresAt) <= nowUtc()) throw new Error("Intent expired. Create a new intent.");
    if (intent.submittedTxid && intent.submittedTxid !== txid) {
      throw new Error("This purchase already has a different transaction signature.");
    }
    if (!intent.submittedTxid) {
      intent.submittedTxid = txid;
      intent.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await intent.save();
    }

    // ---- Verify TX on-chain ----
    const tx = await getParsedTransactionWithRetry(
      () =>
        connection.getParsedTransaction(txid, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
      { attempts: 8, delayMs: 1000 }
    );

    if (!tx) {
      return res.status(202).json({
        success: false,
        pending: true,
        error: "Payment was submitted and is still awaiting Solana confirmation. Retry confirmation; do not pay again.",
      });
    }

    try {
      verifyPassPaymentTransaction(tx, {
        wallet: intent.wallet,
        memo: intent.memo,
        treasuryAta: intent.treasuryAta,
        mint: intent.mint,
        tokenProgramId: intent.tokenProgramId,
        amountRaw: intent.amountRaw,
      });
    } catch (verificationError) {
      await PassPurchaseIntent.updateOne(
        { escrowId, status: "PENDING" },
        { $set: { status: "FAILED" } }
      );
      verificationError.code = "PAYMENT_INVALID";
      throw verificationError;
    }

    // ---- Grant / extend pass ----
    const now = nowUtc();
    const existing = await DimensionPass.findOne({ wallet });

    // A repeated confirmation for the same escrow must never extend twice.
    if (existing?.lastEscrowId === escrowId) {
      await PassPurchaseIntent.updateOne(
        { escrowId },
        { $set: { status: "CONFIRMED", confirmedTxid: txid } }
      );
      return res.json({ success: true, pass: existing });
    }

    const base = existing?.expiresAt && new Date(existing.expiresAt) > now ? new Date(existing.expiresAt) : now;
    const newExpiresAt = addDays(base, durationDays);

    const pass = await DimensionPass.findOneAndUpdate(
      { wallet },
      {
        $set: {
          wallet,
          durationDays,
          expiresAt: newExpiresAt,
          lastPurchaseTxid: txid,
          lastEscrowId: escrowId,
        },
      },
      { upsert: true, new: true }
    );

    await PassPurchaseIntent.updateOne(
      { escrowId },
      { $set: { status: "CONFIRMED", confirmedTxid: txid } }
    );

    return res.json({ success: true, pass });
  } catch (e) {
    return res.status(400).json({
      success: false,
      code: e.code || "CONFIRM_FAILED",
      error: e.message || "Confirm failed",
    });
  }
});

module.exports = router;
