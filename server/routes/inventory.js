// server/routes/inventory.js
// Non-NFT inventory: returns the player's cards straight from the database (User.cards).
const express = require("express");
const router = express.Router();
const User = require("../model/User");

// rarity from the card's (badge-derived) power — matches the 3 tiers the client styles
function rarityFromPower(power) {
  const p = Number(power) || 0;
  if (p >= 10) return "Legendary";
  if (p >= 8) return "Rare";
  return "Common";
}

// GET /api/inventory/:walletAddress  → { cards: [...] }
router.get("/:walletAddress", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const user = await User.findOne({ walletAddress: req.params.walletAddress }).lean();
    const cards = (user?.cards || []).map((c) => ({
      cardId: c.cardId,
      name: c.name,
      power: c.power,
      count: c.count,
      isFree: !!c.isFree,
      rarity: rarityFromPower(c.power),
      image: null,   // client maps cardId → local card art
      skill: null,
    }));
    res.json({ cards });
  } catch (err) {
    console.error("[inventory] error:", err?.message || err);
    res.status(500).json({ message: "Server error", cards: [] });
  }
});

module.exports = router;
