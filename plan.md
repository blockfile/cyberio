# Cyber City `/world` — Plan & Working Doc

Living document for the city at the `/world` route. **Keep this updated on every change.**

## Current approach: TILE-BASED top-down city (v5)
Real tile grid (not a flat picture, not isometric): the ground is a grid of top-down tiles that
autotile from a hand-authored `MAP`; buildings are **individual clickable React sprites** placed on
the grid; plus moving taxis, an animated fountain plaza, neon/flicker glow, and rain + scanline
ambience. Matches the user's reference (gray grid streets, green tree-blocks, neon buildings) while
being fully interactive + animated.

## Architecture
- **Component:** [src/components/world/World.jsx](src/components/world/World.jsx) + [world.css](src/components/world/world.css)
- **Ground tiles:** `public/citymap/td/*.png` — `road_v`, `road_h` (=road_v rotated 90°),
  `road_x` (4-way + crosswalks; also used for T/corners), `pave` (sidewalk), `grass` (lots/park).
  All 64×64, `image-rendering: pixelated`, drawn 1:1 (TILE=64).
- **Building/prop sprites:** `public/citymap/sprites/*.png` — each a standalone top-down PixelLab
  object (transparent bg), rendered at native size, anchored bottom-centre.
- **Layout:** `MAP` = array of strings, one char/tile. Legend: `R`=road · `.`=building lot (grass) ·
  `,`=sidewalk · `g`=park grass · `P`=plaza (fountain on top) · `H`=special. Roads are **1-wide**
  lines separating **4-wide blocks** (cols 1,6,11,16,21 / rows 1,6,11,16); 1-wide keeps straight
  roads straight and only true crossings become `road_x` (avoids a crosswalk checkerboard).
- **Autotiling:** `groundTile()` picks road_v/h/x from 4-neighbour road presence.
- **Buildings:** `BUILDINGS = [[sprite, blockCol, blockRow]]`; centred in their 4×4 block. Clickable
  `<button>` → sets HUD label + golden active glow. Drag-vs-click guarded by a moved flag.
- **View:** drag to pan, wheel to zoom (`view {s,x,y}` transform on `.td-stage`).

## Animations
- **Neon glow** (`.neon`) always-on pulse; **sign flicker** (`.flick`) occasional dropout.
- **Moving taxis** (`TAXIS`) — CSS keyframes drive sprites along avenues (h/v, with reverse).
- **Fountain plaza** — soft cyan pulse (`.fountain-glow`).
- **Ambience** — `.world-rain` (animated diagonal streaks), `.world-scanlines`, `.world-sheen`.

## Asset pipeline (PixelLab)
- curl JSON-RPC to `https://api.pixellab.ai/mcp` (Bearer in `~/.claude.json`).
  SSE: `grep '^data: ' | sed 's/^data: //'`.
- **Docs:** https://api.pixellab.ai/mcp/docs · API v2: https://api.pixellab.ai/v2/llms.txt
- **Road tiles:** `create_tiles_pro` `tile_type:square_topdown`, `tile_view:top-down`, 64px, numbered
  description ("1). vertical road 2). crossroad 3). sidewalk 4). grass"). Returns 16 (4 types ×4
  variants); download zip `/mcp/tiles-pro/{id}/download`.
  (Tried `create_topdown_tileset` Wang first — it blended road↔grass as raised blocks, wrong look.)
- **Building/prop sprites:** `create_map_object` `view:high top-down` (renders a tidy 3/4-ish
  top-down sprite), `detail:high detail` (NOTE: enum is `low|medium|high detail`), `outline:selective
  outline`, width/height ≤400. They come with an **opaque gray/white bg** → flood-fill 4 corners
  (`magick -fuzz 14% -fill none -draw "alpha x,y floodfill"` ×4), then `-trim +repage -border 2`.
  Download `/mcp/map-objects/{id}/download` (the endpoint returns the PNG even when the JSON status
  call hiccups — download directly if status looks empty).
- Rate limits: space `create_map_object` ~7-8s; retry "rate limit exceeded" after a pause.
- Verify via headless Chrome (`scripts/_shot.js`). **Dev server currently on :3000** (was :3009).
- Account: paid Tier 1, ~1500 gens left.

## Sprites present
Buildings: cyber_mall, hospital, police, hotel, arcade, data_tower, ramen, apartment_a, server_hall,
weapon_market, clinic. Props: fountain_plaza, taxi. Raw pre-floodfill copies in `scripts/_bldg_raw/`.

## Changelog
- **v48 — wallet-gate GPU compatibility fix (flickering/disappearing content on some PCs).**
  Reviewed `D:\video.mp4` frame-by-frame: the `CyberLanding` panel remained mounted, but its
  text/button compositor layer intermittently disappeared while the translucent panel background
  remained. This ruled out missing assets and wallet reconnect/unmount loops and pointed to a
  Windows/Chrome GPU compositing problem caused by nested translucent effects over the continuously
  animated city. Updated `src/components/pages/cyber-landing.css`: removed both nested
  `backdrop-filter` blurs and the scanline `mix-blend-mode`; replaced them with darker, stable
  semi-opaque gradients; disabled the overlay grid mask; changed the panel entrance from a
  transform+opacity animation to opacity-only; replaced the animated clip-path logo glitch with
  static cyan/magenta offsets; and removed the infinite connect-button shadow pulse. The neon look
  remains, but the wallet gate no longer depends on fragile GPU backdrop sampling or continuous
  layer recomposition. Verified with a successful optimized production build
  (`main.df778140.js`, `main.8354a0ed.css`); only the project's existing unrelated ESLint warnings
  remain.
