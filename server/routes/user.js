const express = require("express");
const router = express.Router();
const User = require("../model/User");

// POST /api/user/connect-wallet
router.post("/connect-wallet", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: "Wallet required" });

  try {
    let user = await User.findOne({ walletAddress });

    if (!user) {
      user = await User.create({
        walletAddress,
        newPlayer: true,
        freeCard: 5,
        cards: [],
      });
    } else {
      user.newPlayer = user.freeCard > 0;
      await user.save();
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/:walletAddress
router.get("/:walletAddress", async (req, res) => {
  try {
    let user = await User.findOne({ walletAddress: req.params.walletAddress });

    // Auto-create if not found
    if (!user) {
      user = await User.create({
        walletAddress: req.params.walletAddress,
        newPlayer: true,
        freeCard: 5,
        cards: [],
      });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
