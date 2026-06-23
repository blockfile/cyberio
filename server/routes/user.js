const express = require("express");
const router = express.Router();
const User = require("../model/User");
const DimensionPass = require("../model/DimensionPass");

// POST /api/user/nickname  { walletAddress, nickname }
// A nickname can only be set/changed while the wallet holds an active Dimension Pass.
// The stored value persists, but the client only displays it while the pass is active
// (otherwise it falls back to the shortened wallet address).
router.post("/nickname", async (req, res) => {
  try {
    const { walletAddress, nickname } = req.body || {};
    if (!walletAddress) return res.status(400).json({ error: "Wallet required" });

    const pass = await DimensionPass.findOne({ wallet: walletAddress }).lean();
    const active = !!(pass && pass.expiresAt && new Date(pass.expiresAt) > new Date());
    if (!active) return res.status(403).json({ error: "Active Dimension Pass required to set a nickname" });

    const clean = String(nickname || "").trim();
    if (clean.length < 3 || clean.length > 16) {
      return res.status(400).json({ error: "Nickname must be 3–16 characters" });
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(clean)) {
      return res.status(400).json({ error: "Only letters, numbers, spaces, _ and -" });
    }

    const user = await User.findOneAndUpdate(
      { walletAddress },
      { $set: { nickname: clean } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, nickname: user.nickname });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