- **v47 — DELETED the dormant NFT files (reversible).** Removed the now-unused NFT card code:
  DELETED FILES (all were git-tracked → restorable):
    · server/routes/walletNfts.js        (NFT card sync/list router)
    · server/routes/inventorybackup.js   (redundant; inventory.js is now the DB version)
    · server/model/NftAsset.js
    · server/model/NftAssetDb.js
    · server/model/WalletNft.js
    · server/util/dasClient.js           (DAS RPC client)
    · server/util/nftStats.js            (NFT power/skill computation)
  EDITS: `server/util/deck.js` stripped to DB-only (`buildDeckFromDb` + `getCardPowerFromSocket`,
  removed `syncWalletNftsToDb`/DAS); `server/sockets/earnNpc.socket.js` dropped the `NftAssetDb` +
  `nftStats` requires; `server/server.js` removed the `walletNftsRouter` require + its
  `app.use("/api/wallet-nfts", walletNftsRouter)` mount. KEPT `server/routes/walletNfts.routes.js`
  (still mounted at /api/wallet-nfts) because it serves `ata-exists` — an SPL token-account check for
  Dimension Pass PAYMENT, not cards.
  ↩️ TO REVERT (go back to NFT cards): `git checkout HEAD -- server/routes/walletNfts.js
  server/routes/inventorybackup.js server/model/NftAsset.js server/model/NftAssetDb.js
  server/model/WalletNft.js server/util/dasClient.js server/util/nftStats.js`, then undo the v46/v47
  edits (re-add the `walletNftsRouter` require+mount in server.js, restore the NFT versions of
  deck.js / inventory.js / earn.js / earnNpc.socket.js / inventory.jsx / WalletConnect.js — all in
  git history). Verified after deletion: no dangling refs, server boots, /api/inventory + /api/earn
  DB-based, ata-exists still responds.
- **v46 — ABANDON NFT cards → fully database-backed (non-NFT).** Draws already wrote to `User.cards`;
  this repoints every card READ from NFTs/DAS to the DB:
  · `server/util/deck.js buildDeckFromDb` → reads `User.cards`, expands by `count` into the deck pool
    (`cid` = cardId so the client maps it to local art; `dealHands` still assigns a unique `uid`).
    Used by PvP `findMatch` and P2E bonus hands. (`syncWalletNftsToDb` left intact but unused.)
  · `server/sockets/earnNpc.socket.js` `getLowPowerCount` + `loadLowPowerDeck` → `User.cards`.
  · `server/routes/earn.js` `/eligibility` → low-power count summed from `User.cards` (was NftAssetDb).
  · `server/routes/inventory.js` → returns `User.cards` (rewrote the DAS version; was reading chain).
  · `src/components/pages/inventory.jsx` → `require.context` maps cardId → /assets/images/cards/<id>.webp
    so DB cards (no `image`) render local art (grid + modal).
  · `src/context/WalletConnect.js` → `fetchCachedCardCount` sums `/api/inventory` counts; `syncWalletNfts`
    is now a no-op (no chain sync on connect).
  Dormant/unused now (left in place to avoid breakage): walletNfts routes, NftAsset/NftAssetDb/WalletNft
  models, dasClient, nftStats. The only remaining /api/wallet-nfts use is `ata-exists` in
  DimensionPassStore — that's an SPL token-account check for pass PAYMENT, not cards. Verified: server
  endpoints return DB data (inventory `{cards:[]}`, eligibility DB-based), app mounts on / /inventory
  /world with no errors.
- **v45c — disabled wallet auto-connect on refresh; hide empty CA pill.** The WalletConnect mount
  effect used to silently `connectWithProvider(preferred, {onlyIfTrusted:true})` on every load,
  which made Phantom pop up on refresh. Now that effect ONLY pre-selects the last provider for the
  UI (`pickProvider`) and does NOT connect — the wallet connects solely when the user clicks
  "Connect Wallet". CyberLanding hides the CA pill when `CA` is empty.
- **v45b — landing also gates /world (overlay over the live city).** `CyberLanding` now takes an
  `overlay` prop: in overlay mode it skips the static bg image and renders transparent (dim +
  blur, z 100000) so the LIVE animated world shows behind the neon connect panel. World.jsx renders
  `<CyberLanding overlay onConnect={walletCtx.connectWallet} />` when `!connected` (replaced the old
  `.world-connect-hint`). Connecting hides the gate and spawns the player. Verified headless on
  /world: overlay + CYBERIO logo present with the live scene + 64 walkers behind, no errors.
- **v45 — cyberpunk landing / connect screen (ISLANDS-style).** New `CyberLanding.jsx` +
  `cyber-landing.css`, shown by `dapp.jsx` when `!wallet` (the dashboard renders only once
  connected). Full-screen blurred CITY backdrop = a rendered shot of /world saved to
  `public/cyber-landing-bg.jpg` (set inline via `process.env.PUBLIC_URL` — a CSS `url("/..")`
  made CRA throw "Cannot find module"). Centred neon panel: glowing corner brackets, "NEON CITY
  ONLINE" badge, glitch CYBERIO logo (Press Start 2P + cyan/magenta clip-path glitch pseudo-
  elements), tagline, pulsing "Connect Wallet" button (calls `connectWallet` from context),
  Docs/Terms/𝕏/Discord links (edit `LINKS` in the component), and a copy-CA pill (`CA` const =
  CYBERIO mint). Animated grid + scanline + vignette + ken-burns drift overlays. Verified headless:
  landing renders with logo/button, no errors.
- **v44 — multiplayer presence (socket.io): connected wallets see each other live.** Server: new
  `server/sockets/world.socket.js` (`attachWorldSocket`, called in server.js `io.on('connection')`)
  keeps a `worldPlayers` map + a "world" room; events `world:join` (→ sends newcomer the existing
  `world:players`, broadcasts `world:player`), `world:move` → `world:moved`, `world:char` →
  `world:charChanged`, and `world:left` on leave/disconnect. Client (World.jsx): when wallet
  connected, opens `io(SOCKET_URL)`, emits join + position ~10×/s (from `playerPosRef`), and renders
  other players as `.world-remote` (their character walk sheet + cyan abbreviated-address nameplate),
  smoothly interpolated (lerp toward last reported pos) + depth-sorted, walk-cycle play/pause by
  their moving flag. Character switch emits `world:char` (no reconnect). Requires the API/socket
  server on :3001 (SOCKET_URL via config/endpoints). Verified: 2-client server test (join/move×16/
  leave all received) and a browser+ghost test (page renders the remote, which moves ~189px live);
  ghosts from ungraceful disconnects clear via socket.io ping-timeout. NOTE: positions are not yet
  server-validated/persisted (trust-client) — fine for presence; add validation if it becomes
  competitive.
- **v43 — click-to-move (pathfinding).** Added `findPath(sx,sy,dx,dy)` BFS on the walkable grid.
  `onClick` on `.world-scene` converts the click to a scene point (via the scene's
  `getBoundingClientRect` scale) → tile, BFS from the player's current tile, and stores the path
  (scene waypoints) in `pathRef`. The player loop follows the path when no WASD is held (WASD clears
  the path and takes over); facing + walk-cycle update from the step direction. A pulsing
  `.world-dest` ring marks the destination (positioned via left/top so its transform-pulse isn't
  clobbered). `playerPosRef` exposes the live position to the click handler. Verified headless:
  clicking a tile walked the avatar ~264px with the marker shown, WASD still overrides, no errors.
