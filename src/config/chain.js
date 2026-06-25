// ─────────────────────────────────────────────────────────────────────────────
// Centralized on-chain config for the CLIENT.
// Every value comes from .env (REACT_APP_*). CRA bakes these at BUILD time, so
// after changing .env you MUST rebuild (`npm run build`).
//
// SECURITY: never bake a secret (an RPC URL containing an API key) as a default
// here — it would ship in the public JS bundle. The defaults below are only
// public, non-secret values (the token mint, public treasury addresses, the
// free public RPC). Put your real (keyed) RPC in REACT_APP_SOLANA_RPC.
// ─────────────────────────────────────────────────────────────────────────────

const clean = (v) => String(v || "").trim();

// Free public RPC — safe fallback with no API key. Override via REACT_APP_SOLANA_RPC.
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

// CYBERIO SPL token (used for card draws, market listings, and PVP wagers).
export const TOKEN_MINT =
  clean(process.env.REACT_APP_TOKEN_MINT) ||
  "DttktP1JiM63zGLSALiKs788mMYCunzRoZfCiwRFpump";

export const TOKEN_DECIMALS = Number(process.env.REACT_APP_TOKEN_DECIMALS ?? 6);

// Where card-draw payments are sent. The client builds this transfer itself, so
// it MUST match the server's DRAW_TREASURY. Public address → safe as a default.
export const DRAW_TREASURY =
  clean(process.env.REACT_APP_DRAW_TREASURY) ||
  "8yUGx6tMGsCxSdVj2Fk8FyaDkg4doZ32xnkNkzKSwHe5";

// PVP wager treasury. The SERVER supplies the real one at runtime
// (paymentGate.treasuryWallet, derived from TREASURY_PRIVATE_KEY); this is only
// a defensive fallback. Intentionally has NO hardcoded default — a stale wallet
// baked here would be a hazard, so we fail loud instead.
export const PVP_TREASURY = clean(process.env.REACT_APP_TREASURY_ADDRESS) || "";

// Max wager (UI/logic cap).
export const MAX_BET_TOKENS = Number(process.env.REACT_APP_MAX_BET_TOKENS ?? 100000);

// Primary RPC endpoint. Set your keyed RPC in REACT_APP_SOLANA_RPC (or
// REACT_APP_QUICKNODE_RPC_URL); otherwise the public RPC is used.
export const RPC_ENDPOINT =
  clean(process.env.REACT_APP_SOLANA_RPC) ||
  clean(process.env.REACT_APP_QUICKNODE_RPC_URL) ||
  PUBLIC_RPC;

// Ordered, de-duped RPC list (primary + REACT_APP_SOLANA_RPC_FALLBACKS + public).
export const RPC_FALLBACKS = Array.from(
  new Set(
    [
      RPC_ENDPOINT,
      ...clean(process.env.REACT_APP_SOLANA_RPC_FALLBACKS)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      /devnet|testnet/i.test(RPC_ENDPOINT) ? "" : PUBLIC_RPC,
    ].filter(Boolean)
  )
);
