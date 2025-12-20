const express = require("express");
const { PublicKey } = require("@solana/web3.js");

const DimensionPass = require("../model/DimensionPass");
const NftAssetDb = require("../model/NftAssetDb");

const router = express.Router();

function assertWalletBase58(w) {
  const s = String(w ?? "").trim();
  if (!s) throw new Error("Missing wallet");
  try {
    return new PublicKey(s).toBase58();
  } catch {
    throw new Error("Invalid wallet");
  }
}

function nowUtc() {
  return new Date();
}

/**
 * GET /api/earn/eligibility?wallet=
 *
 * Eligibility rules:
 * 1) Must have ACTIVE DimensionPass (expiresAt > now)
 * 2) Must have at least REQUIRED_LOW_POWER NFTs with power < POWER_THRESHOLD
 *
 * IMPORTANT: This route DOES NOT SAVE ANY DATA.
 * It only reads MongoDB (DimensionPass + nftassets).
 */
router.get("/eligibility", async (req, res) => {
  try {
    const wallet = assertWalletBase58(req.query.wallet);

    const REQUIRED_LOW_POWER = Number(process.env.EARN_REQUIRED_LOW_POWER || 2);
    const POWER_THRESHOLD = Number(process.env.EARN_POWER_THRESHOLD || 5);

    // 1) Pass check (read only)
    const pass = await DimensionPass.findOne({ wallet }).lean();
    const hasActivePass = !!(pass?.expiresAt && new Date(pass.expiresAt) > nowUtc());

    // If no pass => eligible false, but still return counts
    // 2) NFT rule (read only) — use YOUR SYNCED collection
    const lowPowerCount = await NftAssetDb.countDocuments({
      ownerWallet: wallet,
      power: { $lt: POWER_THRESHOLD },
      // optional: if you want only a specific collection:
      // collectionId: process.env.SD_COLLECTION_ID
    });

    const eligible = hasActivePass && lowPowerCount >= REQUIRED_LOW_POWER;

    return res.json({
      success: true,
      eligible,
      hasActivePass,
      passExpiresAt: hasActivePass ? pass.expiresAt : null,
      lowPowerCount,
      requiredLowPower: REQUIRED_LOW_POWER,
      powerThreshold: POWER_THRESHOLD,
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      eligible: false,
      error: e?.message || "Eligibility check failed",
    });
  }
});

module.exports = router;
