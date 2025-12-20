const express = require("express");
const router = express.Router();
const Match = require("../model/Match");

router.get("/", async (req, res) => {
  try {
    const matches = await Match.find().sort({ timestamp: -1 }).limit(20);
    res.json(matches);
  } catch (err) {
    console.error("Failed to fetch matches:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function onDuelCompleted(winner, loser, bet) {
  try {
    const totalPot = bet * 2; // ✅ both players
    await Match.create({ winner, loser, bet, totalPot, timestamp: new Date() });
  } catch (err) {
    console.error("❌ Match save failed:", err);
  }
}

module.exports = {
  router,
  onDuelCompleted,
};
