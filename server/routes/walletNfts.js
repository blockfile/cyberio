// server/routes/walletNfts.js
const express = require("express");
const router = express.Router();

const { syncWalletNftsToDb, buildDeckFromDb } = require("../util/deck");

// Local retry helper – do NOT rely on server.js-scoped functions
async function withRetry(fn, { tries = 5, baseDelayMs = 500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw last;
}


router.post("/sync", async (req, res) => {
  try {
    let wallet =
      req.body?.wallet ||
      req.body?.walletAddress ||
      req.body?.address ||
      req.body?.publicKey ||
      "";

    if (typeof wallet === "object" && wallet.publicKey) {
      wallet = wallet.publicKey;
    }

    wallet = String(wallet).trim();

    if (!wallet || wallet.length < 20) {
      console.warn("[wallet-nfts] 400 – invalid wallet body:", req.body);
      return res
        .status(400)
        .json({ ok: false, error: "INVALID_WALLET", body: req.body });
    }

    console.log("[DECK] syncing wallet NFTs to DB:", wallet);
    const result = await syncWalletNftsToDb(wallet, withRetry);
    return res.json({ ok: true, wallet, ...result });
  } catch (e) {
    console.error("[wallet-nfts] sync error:", e?.message || e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "SYNC_FAILED" });
  }
});

/**
 * GET /api/wallet-nfts/:wallet
 * Returns deck-ready list from DB.
 */
router.get("/:wallet", async (req, res) => {
  try {
    const wallet = String(req.params.wallet || "").trim();
    if (!wallet || wallet.length < 20) {
      return res.status(400).json({ ok: false, error: "INVALID_WALLET" });
    }

    const { cardIds } = await buildDeckFromDb(wallet);
    return res.json({
      ok: true,
      wallet,
      items: cardIds,
      count: cardIds.length,
    });
  } catch (e) {
    console.error("[wallet-nfts] get error:", e?.message || e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "GET_FAILED" });
  }
});

module.exports = router;
