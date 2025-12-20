/* eslint-env node, es2021 */
/* global BigInt */

const express = require("express");
const router = express.Router();
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");

const User = require("../model/User");
const DrawIntent = require("../model/DrawIntent");

/** ─ CONFIG ─ */
const RPC_URL = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const TREASURY_PUBKEY = new PublicKey(
  process.env.TREASURY_PUBKEY || "FtjTzPvSRVCaaM3u5BXKMKjkM8TACsyyuHPgv5YSQLGN"
);
const SD_TOKEN_MINT = new PublicKey(
  process.env.SD_TOKEN_MINT || "DrDzsdounCCy7wpjWKgpKUcmYB4xDzwkSPGw6jX52SoY"
);
// price in whole SD tokens (e.g. 20)
const DRAW_PRICE_SD = parseInt(process.env.DRAW_PRICE_SD || "20", 10);

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** ─ CARD META (unchanged) ─ */
const CARD_METADATA = {
  1: { name: "GLOOMJAW", power: 1 },
  2: { name: "DREGMORE", power: 2 },
  3: { name: "LURUEIL", power: 2 },
  4: { name: "KELUORN", power: 2 },
  5: { name: "KRULMAR", power: 3 },
  6: { name: "SIRENIA", power: 3 },
  7: { name: "AQUALURE WRAITH", power: 3 },
  8: { name: "NIMBUS SAGE", power: 3 },
  9: { name: "PETALBITE", power: 3 },
  10: { name: "SPORELURK", power: 1 },
  11: { name: "GROUNTHORN", power: 4 },
  12: { name: "WHISPECTRE", power: 4 },
  13: { name: "GRAMBARK", power: 4 },
  14: { name: "REGALEON", power: 4 },
  15: { name: "ASHUESSEL", power: 4 },
  16: { name: "CERBERASH", power: 5 },
  17: { name: "WRAITH OF THE ETHER", power: 5 },
  18: { name: "DUSKHOUND", power: 5 },
  19: { name: "ORBDRAKE", power: 5 },
  20: { name: "INFERNOSTEED", power: 5 },
  21: { name: "PLUMALOR", power: 7 },
  22: { name: "JOLTUNGEKO", power: 7 },
  23: { name: "LUMIBUN ECHOFORM", power: 7 },
  24: { name: "PLUMACRYPTIS", power: 7 },
  25: { name: "BINDGEIST", power: 7 },
  26: { name: "CENTAURON", power: 7 },
  27: { name: "BLOODROOT TUSKMARCH", power: 6 },
  28: { name: "LUMINISFLUTTER", power: 6 },
  29: { name: "GEO CORE COLOSSUS", power: 6 },
  30: { name: "VERDOLITH", power: 6 },
  31: { name: "CLOBBERCYCLOPS", power: 6 },
  32: { name: "IRONOX, RAMPAGING ENGINE", power: 6 },
  33: { name: "FLORAMIA", power: 7 },
  34: { name: "VERDALYN", power: 7 },
  35: { name: "GRIMSTUDENT", power: 7 },
  36: { name: "VOLTSHACKLE WRAITH", power: 9 },
  37: { name: "SERAPHAIM", power: 8 },
  38: { name: "LUMINIBUN", power: 8 },
  39: { name: "SCORLEON", power: 8 },
  40: { name: "SOLARIOHOOF", power: 8 },
  41: { name: "MEDUSARIA", power: 9 },
  42: { name: "WICKSHROUD", power: 9 },
  43: { name: "VIOLETFLARE ROC", power: 10 },
  44: { name: "IGNISCARN, FLAMEBOUND", power: 10 },
  45: { name: "TERRADRAKE", power: 10 },
};

/** ─ UTILS ─ */
const rarityOf = (id) => (id >= 36 ? "Mythical" : id >= 21 ? "Rare" : "Common");

function priceToBaseUnits(priceSD, decimals) {
  // 6dp fixed → BigInt
  let base = BigInt(Math.round(Number(priceSD) * 1_000_000));
  if (decimals >= 6) base *= BigInt(10) ** BigInt(decimals - 6);
  else base /= BigInt(10) ** BigInt(6 - decimals);
  return base;
}

/** Robust verifier:
 *  - Ensures memo matches the intent
 *  - Finds a transferChecked for the SD mint with the expected amount
 *  - Verifies source token account is owned by buyer
 *  - Verifies destination token account is owned by treasury
 *  Accepts *any* SPL token accounts (ATA or non-ATA) as long as owners match.
 */
