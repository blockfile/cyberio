/* eslint-env node, es2021 */
/* global BigInt */
const express = require("express");
const router = express.Router();

const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");

const User = require("../model/User");
const Listing = require("../model/Listing");
const CARD_METADATA = require("../util/cardMetadata.json");

const RPC_URL = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const SD_TOKEN_MINT = new PublicKey(
  "DrDzsdounCCy7wpjWKgpKUcmYB4xDzwkSPGw6jX52SoY"
);
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// ---------- helpers ----------
const rarityById = (id) => {
  const n = Number(id);
  if (n >= 36) return "Mythical";
  if (n >= 21) return "Rare";
  return "Common";
};
const decorate = (arr) =>
  arr.map((l) => ({ ...l, rarity: rarityById(l.cardId) }));

// ---------- routes ----------

// GET /api/market/listings?exclude=<wallet>
router.get("/listings", async (req, res) => {
  const exclude = req.query.exclude || "";
  const [others, mine] = await Promise.all([
    Listing.find({
      status: "active",
      sellerWallet: { $ne: exclude },
    })
      .sort({ createdAt: -1 })
      .lean(),
    exclude
      ? Listing.find({ status: "active", sellerWallet: exclude })
          .sort({ createdAt: -1 })
          .lean()
      : [],
  ]);
  res.json({ others: decorate(others), mine: decorate(mine) });
});

// POST /api/market/list  { walletAddress, cardId, quantity, priceSD }
// POST /api/market/list  { walletAddress, cardId, quantity, priceSD }
router.post("/list", async (req, res) => {
  const { walletAddress, cardId, quantity, priceSD } = req.body;
  if (!walletAddress || !cardId || !quantity || !priceSD) {
    return res.status(400).json({ error: "Missing fields" });
  }
  try {
    const user = await User.findOne({ walletAddress });
    if (!user) return res.status(404).json({ error: "User not found" });

    const meta = CARD_METADATA[String(cardId)];
    if (!meta) return res.status(400).json({ error: "Unknown cardId" });

    const invIdx = user.cards.findIndex(
      (c) => c.cardId === String(cardId) && c.isFree === false
    );
    if (invIdx === -1)
      return res
        .status(400)
        .json({ error: "Card not tradable (free or none owned)" });

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > user.cards[invIdx].count) {
      return res.status(400).json({ error: "Insufficient quantity" });
    }

    // Reserve: decrement inventory once for the total qty requested
    user.cards[invIdx].count -= qty;
    if (user.cards[invIdx].count <= 0) user.cards.splice(invIdx, 1);
    await user.save();

    // Split into N separate listings of quantity: 1 (same price)
    const docs = Array.from({ length: qty }).map(() => ({
      sellerWallet: walletAddress,
      cardId: String(cardId),
      name: meta.name,
      power: meta.power,
      priceSD: Number(priceSD),
      quantity: 1,
      status: "active",
    }));

    const created = await Listing.insertMany(docs, { ordered: true });

    res.json({
      ok: true,
      createdCount: created.length,
      listings: created.map((l) => ({
        ...l.toObject(),
        rarity: rarityById(cardId),
      })),
    });
  } catch (e) {
    console.error("List error:", e);
    res.status(500).json({ error: "Internal" });
  }
});

// POST /api/market/cancel { walletAddress, listingId }
router.post("/cancel", async (req, res) => {
  const { walletAddress, listingId } = req.body;
  if (!walletAddress || !listingId)
    return res.status(400).json({ error: "Missing fields" });

  const listing = await Listing.findOne({
    _id: listingId,
    sellerWallet: walletAddress,
    status: "active",
  });
  if (!listing)
    return res.status(404).json({ error: "Listing not found or not active" });

  const user = await User.findOne({ walletAddress });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Return reserved quantity
  const idx = user.cards.findIndex(
    (c) => c.cardId === listing.cardId && c.isFree === false
  );
  if (idx === -1) {
    user.cards.push({
      cardId: listing.cardId,
      name: listing.name,
      power: listing.power,
      count: listing.quantity,
      isFree: false,
    });
  } else {
    user.cards[idx].count += listing.quantity;
  }
  await user.save();

  listing.status = "cancelled";
  await listing.save();

  res.json({ ok: true });
});

