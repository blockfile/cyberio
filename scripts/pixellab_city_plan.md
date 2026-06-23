# PixelLab → Cyber City regeneration plan

Goal: regenerate the assets behind the reference cyberpunk city map using the
PixelLab MCP server, then compose them with the EXISTING pipeline
(`scripts/createCyberCityExactMap.js` → `public/citymap/map.json`).

## Target grid (from cyber_city_designed_map.json)
- tile_size: **32px**
- grid: **48 × 32 tiles** = 1536 × 1024 px
- layers (z): water 0, ground 1, roads 2, buildings 3, props 4, npcs_vehicles 5, effects_labels 6

## How PixelLab maps to this
PixelLab does NOT make the whole map in one shot. It makes (a) tileable terrain
via `create_topdown_tileset`, and (b) individual sprites via its image-generation
tool (exact name confirmed from live `/mcp` tool list after restart — likely a
pixflux/bitforge generate + rotate/animate). So this is a batch pipeline.

Shared style string for every prompt:
> "cyberpunk pixel art, top-down view, neon accents (cyan/magenta/yellow),
> dark teal background #0D0F17, clean pixel edges, limited palette"

---

### BATCH 1 — Ground & road tilesets  (`create_topdown_tileset`, 32px)
1. sidewalk/pavement — gray concrete slabs, subtle grid lines  (base ground)
2. asphalt road + yellow dashed lane markings  (transition: pavement ↔ road)
3. lawn/grass with trimmed hedge border  (the green planted blocks)
4. canal water  (transition: ground ↔ water, for the outer moat)

### BATCH 2 — Buildings  (top-down building sprites, ~128×128 = 4×4 tiles)
From the reference, generate one sprite each:
apartment_block_A, apartment_block_B, weapon_market(GUNS/AMMO), cyber_mall(+helipad H),
data_tower(DATA COAP CORP), clinic, police_station, central_plaza_pavilion,
arcade_row(ARCADE/GAME ZONE), hospital(H), taxi_hub, ramen_row(RAMEN/TACOS/BURGER),
night_market_stalls, cyber_cafe, tech_shop(ROBOTICS), street_market, hotel,
server_hall(24/7), subway_hub(M), plus 2–3 generic mid-block towers.

### BATCH 3 — Props / objects  (32–64px sprites)
neon_billboard, holo_sign, fountain (animated), tree, hedge_corner, market_awning,
street_lamp, traffic_light, vending_machine, drone, taxi/car, subway_entrance(M).

### BATCH 4 — Compose & iterate
1. Save generated PNGs under `public/citymap/assets/` (or new sprite sheets).
2. Point `assetsheets`/`refs` in createCyberCityExactMap.js at the new assets,
   OR place sprites directly into the layout JSON at their grid coords.
3. Run the composer, render, diff against the reference screenshot, refine prompts.

---

## To run this (the ONLY blocker right now)
The PixelLab MCP server is registered correctly in ~/.claude.json (project scope)
but is NOT connected in the current session (MCP connects at startup only).

Restart so it connects, ideally keeping this conversation:
    claude --continue        # relaunch + reconnect MCP + keep this chat
Then: `/mcp` to confirm `pixellab` = connected, and say "start Batch 1".