- **v42 — player polish: bigger avatar, wallet nameplate, character-switch HUD.** Player sprite
  enlarged (`.player-sprite` --fw 60→70, height 104→120) so it clearly reads bigger than the 51px
  NPC walkers. Abbreviated wallet address (`addr.slice(0,4)+'…'+slice(-4)`) shown as a gold
  `.player-name` nameplate above the avatar's head (rides with it). `charId` is now React state
  (persisted to `CYBERIO_CHAR`); a bottom-left `.world-charbar` HUD (only when connected) shows the
  3 converted characters as clickable thumbnails (`player{id}_s.png`) + the address + "move with
  WASD" — clicking re-spawns the avatar with that character's sheets. Verified headless: charbar
  (3 opts), nameplate, player 70×120 vs NPC 52×88, switch player1→player2 updates the sprite, and
  the not-connected state shows only the hint. No errors.
- **v41 — player avatar: wallet-gated, WASD-controlled, from the user's characters.** The 3 user
  characters in `public/characters/{1,2,3}` are high-res illustrated TOP-DOWN art (front/back/left/
  right) — not iso pixel — so they were re-created as iso pixel characters via PixelLab
  `create_character` (4-dir, low top-down) + `animate_character('walking')`, matching each look
  (green-armor/white-hair, purple visor soldier, blue-hair rebel). Saved `player{1-3}_{s,e,n,w}.png`
  (idle) + `player{1-3}_walk_{dir}.png` (6-frame sheets) via `scripts/buildNpcWalk.py player ...`.
  `/characters` (CharacterStage) now persists the picked id to `localStorage CYBERIO_CHAR`.
  World.jsx: reads `WalletContext.wallet` — when CONNECTED, spawns the chosen avatar near the plaza
  and a `requestAnimationFrame` loop gives WASD free-movement with tile-collision (same `isWalkable`
  grid), directional walk sheet (idle = paused frame 0), depth-sorted z, a gold marker ring, and a
  CAMERA that follows the player (writes the scene transform directly; wheel still zooms). When NOT
  connected: no avatar + a "connect your wallet" hint. Verified headless both states (avatar moves
  ~190px on D with walk sheet; gated state shows hint, no player, NPCs still wander, no errors).
  NOTE: single-player/local only — live multiplayer (every wallet visible to others) would need a
  realtime backend and is not built.
- **v40 — NPC life: speech bubbles, breathing idle, shop-bound customers.** (1) Random speech
  bubbles: each NPC (walker + standby) has a hidden `.npc-bubble`; a `setInterval` in the engine
  effect occasionally shows a random cyberpunk line on a free bubble for ~2-4s (max 6 at once),
  bubble rides the walker (child element), z 9000. (2) Standby idle is now `npcBreathe` (gentle
  scaleY from the feet) instead of sway; standby wrapped in `.world-standby` (sprite kept in-flow so
  width resolves). (3) Shoppers: `SHOP_DOORS` = nearest walkable tile to each shop; ~1/3 of agents
  get a `target` and `pick()` steps greedily toward it (82%), then on arrival sets `pauseUntil`
  (1.8-4.4s browse — legs `animation-play-state:paused`) and retargets another shop. Verified
  headless: 64 walkers + 14 standby, bubbles showing with text, breathing anim active, no errors.
- **v39 — real walk-cycle NPCs + collisions (JS engine).** Replaced the CSS hop/slide with a proper
  movement engine. PixelLab `animate_character(template='walking', frame_count=6)` for all 6 chars →
  per-direction 6-frame sets; `scripts/buildNpcWalk.py` downloads frames (curl; backblaze 403s
  urllib), crops to a shared bbox and pastes into a fixed 46×80 frame (feet bottom-aligned) →
  `npc{1-6}_walk_{s,e,n,w}.png` 6-frame strips. World.jsx: `isWalkable(tx,ty)` = the COLLISION grid
  (blocks water/dock, `occupied` buildings/trees/props/statues, HOLO_PAD fenced area, roundabout
  islands). 64 `npcAgents` spawn on walkable road tiles, each tile-walks via a `requestAnimationFrame`
  loop (refs, no React re-render): picks a walkable neighbour each tile (72% keep going straight),
  lerps between tiles at `speed` 0.85-1.85 tiles/s (some stroll/some hurry), writes `transform` +
  depth `zIndex` to the DOM, and swaps the directional walk sheet on `.world-walker-sprite` (6-frame
  `walkCycle` steps animation = moving legs). 14 standby NPCs unchanged. Verified headless: 64 walkers
  moving ~131px/s with walk-sheet backgrounds, no errors.
- **v38 — FIX: walkers were invisible (width:0).** The walker `<img>` is absolutely positioned inside
  a zero-width `.world-npc-mover`; with `width:auto` its computed width collapsed to 0 (height still
  rendered) → sprites invisible, so only the 14 standby (which have explicit left/top) showed. Fix:
  `.world-npc-mover > .world-npc { position: relative; display: block; }` so the walker img is in-flow
  and `width:auto` resolves from the intrinsic ratio. Now all ~90 walkers render and stream visibly.
- **v37 — big crowd: ~90 walking NPCs in continuous streams.** Replaced per-walker random spawns with
  `streamWalk(A,B,count)` = `count` pedestrians evenly spaced along a path (staggered delays
  `-(i/count)*dur`) so every avenue shows an unbroken marching line. 5 each way × 8 avenues + plaza
  crossers ≈ 90 walkers (+14 standby). Fade trimmed to 2% (visible ~the whole loop), NPC height
  84→94px, added a faint cyan glow so they pop. Verified headless: 90 movers, all visible.
- **v36 — many more, actually-walking NPCs.** The v35 walkers crossed the WHOLE map (~34s/loop) so
  motion was imperceptible → looked all-standby. Now 32 walkers spawn on SHORT avenue segments
  (10-18 tiles, 4 per avenue, random dir/lane), speed raised to ~95px/s (`dur = dist/95`, min 5s),
  negative random delay desyncs phases. Stride made obvious: `npcBob` now bobs 6px + leans ±3° at
  0.42s. Verified headless: 32 walkers + 14 standby, lead walker moves ~191px / 2s. (Earlier note:)