// POST /api/market/intent { buyerWallet, listingId }
// Locks listing and returns a memo string that must be included in the token transfer.
router.post("/intent", async (req, res) => {
  const { buyerWallet, listingId } = req.body;
  if (!buyerWallet || !listingId)
    return res.status(400).json({ error: "Missing fields" });

  const listing = await Listing.findOneAndUpdate(
    { _id: listingId, status: "active" },
    {
      $set: {
        status: "locked",
        holdBuyer: buyerWallet,
        lockedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!listing) return res.status(409).json({ error: "Listing unavailable" });

  const memo = `${listing._id}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  listing.pendingMemo = memo;
  await listing.save();

  res.json({ memo });
});

// NEW: POST /api/market/intent-cancel { buyerWallet, listingId, memo? }
// Unlock immediately if user closes/rejects the Phantom prompt BEFORE any tx is sent.
router.post("/intent-cancel", async (req, res) => {
  const { buyerWallet, listingId, memo } = req.body;
  if (!buyerWallet || !listingId) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const listing = await Listing.findOne({
    _id: listingId,
    status: "locked",
    holdBuyer: buyerWallet,
  });

  if (!listing) {
    // Not locked (or different holder)—nothing to do.
    return res.json({ ok: true });
  }

  // Optional: require memo match if provided
  if (listing.pendingMemo && memo && memo !== listing.pendingMemo) {
    return res.status(409).json({ error: "Memo mismatch" });
  }

  listing.status = "active";
  listing.holdBuyer = null;
  listing.pendingMemo = null;
  listing.lockedAt = null;
  await listing.save();

  return res.json({ ok: true });
});

// GET /api/market/pending?wallet=<buyer>
router.get("/pending", async (req, res) => {
  const wallet = req.query.wallet;
  const q = { status: "locked" };
  if (wallet) q.holdBuyer = wallet;

  const rows = await Listing.find(q)
    .select(
      "_id cardId name power priceSD quantity sellerWallet pendingMemo lockedAt"
    )
    .sort({ lockedAt: -1 })
    .lean();

  res.json({ pending: decorate(rows) });
});

// POST /api/market/buy { buyerWallet, listingId, txSignature }
router.post("/buy", async (req, res) => {
  const { buyerWallet, listingId, txSignature } = req.body;
  if (!buyerWallet || !listingId || !txSignature) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const connection = new Connection(RPC_URL, "confirmed");

  try {
    // If sold already (idempotent)
    const sold = await Listing.findOne({
      _id: listingId,
      status: "sold",
    }).lean();
    if (sold) return res.json({ ok: true });

    // Only allow locked/pending; and bound to the holdBuyer (if set)
    const listing = await Listing.findOneAndUpdate(
      {
        _id: listingId,
        status: { $in: ["locked", "pending"] },
      },
      { $set: { status: "pending" } },
      { new: true }
    );
    if (!listing) return res.status(409).json({ error: "Listing unavailable" });

    if (listing.holdBuyer && listing.holdBuyer !== buyerWallet) {
      // not your reservation
      await Listing.updateOne(
        { _id: listingId },
        { $set: { status: "locked" } }
      );
      return res.status(403).json({ error: "Not your purchase reservation" });
    }

    // Fetch tx & verify transfer + memo
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) {
      await Listing.updateOne(
        { _id: listingId },
        { $set: { status: "locked" } }
      );
      return res.status(400).json({ error: "Transaction not found" });
    }

    // Verify memo
    const expectedMemo = listing.pendingMemo;
    let hasMemo = false;
    for (const ix of tx.transaction.message.instructions || []) {
      const program =
        ix.programId?.toBase58?.() || ix.program || ix.programId?.toString?.();
      if (program === MEMO_PROGRAM_ID || ix.program === "spl-memo") {
        if (typeof ix.parsed === "string" && ix.parsed === expectedMemo) {
          hasMemo = true;
          break;
        }
        if (ix.data) {
          try {
            const buf = Buffer.from(ix.data, "base64");
            if (buf.toString("utf8") === expectedMemo) {
              hasMemo = true;
              break;
            }
          } catch {}
        }
      }
    }
    if (!hasMemo) {
      await Listing.updateOne(
        { _id: listingId },
        { $set: { status: "locked" } }
      );
      return res.status(403).json({ error: "Missing memo for this purchase" });
    }

    // decimals from postTokenBalances (fallback 6)
    const decimals =
      tx.meta?.postTokenBalances?.find(
        (b) => b.mint === SD_TOKEN_MINT.toString()
      )?.uiTokenAmount?.decimals ?? 6;

    // expected amount: priceSD * 10^decimals * quantity (fixed-point via 6dp)
    let base = BigInt(Math.round(listing.priceSD * 1_000_000)); // 6dp fixed
    if (decimals >= 6) base *= BigInt(10) ** BigInt(decimals - 6);
    else base /= BigInt(10) ** BigInt(6 - decimals);
    const expectedAmount = base * BigInt(listing.quantity);

    const buyerPk = new PublicKey(buyerWallet);
    const sellerPk = new PublicKey(listing.sellerWallet);

    const buyerAta = await getAssociatedTokenAddress(SD_TOKEN_MINT, buyerPk);
    const sellerAta = await getAssociatedTokenAddress(SD_TOKEN_MINT, sellerPk);

    // Verify a transferChecked buyerAta -> sellerAta for expected amount
    const ok = tx.transaction.message.instructions.some((ix) => {
      const p = ix?.parsed;
      const programId = ix.programId?.toString?.() || ix.program;
      if (!p) return false;
      if (programId !== TOKEN_PROGRAM_ID && ix.program !== "spl-token")
        return false;

      if (p.type === "transferChecked") {
        return (
          p.info?.mint === SD_TOKEN_MINT.toString() &&
          p.info?.source === buyerAta.toString() &&
          p.info?.destination === sellerAta.toString() &&
          BigInt(p.info?.tokenAmount?.amount || "0") === expectedAmount
        );
      }
      return false;
    });

    if (!ok) {
      await Listing.updateOne(
        { _id: listingId },
        { $set: { status: "locked" } }
      );
      return res
        .status(403)
        .json({ error: "Token transfer verification failed" });
    }

    // Deliver cards to buyer
    let buyer = await User.findOne({ walletAddress: buyerWallet });
    if (!buyer) {
      buyer = await User.create({
        walletAddress: buyerWallet,
        cards: [],
        newPlayer: false,
        freeCard: 0,
      });
    }
    const idx = buyer.cards.findIndex(
      (c) => c.cardId === listing.cardId && c.isFree === false
    );
    if (idx === -1) {
      buyer.cards.push({
        cardId: listing.cardId,
        name: listing.name,
        power: listing.power,
        count: listing.quantity,
        isFree: false,
      });
    } else {
      buyer.cards[idx].count += listing.quantity;
    }
    await buyer.save();

    // Close listing
    listing.status = "sold";
    listing.buyerWallet = buyerWallet;
    listing.pendingMemo = null;
    listing.holdBuyer = null;
    listing.lockedAt = null;
    listing.purchaseTxSig = txSignature;
    await listing.save();

    res.json({ ok: true });
  } catch (e) {
    console.error("Buy error:", e);
    await Listing.updateOne(
      { _id: listingId, status: "pending" },
      { $set: { status: "locked" } }
    );
    res.status(500).json({ error: "Internal" });
  }
});

module.exports = router;
