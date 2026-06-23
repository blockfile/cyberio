const express = require("express");
const { PublicKey } = require("@solana/web3.js");

const DimensionPass = require("../model/DimensionPass");
const User = require("../model/User"); // non-NFT: player cards live here
const EarnDaily = require("../model/EarnDaily");

const router = express.Router();

function todayKeyUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC) — matches the earn socket
}

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

    // 2) Card rule (read only) — count low-power cards (by quantity) from the player's DB cards
    const user = await User.findOne({ walletAddress: wallet }).lean();
    const cards = (user && user.cards) || [];
    const lowPowerCount = cards.reduce(
      (n, c) => n + ((Number(c.power) || 0) < POWER_THRESHOLD ? Math.max(1, Number(c.count) || 1) : 0),
      0
    );

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

/**
 * GET /api/earn/daily?wallet=
 * Read-only daily earn status for the HUD (earned today vs the daily cap).
 */
router.get("/daily", async (req, res) => {
  try {
    const wallet = assertWalletBase58(req.query.wallet);
    const cap = Number(process.env.EARN_DAILY_CAP || 30000);
    const rec = await EarnDaily.findOne({ wallet, day: todayKeyUtc() }).lean();
    const earned = Math.max(0, Number(rec?.total || 0));
    return res.json({
      success: true,
      earnedToday: earned,
      dailyCap: cap,
      remaining: Math.max(0, cap - earned),
      matchesPlayed: Number(rec?.matchesPlayed || 0),
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e?.message || "Daily status failed" });
  }
});

module.exports = router;
