// server/routes/inventory.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../model/User");

// Helper to compute rarity from a numeric-ish ID
function getRarityFromId(cardId) {
  const num = parseInt(cardId);
  if (Number.isNaN(num)) return "Common";
  if (num >= 36) return "Mythical";
  if (num >= 21) return "Rare";
  return "Common";
}

// GET /api/inventory/:walletAddress
router.get("/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress;
    const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC_URL;
    const COLLECTION_ID = process.env.SD_COLLECTION_ID || null;

    if (!QUICKNODE_RPC_URL) {
      return res.status(500).json({
        message: "QUICKNODE_RPC_URL is not configured in backend .env",
      });
    }

    console.log("==== /api/inventory called ====");
    console.log("wallet:", walletAddress);
    console.log("COLLECTION_ID:", COLLECTION_ID);

    // Optional: still fetch user for balances
    let user = null;
    try {
      user = await User.findOne({ walletAddress });
    } catch (e) {
      console.error("Error fetching user from Mongo:", e);
    }

    // 1) Call QuickNode DAS: getAssetsByOwner
    const body = {
      jsonrpc: "2.0",
      id: "soulduel-inventory",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
        sortBy: { sortBy: "created", sortDirection: "asc" },
        options: {
          // QuickNode DAS supports these flags (showNativeBalance is NOT allowed)
          showFungible: false,
          showCollectionMetadata: true,
          // you COULD also add showUnverifiedCollections / showZeroBalance / showInscription if you want
        },
      },
    };

    const { data } = await axios.post(QUICKNODE_RPC_URL, body);

    if (data.error) {
      console.error("QuickNode DAS error:", data.error);
      return res.status(500).json({
        message: "QuickNode DAS error",
        error: data.error,
      });
    }

    const items = data?.result?.items || [];
    console.log("QuickNode items length:", items.length);

    if (items.length > 0) {
      console.log("Example asset.grouping:", items[0].grouping);
    }

    // 2) Filter to SoulDuel collection if COLLECTION_ID is set
    let filteredAssets = items;
    if (COLLECTION_ID) {
      filteredAssets = items.filter((asset) => {
        const grouping = asset.grouping || [];
        const match = grouping.some(
          (g) =>
            g.group_key === "collection" && g.group_value === COLLECTION_ID
        );
        return match;
      });
      console.log(
        "Filtered by collection, remaining assets:",
        filteredAssets.length
      );
    }

    // 3) Transform to cards for frontend
    const cards = filteredAssets.map((asset) => {
      const meta = asset.content?.metadata || {};
      const links = asset.content?.links || {};
      const files = asset.content?.files || [];

      const name = meta.name || "Unknown NFT";

      // Try to derive numeric ID from name like "SoulDuel #12"
      let numericId = null;
      const match = name.match(/\d+/);
      if (match) numericId = match[0];

      const cardId = numericId || asset.id.slice(0, 4);
      const rarity = getRarityFromId(cardId);

      const image =
        (files[0] && files[0].uri) || links.image || meta.image || "";

      return {
        mint: asset.id,
        cardId,
        name,
        image,
        isFree: false,
        count: 1,
        rarity,
      };
    });

    console.log("Cards returned to client:", cards.length);

    return res.json({
      cards,
      userInfo: user
        ? {
            currentBalance: user.currentBalance,
            betBalance: user.betBalance,
            winningBalance: user.winningBalance,
          }
        : null,
    });
  } catch (err) {
    console.error(
      "Error in /api/inventory:",
      err.response?.data || err.message || err
    );
    return res.status(500).json({
      message: "Server error in /api/inventory",
      detail: err.response?.data || err.message || String(err),
    });
  }
});

module.exports = router;
