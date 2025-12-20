// server/routes/inventory.js
const express = require("express");
const router = express.Router();
const User = require("../model/User");

// GET /api/inventory/:walletAddress
router.get("/:walletAddress", async (req, res) => {
  try {
    const user = await User.findOne({
      walletAddress: req.params.walletAddress,
    });
    if (!user) return res.status(404).json({ cards: [] });
    res.json({ cards: user.cards });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
