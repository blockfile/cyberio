// ─────────────────────────────────────────────────────────────────────────────
// Centralized on-chain config for the SERVER.
// Every value comes from process.env (server/.env). Applied on `pm2 restart`.
//
// SECRETS (TREASURY_PRIVATE_KEY, MONGO_URI, keyed RPC URLs) are read directly
// from process.env where they are used and are NOT given hardcoded defaults.
// The defaults here are only public, non-secret values so the app still boots
// in dev if an env var is missing.
// ─────────────────────────────────────────────────────────────────────────────

const clean = (v) => String(v || "").trim();

// Free public RPC — keyless fallback. Set SOLANA_RPC / QUICKNODE_RPC_URL to a real one.
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

// CYBERIO SPL token mint (cards, market, wagers). Aliases kept for back-compat.
const TOKEN_MINT =
  clean(process.env.CYBERIO_TOKEN_MINT) ||
  clean(process.env.SD_TOKEN_MINT) ||
  clean(process.env.WAGER_MINT) ||
  "DttktP1JiM63zGLSALiKs788mMYCunzRoZfCiwRFpump";

const TOKEN_DECIMALS = parseInt(
  clean(process.env.CYBERIO_DECIMALS) ||
    clean(process.env.WAGER_DECIMALS) ||
    "6",
  10
);

// Card-draw payment recipient — MUST match the client REACT_APP_DRAW_TREASURY.
// (Old env name was TREASURY_PUBKEY; still honored for back-compat.)
const DRAW_TREASURY =
  clean(process.env.DRAW_TREASURY) ||
  clean(process.env.TREASURY_PUBKEY) ||
  "8yUGx6tMGsCxSdVj2Fk8FyaDkg4doZ32xnkNkzKSwHe5";

// Price of one card draw, in whole CYBERIO tokens.
const DRAW_PRICE = parseInt(
  clean(process.env.DRAW_PRICE_CYBERIO) || clean(process.env.DRAW_PRICE_SD) || "5000",
  10
);

// PVP rake. Preserve historical defaults: 0 bps, no fee wallet.
const RAKE_BPS = parseInt(clean(process.env.RAKE_BPS) || "0", 10);
const FEE_WALLET = clean(process.env.FEE_WALLET) || null;

// Primary RPC + ordered, de-duped fallback list.
const SOLANA_RPC =
  clean(process.env.SOLANA_RPC) || clean(process.env.QUICKNODE_RPC_URL) || PUBLIC_RPC;

const RPC_URLS = Array.from(
  new Set(
    [
      SOLANA_RPC,
      clean(process.env.QUICKNODE_RPC_URL),
      ...clean(process.env.SOLANA_RPC_FALLBACKS || process.env.RPC_FALLBACKS)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      /devnet|testnet/i.test(SOLANA_RPC) ? "" : PUBLIC_RPC,
    ].filter(Boolean)
  )
);

module.exports = {
  PUBLIC_RPC,
  TOKEN_MINT,
  TOKEN_DECIMALS,
  DRAW_TREASURY,
  DRAW_PRICE,
  RAKE_BPS,
  FEE_WALLET,
  SOLANA_RPC,
  RPC_URLS,
};