- **v35 — cyberpunk NPC pedestrians (standby + wandering).** Generated 6 characters via PixelLab
  `create_character` (n_directions=4 → south/east/north/west rotations, low top-down, size 64):
  gangster, hacker girl, trench-coat mercenary, spiked punk, umbrella woman, android bouncer (ids in
  git history; some needed a retry — "heavy load"). Sliced each rotation, trimmed → `npc{1-6}_{s,e,n,w}.png`
  (24 sprites). World.jsx: `npcStand` (14 idle loiterers at plaza/holo-pad/park/roundabouts, `.world-npc.idle`
  sway) and `npcWalk` (16 pedestrians streaming both ways along the avenues via `addWalk(A,B)` →
  `.world-npc-mover` animates `translate(--dx,--dy)` with opacity fade at the ends to hide the loop;
  inner `.world-npc.walk` does a footstep bob; sprite faces screen-L/R movement via e/w rotation).
  `.world-npc` sized to height 84px; walkers z=3000 (always visible), standby depth-sorted. Verified
  via headless: 14 standby + 16 walkers, movers animating, no errors.
- **v34 — BIG shops + blossom-weighted, denser trees.** Shop buildings enlarged to `DW*2.5` and
  reserve their lot + 4 neighbours (clear breathing room); billboards much bigger (`.world-shop-sign`
  font 15→30px, padding/border/stem up) and the sign sits at `y+TH - w*1.4` (scales with the bigger
  building) — readable even zoomed out. `TREE_KINDS` is now a WEIGHTED list (4× blossom_tree, 3×
  cyber_palm, 2× neon_tree, + others) so the mix skews colourful pink/teal; scatter density raised
  again (0.34→0.48 trees, benches/vending to ~0.54/0.56). Shops kept at the spaced central lots
  ([13,4] N / [4,13] W / [19,18] SE) — verified the big signs don't crowd.
- **v33 — bigger/denser/varied trees + shops moved to the central hub.** Added 3 new PixelLab tree
  designs (`cyber_palm` teal neon palm, `blossom_tree` pink cherry, `pine_tree` green conifer; ids
  c3c3316e / a1765d19 / 3a505888, transparent bg). `TREE_KINDS` now 7 kinds; `treeScale()` makes
  trees bigger (palm/pine 0.95·DW, others 0.82·DW, bush 0.55·DW) and scatter density raised
  (0.16→0.34 trees, benches/vending to ~0.40/0.425 on sidewalks); scattered trees also mark
  `occupied` so big canopies don't stack. Relocated SHOPS to ring the central plaza/park/hologram
  hub for easy access: STORE [13,4] (N of plaza), INVENTORY [4,13] (W of plaza), MARKETPLACE [19,18]
  (SE by the hub) — all verified buildable (not road, sidewalk-clear, off landmarks/roundabouts).
- **v32 — scattered trees + accessories + 3 labelled store-NPC buildings.** Added an `occupied` Set
  (every integer-tile building/prop marks it) so nothing overlaps. A deterministic scatter pass
  (seeded RNG) drops trees (`neon_tree`/`park_tree`/`muted_tree`/`bush`) at ~16% of eligible tiles
  and benches/`vending_machines` on sidewalk tiles (`nextToRoad`), where eligible = inside border &&
  not road/water/landmark (`!isRoadCell`) && not occupied → fills sidewalks + gaps between buildings.
  GAME SHOPS: `SHOPS` list = STORE (tech_shop, [4,9], green), INVENTORY (server_hall, [29,9], blue),
  MARKETPLACE (cyber_mall, [12,28], pink) — placed BEFORE the random block fill (they reserve their
  lot; `fillBlock` skips occupied), each carrying a `shop` field. Big neon BILLBOARDS (`shopSigns` →
  `.world-shop-sign`, per-shop `--sign` colour, z 6000+ so always visible) float above them with a
  stem. Clicking a shop building or its sign opens a `.world-shop-panel` modal (`shop` state) — a
  store-NPC stub ("items & trading coming soon"). Verified via headless click (panel opens, no errors).