async function verifyDrawPayment({
  connection,
  txSignature,
  buyerWallet,
  memo,
}) {
  const tx = await connection.getParsedTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) return { ok: false, reason: "Transaction not found" };

  // 1) memo check
  let memoOk = false;
  for (const ix of tx.transaction.message.instructions || []) {
    const program =
      ix.programId?.toBase58?.() || ix.program || ix.programId?.toString?.();
    if (program === MEMO_PROGRAM_ID || ix.program === "spl-memo") {
      if (typeof ix.parsed === "string" && ix.parsed === memo) {
        memoOk = true;
        break;
      }
      if (ix.data) {
        try {
          const buf = Buffer.from(ix.data, "base64");
          if (buf.toString("utf8") === memo) {
            memoOk = true;
            break;
          }
        } catch {}
      }
    }
  }
  if (!memoOk) return { ok: false, reason: "Missing memo" };

  // 2) expected amount (decimals from postTokenBalances; fallback 6)
  const decimals =
    tx.meta?.postTokenBalances?.find((b) => b.mint === SD_TOKEN_MINT.toString())
      ?.uiTokenAmount?.decimals ?? 6;
  const expected = priceToBaseUnits(DRAW_PRICE_SD, decimals);

  // 3) locate a matching transferChecked and verify account owners
  const ixs = tx.transaction.message.instructions || [];
  for (const ix of ixs) {
    const p = ix?.parsed;
    const programId = ix.programId?.toString?.() || ix.program;
    if (!p) continue;
    if (programId !== TOKEN_PROGRAM_ID && ix.program !== "spl-token") continue;
    if (p.type !== "transferChecked") continue;

    const mint = p.info?.mint;
    const amount = BigInt(p.info?.tokenAmount?.amount || "0");
    const src = p.info?.source;
    const dst = p.info?.destination;

    if (mint !== SD_TOKEN_MINT.toString()) continue;
    if (amount !== expected) continue;

    // Verify src owner == buyer & dst owner == treasury
    const [srcInfo, dstInfo] = await Promise.all([
      connection.getParsedAccountInfo(new PublicKey(src)),
      connection.getParsedAccountInfo(new PublicKey(dst)),
    ]);

    const srcOwner =
      srcInfo?.value?.data?.parsed?.info?.owner ||
      srcInfo?.value?.data?.parsed?.info?.owner?.toString?.();
    const srcMint = srcInfo?.value?.data?.parsed?.info?.mint;
    const dstOwner =
      dstInfo?.value?.data?.parsed?.info?.owner ||
      dstInfo?.value?.data?.parsed?.info?.owner?.toString?.();
    const dstMint = dstInfo?.value?.data?.parsed?.info?.mint;

    const srcOwnerOk = srcOwner === buyerWallet;
    const dstOwnerOk = dstOwner === TREASURY_PUBKEY.toBase58();
    const srcMintOk = srcMint === SD_TOKEN_MINT.toBase58();
    const dstMintOk = dstMint === SD_TOKEN_MINT.toBase58();

    if (srcOwnerOk && dstOwnerOk && srcMintOk && dstMintOk) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "Token transfer mismatch" };
}

/** ─ ROUTES ─
 *  /api/draw-card/intent
 *  /api/draw-card/finalize
 *  /api/draw-card/pending
 *  /api/draw-card/cancel
 *  /api/draw-card/free
 */

