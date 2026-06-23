# Card system (non-NFT, 5000-card pool)

The game is **non-NFT**: cards live in MongoDB on `User.cards`
(`{ cardId, name, count, isFree, power }`). No on-chain mint. Duels compare **power**.

## Card pool & power
- The pool is the **5000-image NFT art collection** in
  `src/components/assets/images/webp.5k.nfts/**/nft_<id>.webp` (id 1–5000, ~4998 present).
- Each card's **power (1–10)** is the number printed on the card's badge.
- There is **no metadata file** for these (the on-chain collection only exposes 6 assets), so
  power was extracted **from the badge pixels**, best-effort:
  - `scripts/matchBadges.js` — isolates the badge digit (fixed crop → OTSU → erase ring annulus)
    and classifies it with a **kNN** seeded by 100 hand-labeled cards.
  - **Leave-one-out accuracy ≈ 93%**; real-world is a bit lower on dark-background / blob cards.
  - Output → **`server/util/cardMetadata.json`**: `{ "<id>": { name:"#<id>", power, rarity } }`.
- **Rarity** is derived from power (3 tiers the client styles):
  `Common ≤4 · Rare 5–7 · Mythical ≥8`.

### Fixing wrong powers
- `scripts/needs-review-top.json` — the **500 most-ambiguous** cards (smallest match margin).
  Open the matching image, read the badge, and edit that id's `power` in
  `server/util/cardMetadata.json`. (`scripts/needs-review.json` is the full flag list.)
- Re-run everything: `node scripts/matchBadges.js full` (overwrites cardMetadata.json).
  To re-check accuracy: `node scripts/matchBadges.js loo`.

## Where it's used
- **Draw** — `server/routes/drawCard.js` loads `cardMetadata.json`, draws **rarity-weighted**
  across the whole pool (Mythical 7% / Rare 28% / Common 65%), stores `power` on `User.cards`.
- **Duel** — `server/sockets/earnNpc.socket.js` builds NPC hands from `cardMetadata.json` and
  `computeWinner` compares `power`; player powers come from `User.cards` via
  `server/util/deck.js` (`buildDeckFromDb`).
- **Inventory** — `server/routes/inventory.js` returns power-based rarity.
- **Client art** — `src/components/pages/cardArt.js` (`nftArt(id)`) → `public/cards5k/<id>.webp`.
  Used by inventory / play / market / EarnNpc (falls back to legacy `assets/images/cards`).

## Thumbnails
- `public/cards5k/<id>.webp` (~400×500) are generated from the 2000×2500 originals by
  `node scripts/makeThumbs.js`. **Git-ignored** (regenerable); the build still copies `public/`.

## Scratch / artifacts (under `scripts/`)
- `matchBadges.js`, `makeThumbs.js`, `rankReview.js` — the pipeline (keep).
- `_idmap.json` — id → source image path (keep; used by the scripts).
- `_cardMetadata.45.bak.json` — the previous 45-card metadata (backup, revert source).
- `ocrBadges.js`, `_ocrtest.js` — the abandoned tesseract.js OCR attempt (kept for reference).