- **v31 — removed the green from roundabout islands.** Roundabout centre islands are now plain
  PAVEMENT (removed the `inRaIsland → isn_park` grass branch in `tileFor` and its floor z-bump;
  the paved island shows through the ring's transparent hole at default z). Dropped the island
  neon-trees (greenery). Also recoloured the green hedges baked into `ra_monument.png` (the obelisk
  base) to stone-gray (~1.8k px) so no green remains under any statue (prev saved
  scripts/_holo/ra_monument_prev.png).
- **v30 — three roundabouts (different statues), S-bend removed.** Removed the S-bend (SBENDS=[] in
  buildRoads.py). Both buildRoads.py and World.jsx now use a `ROUNDABOUTS` list (centre col/row +
  per-ring out/in radius in the builder; `{c, statue}` in World.jsx — centres MUST match):
  (24.5,24.5) crystal obelisk `ra_monument`, (15.5,33.5) bronze hero `ra_statue2`, (33.5,33.5 r4.0)
  chrome sphere `ra_statue3` (smaller ring to clear the dock/water edge). buildRoads.py loops the
  ring draw / island carve / dashed-ring over the list; `inRoundabout`/`inRaIsland` in World.jsx
  test ALL roundabouts; statues + symmetric neon trees placed per roundabout (centred via fractional
  tile coords); all three statues get the neon-glow fx. New statues generated via PixelLab
  create_map_object (ids bc67706b, 0309b1eb), transparent bg, saved as ra_statue2/3.png.
- **v29 — road refinements: S-bend street, bigger roundabout, centred island, no lamps on road.**
  buildRoads.py now ALSO exports the exact per-tile road layout to
  `src/components/world/road_cells.json` (sampled from the final road mask); World.jsx imports it as
  `ROAD_CELLS` and drives `roadAt`/`isRoadCell` from it — one source of truth, so buildings never
  spawn on a curved/S-bend/ring road. Added an `SBENDS` list in the builder (thick sine polylines,
  `joint="curve"`) → a west-side S-bend avenue (col 3.5, amp 1.7, rows 2-38) with its own dashed
  centre line; add more entries to bend other streets. Roundabout enlarged (RA_OUT 3.6→4.5,
  RA_IN/island 1.7→2.2; World.jsx `RA_ISLAND_R=2.2`, `RA_R=6.0`). Monument now placed at the exact
  island centre `RA_CTR=[24.5,24.5]` (fractional tile — `place()`/`iso()` handle it) so the grass
  island is centred under it; island trees made symmetric. Removed the 4 roundabout ring lamps (they
  sat ON the arterials) and added a `place()` guard that drops any `street_lamp` landing on a
  `ROAD_CELLS` tile.
- **v28 — designed road network: curved/rounded intersections + a REAL merged roundabout.**
  Per user ("circle the road so the map will be designed … more road combinations … bended road",
  NOT a circle pasted on top). IMPORTANT FINDING: PixelLab's `create_tiles_pro` does **not** make
  isometric curve/transition tiles — every variant (iso 64px=16, iso 128px=6, flat=9, square
  top-down 64px=16) comes back as FULL-asphalt road surfaces with only dash decals (no
  pavement↔road curved edges); `create_map_object` "curve" returned a square block with a straight
  line. The only good PixelLab piece was a flat iso asphalt tile (`scripts/_rpieces/straight.png`).
  So curves are SHAPED to exactly match the existing dark road palette (asphalt `(32,32,40)`, curb
  `(150,156,166)`, dash `(240,200,48)`). New builder **`scripts/buildRoads.py`**: draws the road
  network flat on the tile grid (arterial cols/rows {6,7,15,16,24,25,33,34}, skipping plaza/park/
  holopad), rounds every intersection corner via Gaussian-blur+threshold on the road mask (→ curved
  corners across the whole map), carves a roundabout annulus at the SE crossing (centre tile
  [24.5,24.5], outer 3.6t / island 1.7t) with a dashed-circle ring centre-line, adds asphalt grain +
  curb (dilate−mask) + dashed centre lines, then iso-projects the flat image with an ImageMagick
  `-distort Affine` (flat tile-centres → scene), output 5380×2770 placed at left=80/top=328 (same as
  the old overlay). Re-run buildRoads.py to change the layout. The roundabout is now BAKED into
  `road_overlay.png` (removed the separate fake `roundabout.png` img + asset + buildRoundabout.py).
  JSX: roundabout grass island (`inRaIsland`) renders `isn_park` ABOVE the overlay (transparent
  island hole) and holds the cyber `ra_monument`; `inRoundabout` (RA_R 5.2) keeps buildings out.
- **v27 — roundabout (traffic circle) at the SE arterial crossing, road-uniform.** Added a circular
  ring road over the cols24/25 × rows24/25 crossing (centre tile [24.5,24.5], scene 2640,1928).
  Built by **`scripts/buildRoundabout.py`** as an iso ellipse donut (outer R=3.6t, inner/island
  R=1.7t ≈ 2-tile-wide ring) using the EXACT existing-road palette sampled from `road_overlay.png`
  — asphalt `(32,32,40)`, curb `(144,152,160)`, yellow dash `(240,200,48)` — so it's uniform with
  the regular roads (user: "uniform to the current road … use the regular road, don't implement a
  new"). The island hole is punched transparent so the centre grass shows through. Overlay
  `roundabout.png` placed at left=2340/top=1743 z520 (just above road_overlay z500); re-run the
  script if it moves. JSX: `RA_CTR/RA_R(5.2 no-build buffer)/RA_ISLAND_R(1.7)`; `inRoundabout`
  added to `isRoadCell` (no buildings under the ring) and `tileFor` (island → `isn_park` grass);
  island floor tiles get z=525+ to show through the ring; `place()` blocks the ring annulus but
  allows island props. Centre island has a glowing cyber **monument** (`ra_monument.png`, new
  PixelLab high top-down obelisk, id a630abbc, neon-glow fx) + neon trees + a ring of street lamps.
- **v26d — reference-style glowing podium + animated light beam + base-less head.** Per the user's
  reference (a circular sci-fi podium with a glowing blue rim emitting upward light rays), the holo
  is now THREE layers: (1) `holo_base.png` = a new PixelLab `create_map_object` (low top-down)
  circular segmented podium with glowing blue rim + centre emitter (id 24173ad1, trimmed to
  220×100); (2) `.world-holo-beam` = an ANIMATED light beam — a `clip-path` triangular cone
  (narrow at the emitter, wide at top) painted with a `conic-gradient` of bright ray bands +
  vertical falloff, `mix-blend-mode:screen`, rendered IN FRONT of the head (z+6) so the rays read
  over it, pulsing/flickering via `@keyframes holoBeam`; (3) `.world-holo` = the head, now
  REGENERATED WITHOUT A BASE — re-keyed all 7 frames from `scripts/_holo/keyed/`, cropped to head
  content (`180x181`), and erased the leftover dark pedestal wedges by multiplying the alpha by a
  corner mask (DON'T use `-channel A -fill black -draw polygon` — that paints OPAQUE black, not
  transparent; build a white/black mask + CopyOpacity instead). Sheet is now `1260x181` (7×180×181),
  scaled 2.4 via CSS var `--hf`, `holoTalk` uses `steps(7)` to `calc(--hf * -7)`. Head floats at
  `HOLO.y-72`, beam emitter at `HOLO.y-46`. Beam sized 320×360 (was 640 tall — shot up past the head
  to the buildings behind; lowered so the cone tops out around the head's crown). Raw podium in
  `scripts/_holo/podium_raw.png`, clean head frames in `scripts/_holo/head2/`.
- **v26c — fence moved from plaza to a clean diamond ring around the holo pad + bigger fountain.**
  Per user: removed the plaza fence entirely (plaza is now open) and put ONE continuous fence ring
  around the WHOLE hologram pad, with the hologram centred inside it. The pad bounds are now named
  constants `HP_X0/X1/Y0/Y1 = 8/14/15/23`; `PLAZA_CTR` is computed as the true pad centre →
  `[11,19]` (diamond centre = plinth base, verified equal at scene 2128,1320). The fence is a
  freshly-drawn iso diamond overlay `fence_overlay.png` built by **`scripts/buildHoloFence.py`**
  (double rail + cyan neon rail + evenly-spaced glowing posts, projected from the HP_* bounds) —
  placed at left=1576/top=998 z940. Re-run that script if the pad ever moves (it prints the new
  PLACE_LEFT/PLACE_TOP). Tried per-tile `fence_l`/`fence_r` sprites first but they left diagonal
  gaps (art narrower than the tile-edge pitch) → switched to the single drawn ring like the old
  overlay. Fountain enlarged to `DW*2.2` (~282px) and **centred on its tile**: `place()` gives the
  fountain `ay=y` (tile centre) not `y+TH`, and `.fountain-anim` uses `transform: translate(-50%,-50%)`
  so the basin sits dead-centre on the plaza tile. The 5-frame animation is driven by a CSS var
  `--fw` (scaled frame width, set inline = `o.w`): `background-size: calc(--fw*5) --fw`, step the
  position to `calc(--fw * -5)` with `steps(5)` → crisp stepping at any scale. (An earlier
  `background-size:500% 100%` + `position 0%→100%` version SLID instead of stepping — % background
  position doesn't land on frame boundaries; the px/var approach fixes it.)
- **v26b — holo pad relocated to the block directly S of the plaza + road properly removed.**
  Per the user's red marker, the pad is the block S of the fountain plaza MERGED with the arterial
  strip between them, so plaza + pad read as one open area ("connect the two blocks"). `HOLO_PAD`
  = cols 8-14 × rows 15-23, centre `PLAZA_CTR=[11,18]`. Key fix: the baked `road_overlay.png`
  (z500) was still painting the old road across the cleared pad, so HOLO_PAD floor tiles now
  render ABOVE it (`z = 550 + tx + ty`) — the `isn_plaza` pavement covers the baked road/junction.
  Also `place()` now early-returns for any tile in HOLO_PAD, so no street-lamp/building/prop lands
  on the pad. (Earlier v26 spots — top-back edge, up-left, then [9,23] SW — were all rejected.)
- **v26 — BIG talking hologram on a cleared pad (two-layer: steady plinth + glitch head).**
  Added a giant holographic talking head as a city landmark, on a cleared/merged open lot near
  the fountain plaza (the user's red-circled block). HOLO_PAD tiles render `isn_plaza` and are
  excluded from roads (`roadAt`) and building lots (`isRoadCell`/`safeLot`) so the block is one
  clean pad.
  Rendered as TWO layers so the base reads as solid while the face is a projection:
  · **Plinth** (`holo_base.png`, PixelLab `create_map_object` low top-down, sci-fi projector
    cylinder w/ glowing purple emitter) — `.world-holo-base`, fully OPAQUE, STEADY (no animation),
    width 220, anchored bottom-centre at the pad.
  · **Head** (`holo_head.png`, 1260×200 = 7×180×200, the keyed talking frames trimmed to head-only
    so there's no empty pedestal gap) — `.world-holo`, scale 2.4 (432×480), `opacity 0.6`,
    `hue-rotate(105deg)` → purple, `holoTalk` (7-frame steps) + `holoGlitch` (jitter/skew/opacity)
    animations. Anchored bottom at `HOLO.y-158` so the chin rests on the plinth emitter.
  Earlier mis-placements (top-back edge, then up-left of plaza) fixed by confirming the spot =
  lower-left of the fountain plaza. NOTE: `scripts/_shot.js` rewritten to size the viewport to the
  full 5500×3160 scene and wait for every `.world-scene img` to decode before shooting (the old
  fixed-viewport/early-shot script produced stale/half-loaded captures that masked placement bugs).
  Raw art in `scripts/_holo/` (frames/, keyed/, head/, pedestal_raw.png).
- **v25 — connected road overlay with HD detail (dark asphalt + curbs + grain).** User needs the
  road CONNECTED (per-tile HD tiles seam). PixelLab flat `square_topdown` textures came back fully
  transparent (compositing failed), so the overlay uses solid dark asphalt (#22222a) + per-pixel
  noise grain (HD feel) + light-gray sidewalk curb strips on outer edges + single dashed yellow
  centre, drawn on the flat grid then iso-projected (5378×2690, left=OX-2560/top=OY-32 z500).
  `tileFor` road cells → `isn_pave` under it. Connected + reads as a real road. NOTE: this is
  textured-drawn, not raw PixelLab pixels (pure-PixelLab tiles + seamless connection are at odds).
- **v24 — roads = HD generated TILES (per user: accept minor seams).** The v23 code-drawn overlay
  was flat/not real pixel art. Switched back to per-cell HD PixelLab road tiles (the v22 reference
  set: textured asphalt + gray stone sidewalks + dashed yellow centre + crosswalk intersection,
  `isn_wetroad`/_b/`wetcross`, fitted to the pave footprint). `tileFor` autotiles via `roadAt`
  neighbours; removed the road_overlay img from render. Minor sidewalk seams at tile edges are
  expected/accepted. (road_overlay.png kept, unused.)
- **v23 — roads back to single CONTINUOUS overlay (lanes connect).** Per-tile road tiles broke at
  every tile boundary (sidewalks/lanes not continuous). Reverted to the drawn `road_overlay.png`
  approach but SINGLE-LANE: one dashed yellow centre line per arterial + thin gray curbs, supersampled
  (SS=2) + iso-projected (bilinear), 5378×2690 placed at left=OX-2560/top=OY-32 z500. `tileFor` road
  cells → plain `isn_pave` under the overlay. Lanes now flow seamlessly tile-to-tile. (Reference road
  TILES from v22, tileset `f41cf39c`, kept but unused.)
- **v22 — reference-style road tiles + accurate drawn fence rings.**
  - Roads: generated HD tiles matching the user's reference (dark charcoal asphalt + light-gray
    stone sidewalk strips BOTH sides + dashed yellow centre), tileset `f41cf39c` idx0/1/2 → isn_wetroad
    / _b / wetcross, perspective-fit. Prev road tiles backed up `scripts/_refroad/prev/`.
  - Fence: the segment-object approach was inaccurate (floating, misaligned). Replaced with a single
    `fence_overlay.png` DRAWN in Python (iso-projected rectangular rings w/ posts + rails + cyan neon)
    around the plaza (8-14) and park (17-23/8-14); rendered at scene (2182,804) z 950. Removed
    `fenceEdge`/`fenceArea`. (To move/resize rings: edit `areas` in the fence Python + re-place.)
    The generated fence tilesets (8c4f293b, 35022f5c) are unused.
- **v21 — restored clean road-type tiles + fence only on plaza/park.** The weathered tiles read as
  cracked ground (park-ish), not roads → restored the clean HD asphalt+lane-line tiles from
  `scripts/_wroad/prev/` and perspective-fit them (isn_wetroad / _b / wetcross). Generated modern
  fence segment OBJECTS (transparent, two iso diagonals: `fence_l`/`fence_r`, via create_map_object).
  Removed per-building fences; added `fenceEdge`/`fenceArea` and ring ONLY the plaza (8-14) and park
  (17-23/8-14) along their front (SW+SE) pavement edges. (Weathered road tileset `e48741b6` kept,
  unused — could repurpose for a future ground/wasteland.)
- **v20 — roads back to TILES (weathered HD).** Removed the baked `road_overlay.png` image; roads
  are real tiles again. Generated a weathered HD road tileset (pro, tileset `e48741b6`): straight
  cracked asphalt w/ faded/worn yellow line (idx0) → `isn_wetroad`, its 90°-rotated copy →
  `isn_wetroad_b`, weathered 4-way intersection w/ peeling crosswalks (idx3) → `isn_wetcross`; all
  perspective-fit to the pave footprint. `tileFor` now returns road tiles via `roadAt` neighbour
  logic (ns&ew→cross, ew→wetroad_b, else wetroad). Old straight-overlay kept as road_overlay.png
  (unused). Old road tiles backed up `scripts/_wroad/prev/`.
- **v19 — purple bg + thick base slab + HD smooth roads.**
  - Background: black void → purple cyberpunk gradient (radial #3a2358→#0d0820 + linear overlay) in
    `.world-viewport`.
  - Thick edge: `scripts` Python builds `base_slab.png` (5392×2854) — the map's iso footprint extruded
    down 150px with shaded purple side walls + neon-purple top rim. Rendered first at zIndex -1,
    placed at scene (80,328). Gives the map a solid raised-platform depth.
  - HD roads: road overlay regenerated at SS=2 supersample with rectangle markings + BILINEAR
    downscale → smooth anti-aliased lane lines / crosswalks (still 5378×2690, tile00 @2560,32, so the
    World.jsx placement is unchanged).
- **v18 — smooth seamless pavement.** The gray `isn_pave` tiles DID tessellate (not a gap bug) but
  had strong panel-grid seams that made the ground look gridded. Regenerated as seamless smooth
  concrete (no panel lines, tileset `d3e36e1d` idx5), perspective-fit to the pave footprint →
  continuous gray surface. Old pave backed up `scripts/_pave/isn_pave_prev.png`.
- **v17 — water + dock/plaza tile tessellation fixed (same bug as park).** `isn_water` was a full-
  canvas diamond (128x116) → dark gaps between water tiles; perspective-fit it to the pave top-face
  footprint (corners 64,19 / 127,51 / 64,83 / 0,51) → now 128x65+0+22, tessellates. `isn_dock` and
  `isn_plaza` were 64px (upscaled 2× at DW=128, mismatched) → regenerated as HD 128px pro tiles
  (tileset `cd66b811`: dock-with-hazard-edge idx0 → isn_dock, plain concrete idx3 → isn_plaza) and
  perspective-fit to the same footprint. Old tiles backed up in `scripts/_dock/`, `scripts/_water_src`.
  RULE: any new ground tile from PixelLab fills the 128² canvas as a full diamond → must be
  perspective-fit to the pave top-face (`64,19 / 127,51 / 64,83 / 0,51`) to tessellate.
- **v16 — park tessellation (real fix) + edge clamp + new buildings + working streetlights.**
  - Park grass STILL gapped after the 13px shift because the grass diamond was a pure flat rhombus
    taller than the pave top-face (128x116 vs the pave's 128x89 top face). Real fix: perspective-fit
    the grass diamond's 4 corners onto the pave top-face footprint (top 64,19 / right 128,51 /
    bottom 64,83 / left 0,51) → `isn_park`/`isn_parkpath` now bbox ~128x68+0+17 and tessellate.
    Verified with a 3×3 lay test vs pave.
  - **Edge overhang fixed:** clamp BLOCKS inside `[EDGE, GW/GH-1-EDGE]`; `safeLot` also rejects the
    outermost ring so wide sprites never hang over the void.
  - **8 new pro buildings** (tower_neon, tower_bank, office_glass [tall]; club_neon, noodle_bar,
    capsule_hotel, market_hall, power_plant [short]) flood-filled + trimmed, added to TALL/SHORT +
    LABELS → more variety, fewer repeats (with the no-repeat bag from v15).
  - **Working streetlights:** every `street_lamp` also pushes a `lightPools` entry; rendered as a
    pulsing pink radial-gradient ellipse (`.world-lightpool`, screen blend, z 600) on the ground at
    the lamp base — visible light cast on the pavement.
- **v15 — park tiles fixed + pan/zoom + no duplicate buildings.**
  - Park grass tiles glitched (didn't tessellate): old park tiles had a 3D depth profile (content
    128x116, tall blades past the diamond). Regenerated as FLAT top-down tiles (tileset `5c634d8b`,
    idx0 grass + idx4 neon path), shifted up 13px → `isn_park`/`isn_parkpath` now tessellate.
  - **Pan/zoom UI:** viewport now `overflow:hidden`; `.world-scene` centred + `transform: translate
    -50% -50% + pan + scale`. Drag to pan, wheel to zoom, +/−/⟳ buttons (`.world-zoom-ui`, bottom
    right). Default zoom 0.5 fits the whole city. Click guarded by `movedRef` so panning doesn't fire
    a building click (capture vx/vy + nx/ny into locals to avoid a null-drag race that crashed React).
  - **No duplicate buildings:** `makeBag` (seeded Fisher–Yates) draws each TALL/SHORT building once
    before repeating, so neighbouring blocks don't show the same building. Replaced the modulo cycle.
- **v14 — doubled city + big park + HD bluish water.**
  - Grid GW/GH 28×24 → **44×40**, OX/OY=2640/360, scene canvas 5500×3160. Arterials now at
    cols/rows {6,7,15,16,24,25,33,34}; harbor moved to WATER_X0=39 (DOCK_X=38, bigger).
  - `BLOCKS` generated programmatically across the bands (start cols/rows {0,8,17,26,35}, inset 2 →
    sidewalk), skipping the plaza/park core and the water side; many more building blocks.
  - **Big PARK** landmark at cols 17-23 / rows 8-14 (`isn_park` grass + `isn_parkpath` neon cross
    walkway) with neon trees, a pond, benches, lamps. `isRoadCell` treats PARK as non-buildable.
  - **HD bluish water:** new pro water tile (vivid blue swirls, tile `af118a01`, idx0, shifted up 13px)
    → `isn_water`; old water backed up `scripts/_water/isn_water_prev.png`. Animated via CSS
    `.world-water` sway/shimmer (brightness+hue+translate). A real 5-frame PixelLab wave anim exists
    (object `b097a648`) but CSS sway is what's live (perf over ~100 harbor tiles).
  - Road overlay regenerated for the new grid (5378×2690), placed at left=OX-2560, top=OY-32.
  - Mega buildings already removed (v13.5 by request).
- **v13 — fixed buildings overhanging roads/plaza.** Buildings render ~1.4 tiles wide, so lots on a
  tile adjacent to a road/plaza spilled onto the street. Added `isRoadCell`/`safeLot` (a lot is built
  only if it + its 4 neighbours are non-road/plaza → guaranteed 1-tile sidewalk) and `fillBlock` skips
  unsafe lots. Redefined `BLOCKS` to sit inside the safe interior zones (cols 2-4/9-13/18-20, rows
  likewise) so no building touches the roads (cols/rows 6,7,15,16) or the plaza (8-14). Roads/plaza
  edges now clean; trade-off: slightly sparser. Mega scale also trimmed (DW*1.7).
- **v12 — fixed edges + mega buildings.** (1) Edge buildings had no pavement / hung over the void:
  insetting `BLOCKS` 1 tile from every map edge so the outermost buildings always have surrounding
  pavement. (2) Mega buildings (mega_mall/mega_hq, native 236×180) looked like big blurry PNGs
  because they were upscaled to DW*2.4≈307px → reduced to DW*1.7≈218px (near native) and surrounded
  with a filler tower+shop so they blend into the block instead of floating.
- **v11 — single seamless road overlay (no tile seams).** Per-tile diamond roads couldn't connect
  their lane lines (each 64px-step tile is separate → patchy/tilted look). Replaced with ONE big
  isometric road image: `scripts` Python draws the whole network on a flat GW×GH grid (continuous
  double-yellow centre lines, white lane dashes, crosswalk intersections), then iso-projects it via
  an affine transform matching `iso()`. Saved as `public/citymap/assets/road_overlay.png` (3330×1666)
  and rendered as one layer (zIndex 500) under buildings at `left=OX-1536, top=OY-32`. `tileFor` road
  cells now return plain `isn_pave` under the overlay. To regenerate the overlay, re-run the Python
  (keep ROAD cols/rows + TW/TH/GW/GH in sync with World.jsx).
- **v10 — fixed "tilted" roads.** The straight HD road tile's lanes run along ONE iso diagonal
  (NW-SE). The renderer was reusing it for the perpendicular road via horizontal flip — but flipping
  a diamond does NOT change which diagonal the lanes follow, so both road directions pointed the same
  way (looked tilted/incoherent). Fix: made `isn_wetroad_b` = the tile **rotated 90°** (lanes along
  the NE-SW axis) and `tileFor` now uses `isn_wetroad` for road columns and `isn_wetroad_b` for road
  rows (no flip). Roads now read as a proper iso grid.
- **v9 — waterfront v2 → HD + integer-snapped.** Root cause of the "bent/misaligned tiles":
  `fillBlock` and a few props used FRACTIONAL tile coords (e.g. `(c+0.5)*w/ncols-0.5`), so `iso()`
  anchored objects between diamonds. Fixed: all placements snap to integer tiles (3×3 evenly-spread
  lots, `Math.round`ed mega/billboard coords). Also bumped to HD scale TW=64/TH=32/DW=128/TILE_TOP=47
  (was 88px), OX/OY=1560/360. Water + dock + crane intact, now crisp.
- **v8 — reverted to dense WATERFRONT v2 (water + dock crane).** Restored from transcript
  `0bc37ab7` (line-900 World.jsx): big water region (cols ≥24) + dock/pier + `dock_crane` + `pipes`,
  8 building blocks (3×3 fill) + 2 mega buildings, central plaza/fountain, billboards, subway. Uses
  the older 88px scale (TW=44,TH=22,DW=88,OX=1080,OY=250) and `isn_pave` ground. The HD road tiles
  from v7 stay (scaled to DW=88). Previous dense-HD-road version saved as World.densehd.bak.jsx /
  world.densehd.bak.css.
- **v7 — HD wide roads + road setback.** Generated an HD isometric road tileset (pro, 128px, flat
  top-down): straight 2-lane road (double yellow centre + white lane dividers) → `isn_wetroad`, and a
  4-way intersection with white zebra crosswalks → `isn_wetcross` (both shifted up 13px to match flat
  `isn_*` registration). Crowded-fill now skips any lot tile adjacent to a road (`nextToRoad`) so the
  wide roads stay visible instead of being buried by buildings. Previous road tiles backed up in
  `scripts/_road_prev/`.
- **v6 — reverted to ISOMETRIC, densified.** Restored the iso layout (World.iso.bak) and added a
  CROWDED FILL pass in World.jsx: after the hand-placed landmark BUILDINGS, every free `.` lot tile
  on a 2-tile lattice (with a 1-tile breathing gap) gets a building, packing each block into a dense
  downtown. Roundabout/park/plaza/waterfront + lamps/stoplights kept. Top-down tile version saved at
  World.topdown.bak.jsx / world.topdown.bak.css (assets in public/citymap/td + sprites).
- **v5 — tile-based interactive city.** Replaced the static stitched image (v4) with a real tile
  grid + clickable animated building sprites. Road `square_topdown` tileset + 11 building sprites +
  fountain plaza + taxi from PixelLab. Autotiling, pan/zoom, neon/flicker/taxi/rain/scanline anim.
- v4 (prev) stitched top-down image map — backed up assets remain in `public/citymap/topdown/`.

## TODO / next polish
- [ ] More unique buildings so none repeat across blocks; add per-building neon sign variety.
- [ ] Add labels baked under buildings (district names) or floating tags.
- [ ] Corner/T road tiles for the perimeter (currently uses road_x for all junctions).
- [ ] Optional: real PixelLab multi-frame animations (animate_object) for the fountain / signs.

## Backups / reverting
- **Iso version:** `src/components/world/World.iso.bak.jsx` + `world.iso.bak.css`.
- **v4 stitched map:** `public/citymap/topdown/citymap.png` + `scripts/_map/`.
- Tiles: `public/citymap/td/`; building sprites: `public/citymap/sprites/`; raw: `scripts/_bldg_raw/`.
- Layout fully in `World.jsx` `MAP` / `BUILDINGS` — edit those to change the city.