/** POST /api/draw-card/intent  { walletAddress } */
router.post("/intent", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress)
    return res.status(400).json({ error: "Missing walletAddress" });

  const user = await User.findOne({ walletAddress });
  if (!user) return res.status(404).json({ error: "User not found" });

  // If free draw available, no intent needed
  if (user.newPlayer && user.freeCard > 0) {
    return res.json({ free: true });
  }

  // Create a unique memo for this intent
  const memo = `DRAW:${walletAddress}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  const doc = await DrawIntent.create({
    wallet: walletAddress,
    memo,
    priceSD: DRAW_PRICE_SD,
    status: "locked",
    lockedAt: new Date(),
  });

  res.json({
    free: false,
    memo: doc.memo,
    priceSD: DRAW_PRICE_SD,
    mint: SD_TOKEN_MINT.toBase58(),
    treasury: TREASURY_PUBKEY.toBase58(),
  });
});

/** GET /api/draw-card/pending?wallet=<addr> */
router.get("/pending", async (req, res) => {
  const wallet = req.query.wallet || "";
  const rows = await DrawIntent.find({
    wallet,
    status: "locked",
  })
    .sort({ lockedAt: -1 })
    .select("memo priceSD lockedAt")
    .lean();

  res.json({ pending: rows });
});

/** POST /api/draw-card/cancel  { walletAddress, memo } */
router.post("/cancel", async (req, res) => {
  const { walletAddress, memo } = req.body;
  if (!walletAddress || !memo) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const doc = await DrawIntent.findOne({
    wallet: walletAddress,
    memo,
    status: "locked",
  });
  if (!doc) {
    return res
      .status(404)
      .json({ error: "No locked intent found for this wallet & memo" });
  }

  doc.status = "expired";
  await doc.save();
  res.json({ ok: true });
});

/** POST /api/draw-card/finalize  { walletAddress, txSignature, memo } */
router.post("/finalize", async (req, res) => {
  const { walletAddress, txSignature, memo } = req.body;
  if (!walletAddress || !txSignature || !memo) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const intent = await DrawIntent.findOne({
    wallet: walletAddress,
    memo,
    status: "locked",
  });
  if (!intent)
    return res
      .status(409)
      .json({ error: "Intent not found or already finalized" });

  const connection = new Connection(RPC_URL, "confirmed");

  // Verify payment (robust)
  const verified = await verifyDrawPayment({
    connection,
    txSignature,
    buyerWallet: walletAddress,
    memo,
  });
  if (!verified.ok) {
    // surface exact reason to the client
    return res.status(403).json({ error: verified.reason || "Verify failed" });
  }

  // Award the card
  const user = await User.findOne({ walletAddress });
  if (!user) return res.status(404).json({ error: "User not found" });

  // RNG with your original weights
  const rand = Math.random() * 100;
  let cardId;
  if (rand < 2) {
    cardId = Math.floor(Math.random() * 10 + 36);
  } else if (rand < 30) {
    cardId = Math.floor(Math.random() * 15 + 21);
  } else {
    cardId = Math.floor(Math.random() * 20 + 1);
  }

  const idStr = String(cardId);
  const meta = CARD_METADATA[idStr];
  if (!meta) return res.status(500).json({ error: "Card metadata missing" });

  const existing = user.cards.find(
    (c) => c.cardId === idStr && c.isFree === false
  );
  if (existing) existing.count += 1;
  else
    user.cards.push({
      cardId: idStr,
      name: meta.name,
      power: meta.power,
      count: 1,
      isFree: false,
    });

  await user.save();

  // Close the intent idempotently
  intent.status = "completed";
  intent.txSignature = txSignature;
  await intent.save();

  res.json({
    drawnCard: idStr,
    name: meta.name,
    power: meta.power,
    rarity: rarityOf(cardId),
    updatedUser: user,
  });
});

/** FREE draw (unchanged) */
router.post("/free", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress)
    return res.status(400).json({ error: "Missing walletAddress" });

  const user = await User.findOne({ walletAddress });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!(user.newPlayer && user.freeCard > 0)) {
    return res.status(403).json({ error: "No free draw available" });
  }

  user.freeCard -= 1;
  if (user.freeCard === 0) user.newPlayer = false;

  const rand = Math.random() * 100;
  let cardId;
  if (rand < 2) {
    cardId = Math.floor(Math.random() * 10 + 36);
  } else if (rand < 30) {
    cardId = Math.floor(Math.random() * 15 + 21);
  } else {
    cardId = Math.floor(Math.random() * 20 + 1);
  }

  const idStr = String(cardId);
  const meta = CARD_METADATA[idStr];
  if (!meta) return res.status(500).json({ error: "Card metadata missing" });

  const existing = user.cards.find(
    (c) => c.cardId === idStr && c.isFree === true
  );
  if (existing) existing.count += 1;
  else
    user.cards.push({
      cardId: idStr,
      name: meta.name,
      power: meta.power,
      count: 1,
      isFree: true,
    });

  await user.save();

  res.json({
    drawnCard: idStr,
    name: meta.name,
    power: meta.power,
    rarity: rarityOf(cardId),
    updatedUser: user,
  });
});

module.exports = router;
