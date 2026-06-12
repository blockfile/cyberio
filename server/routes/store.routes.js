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

const router = express.Router();

/**
 * CONFIG
 */
const RPC = process.env.SOLANA_RPC;
const CYBERIO_MINT = process.env.SD_TOKEN_MINT;
const TREASURY_PUBLIC_KEY = process.env.FEE_WALLET;
const TOKEN_PROGRAM = (process.env.TOKEN_PROGRAM || "tokenkeg").toLowerCase();
const CONFIGURED_DECIMALS = Number(
  process.env.SD_DECIMALS ||
    process.env.REACT_APP_TOKEN_DECIMALS ||
    process.env.WAGER_DECIMALS ||
    6
);

if (!RPC) console.warn("⚠️ SOLANA_RPC missing");
if (!CYBERIO_MINT) console.warn("⚠️ CYBERIO_MINT missing");
if (!TREASURY_PUBLIC_KEY) console.warn("⚠️ TREASURY_PUBLIC_KEY missing");

const connection = new Connection(RPC, "confirmed");

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

function resolveConfiguredTokenProgramId() {
  if (
    TOKEN_PROGRAM === "token2022" ||
    TOKEN_PROGRAM === "token-2022" ||
    TOKEN_PROGRAM === TOKEN_2022_PROGRAM_ID.toBase58().toLowerCase()
  ) {
    return TOKEN_2022_PROGRAM_ID;
  }

  return TOKEN_PROGRAM_ID;
}

async function resolveOnChainTokenProgramIdForMint(mintPk) {
  const info = await connection.getAccountInfo(mintPk);
  if (!info) throw new Error("Mint account not found on-chain");

  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;

  throw new Error(`Unsupported mint owner program: ${info.owner.toBase58()}`);
}

async function resolvePurchaseTokenConfig(mintPk) {
  const configuredTokenProgramId = resolveConfiguredTokenProgramId();

  if (Number.isFinite(CONFIGURED_DECIMALS) && CONFIGURED_DECIMALS >= 0) {
    return {
      tokenProgramId: configuredTokenProgramId,
      decimals: CONFIGURED_DECIMALS,
      source: "env",
    };
  }

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
    const txid = String(req.body.txid || "").trim();
    const escrowId = String(req.body.escrowId || "").trim();
    const amountRawClient = String(req.body.amountRaw || "").trim();

    if (!txid) throw new Error("Missing txid.");
    if (!escrowId) throw new Error("Missing escrowId.");

    const intent = await PassPurchaseIntent.findOne({ escrowId }).lean();
    if (!intent) throw new Error("Purchase intent not found (expired or invalid).");

    if (intent.status !== "PENDING") {
      // idempotent success
      if (intent.status === "CONFIRMED") {
        const pass = await DimensionPass.findOne({ wallet }).lean();
        return res.json({ success: true, pass });
      }
      throw new Error(`Intent is not pending (status=${intent.status}).`);
    }

    if (intent.wallet !== wallet) throw new Error("Wallet mismatch.");
    if (Number(intent.durationDays) !== durationDays) throw new Error("Duration mismatch.");
    if (String(intent.amountRaw) !== amountRawClient) throw new Error("Amount mismatch.");
    if (new Date(intent.expiresAt) <= nowUtc()) throw new Error("Intent expired. Create a new intent.");

    // ---- Verify TX on-chain ----
    const tx = await connection.getParsedTransaction(txid, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) throw new Error("Transaction not found/confirmed yet.");

    // (A) verify memo instruction
    const hasMemo = (tx.transaction.message.instructions || []).some((ix) => {
      try {
        // parsed memo is often in ix.parsed
        if (ix.programId?.toBase58?.() === MEMO_PROGRAM_ID.toBase58()) {
          // parsed "memo" sometimes: ix.parsed === intent.memo
          const parsed = ix.parsed;
          if (typeof parsed === "string") return parsed === intent.memo;
          if (parsed?.type === "memo" && parsed?.info?.memo) return parsed.info.memo === intent.memo;
        }
      } catch {}
      return false;
    });

    if (!hasMemo) {
      throw new Error("Memo check failed. Tx does not include the correct purchase memo.");
    }

    // (B) verify token transfer to treasuryAta with exact amountRaw
    const expectedTreasuryAta = intent.treasuryAta;
    const expectedMint = intent.mint;
    const expectedAmountRaw = BigInt(intent.amountRaw);

    let transferOk = false;

    // parsed token instructions approach
    for (const ix of tx.transaction.message.instructions || []) {
      // parsed SPL transferChecked often appears here:
      // ix.program === 'spl-token' or 'spl-token-2022'
      if (!ix.parsed) continue;

      const p = ix.parsed;
      if (p.type !== "transferChecked" && p.type !== "transfer") continue;

      const info = p.info || {};
      const dest = info.destination;
      const mint = info.mint;

      // amount might be in "tokenAmount" or "amount"
      let raw = null;
      if (info.tokenAmount?.amount != null) raw = BigInt(info.tokenAmount.amount);
      else if (info.amount != null) raw = BigInt(info.amount);

      if (!dest || !mint || raw == null) continue;

      if (dest === expectedTreasuryAta && mint === expectedMint && raw === expectedAmountRaw) {
        transferOk = true;
        break;
      }
    }

    if (!transferOk) {
      throw new Error("Transfer check failed. Expected payment to treasury ATA not found in tx.");
    }

    // ---- Grant / extend pass ----
    const now = nowUtc();
    const existing = await DimensionPass.findOne({ wallet });

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
    return res.status(400).json({ success: false, error: e.message || "Confirm failed" });
  }
});

module.exports = router;
