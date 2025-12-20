// server/routes/store.js
const express = require("express");
const crypto = require("crypto");
const { PublicKey } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const DimensionPass = require("../model/DimensionPass");
const P2EPoolLedger = require("../model/P2EPoolLedger");

module.exports = function makeStoreRouter({
  connection,
  treasuryKeypair,
  resolveTokenProgramIdForMint,
  verifyTreasuryTokenDepositWithEscrow,
}) {
  const router = express.Router();

  const MINT = process.env.SD_TOKEN_MINT;
  const DECIMALS = Number(process.env.SD_DECIMALS || 6);

  const PASS_PRICE_7 = Number(process.env.PASS_PRICE_7 || 5000);
  const PASS_PRICE_15 = Number(process.env.PASS_PRICE_15 || 9000);
  const PASS_PRICE_30 = Number(process.env.PASS_PRICE_30 || 15000);

  function pow10(decimals) {
    let x = 1n;
    for (let i = 0; i < Number(decimals || 0); i++) x *= 10n;
    return x;
  }

  function todayKeyUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  function priceForDays(days) {
    if (days === 7) return PASS_PRICE_7;
    if (days === 15) return PASS_PRICE_15;
    if (days === 30) return PASS_PRICE_30;
    return null;
  }

  // List pass offerings
  router.get("/passes", (req, res) => {
    return res.json({
      success: true,
      mint: MINT,
      decimals: DECIMALS,
      offerings: [
        { durationDays: 7, price: PASS_PRICE_7 },
        { durationDays: 15, price: PASS_PRICE_15 },
        { durationDays: 30, price: PASS_PRICE_30 },
      ],
      dayKey: todayKeyUtc(),
    });
  });

  // Create purchase intent (escrowId + treasury ATA)
  router.post("/pass/intent", async (req, res) => {
    try {
      const { wallet, durationDays } = req.body || {};
      if (!wallet) return res.status(400).json({ success: false, error: "wallet is required" });

      const days = Number(durationDays);
      const priceUi = priceForDays(days);
      if (!priceUi) return res.status(400).json({ success: false, error: "Invalid durationDays" });

      if (!MINT) return res.status(500).json({ success: false, error: "SD_TOKEN_MINT missing" });

      const mintPk = new PublicKey(MINT);
      const tokenProgramId = await resolveTokenProgramIdForMint(MINT);

      // treasury ATA for this mint (Tokenkeg or Token-2022 safe)
      const treasuryAta = await getAssociatedTokenAddress(
        mintPk,
        treasuryKeypair.publicKey,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const escrowId = `PASS-${wallet}-${days}-${crypto.randomUUID()}`;

      const amountRaw = BigInt(Math.floor(priceUi)) * pow10(DECIMALS);

      return res.json({
        success: true,
        intent: {
          escrowId,
          wallet,
          durationDays: days,
          mint: MINT,
          decimals: DECIMALS,
          tokenProgramId: tokenProgramId.toBase58(),
          treasuryOwner: treasuryKeypair.publicKey.toBase58(),
          treasuryAta: treasuryAta.toBase58(),
          amountUi: priceUi,
          amountRaw: amountRaw.toString(),
          memo: escrowId,
        },
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || "Server error" });
    }
  });

  // Confirm purchase after client submits txid
  router.post("/pass/confirm", async (req, res) => {
    try {
      const { wallet, durationDays, txid, escrowId, amountRaw } = req.body || {};
      if (!wallet || !durationDays || !txid || !escrowId || !amountRaw) {
        return res.status(400).json({ success: false, error: "wallet, durationDays, txid, escrowId, amountRaw required" });
      }

      const days = Number(durationDays);
      const expectedPriceUi = priceForDays(days);
      if (!expectedPriceUi) return res.status(400).json({ success: false, error: "Invalid durationDays" });

      // verify on-chain deposit to treasury ATA with memo escrowId
      const verified = await verifyTreasuryTokenDepositWithEscrow({
        txid,
        expectedAmountRaw: Number(amountRaw),
        fromWallet: wallet,
        escrowId,
        mint: MINT,
        decimals: DECIMALS,
      });

      if (!verified.ok) {
        return res.status(400).json({ success: false, error: verified.reason || "Verification failed" });
      }

      // Create/extend pass: if user already has an active pass, extend from its expiry, else from now
      const now = new Date();
      const currentActive = await DimensionPass.findOne({
        wallet,
        expiresAt: { $gt: now },
      }).sort({ expiresAt: -1 });

      const base = currentActive ? new Date(currentActive.expiresAt) : now;
      const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

      const pass = await DimensionPass.create({
        wallet,
        expiresAt,
        durationDays: days,
      });

      // Ledger: pass purchase adds to pool
      await P2EPoolLedger.create({
        kind: "PASS_PURCHASE",
        wallet,
        amount: expectedPriceUi,
        txid,
        escrowId,
        meta: { durationDays: days },
      });

      return res.json({
        success: true,
        pass: {
          id: pass._id,
          wallet: pass.wallet,
          durationDays: pass.durationDays,
          expiresAt: pass.expiresAt,
        },
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || "Server error" });
    }
  });

  // Check active pass (for UI gating)
  router.get("/pass/active/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const now = new Date();
      const pass = await DimensionPass.findOne({ wallet, expiresAt: { $gt: now } }).sort({ expiresAt: -1 }).lean();

      return res.json({
        success: true,
        active: !!pass,
        pass: pass
          ? {
              wallet: pass.wallet,
              durationDays: pass.durationDays,
              expiresAt: pass.expiresAt,
            }
          : null,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || "Server error" });
    }
  });

  return router;
};
