const express = require("express");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const router = express.Router();

const chainCfg = require("../config/chain");
const RPC = chainCfg.SOLANA_RPC;
const connection = new Connection(RPC, "confirmed");

function clean(v) {
  return String(v ?? "").trim();
}

function toPubkey(v, label) {
  const s = clean(v);
  if (!s) throw new Error(`Missing ${label}`);
  try {
    return new PublicKey(s);
  } catch (e) {
    throw new Error(`Invalid ${label}: ${s}`);
  }
}

/**
 * GET /api/wallet-nfts/ata-exists?owner=&mint=&tokenProgramId=
 * Returns: { exists: boolean, ata: string }
 */
router.get("/ata-exists", async (req, res) => {
  try {
    const ownerPk = toPubkey(req.query.owner, "owner");
    const mintPk = toPubkey(req.query.mint, "mint");
    const tokenProgramPk = toPubkey(req.query.tokenProgramId, "tokenProgramId");

    const ata = await getAssociatedTokenAddress(
      mintPk,
      ownerPk,
      false,
      tokenProgramPk,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const info = await connection.getAccountInfo(ata, "confirmed");
    return res.json({ exists: !!info, ata: ata.toBase58() });
  } catch (e) {
    return res.status(400).json({
      exists: false,
      error: e?.message || "Bad Request",
      received: {
        owner: clean(req.query.owner),
        mint: clean(req.query.mint),
        tokenProgramId: clean(req.query.tokenProgramId),
      },
    });
  }
});

module.exports = router;
