# Rebuilds the connected road overlay: curved (rounded) intersections, S-bend streets, and
# a real merged roundabout — drawn flat on the tile grid then iso-projected.
# Also EXPORTS the per-tile road cells to src/components/world/road_cells.json so World.jsx
# uses the exact same road layout for building placement (one source of truth).
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, subprocess, json

GW, GH = 44, 40
S = 128
TW, TH, OX, OY = 64, 32, 2640, 360

ASPHALT = (32, 32, 40, 255)
CURB    = (150, 156, 166, 255)
DASH    = (240, 200, 48, 255)

ROAD_COLS = {6, 7, 15, 16, 24, 25, 33, 34}
ROAD_ROWS = {6, 7, 15, 16, 24, 25, 33, 34}
WATER_X0, DOCK_X = 39, 38
# roundabouts: (centre_col, centre_row, outer_radius, island_radius)  — keep in sync with World.jsx
ROUNDABOUTS = [
    (24.5, 24.5, 4.5, 2.2),    # centre   (obelisk)
    (15.5, 33.5, 4.5, 2.2),    # south    (hero statue)
    (33.5, 33.5, 4.0, 2.2),    # SE corner(sphere) — slightly smaller to clear the dock edge
]
RA_IN = 2.2

def blocked(tx, ty):
    if 8 <= tx <= 14 and 8 <= ty <= 14: return True      # plaza
    if 17 <= tx <= 23 and 8 <= ty <= 14: return True     # park
    if 8 <= tx <= 14 and 15 <= ty <= 23: return True     # holo pad
    return False

SBENDS = []   # (removed)

W, H = GW * S, GH * S
road = Image.new("L", (W, H), 0)
rd = ImageDraw.Draw(road)

def cell_is_road(tx, ty):
    if tx < 0 or ty < 0 or tx >= GW or ty >= GH: return False
    if tx >= WATER_X0 or tx == DOCK_X: return False
    if blocked(tx, ty): return False
    return tx in ROAD_COLS or ty in ROAD_ROWS

# 1) straight arterial corridors
for tx in range(GW):
    for ty in range(GH):
        if cell_is_road(tx, ty):
            rd.rectangle([tx*S, ty*S, (tx+1)*S-1, (ty+1)*S-1], fill=255)

# 2) S-bend streets (2-tile-wide smooth sine corridors)
for base, amp, turns, r0, r1 in SBENDS:
    pts = []
    for ty in range(r0*10, r1*10+1):
        t = ty/10.0
        tx = base + amp*math.sin((t-r0)/(r1-r0)*turns*math.pi)
        pts.append((tx*S+S/2, t*S+S/2))
    rd.line(pts, fill=255, width=int(1.9*S), joint="curve")

# 3) roundabouts: outer disc road + island hole for each
for rcx, rcy, rout, rin in ROUNDABOUTS:
    cx, cy = rcx*S, rcy*S
    rd.ellipse([cx-rout*S, cy-rout*S, cx+rout*S, cy+rout*S], fill=255)
    rd.ellipse([cx-rin*S,  cy-rin*S,  cx+rin*S,  cy+rin*S],  fill=0)

# 4) round intersection corners (blur+threshold) -> curves everywhere
road = road.filter(ImageFilter.GaussianBlur(S*0.18)).point(lambda p: 255 if p > 150 else 0)
# re-clear each island after smoothing
isl = Image.new("L", (W, H), 0); isld = ImageDraw.Draw(isl)
for rcx, rcy, rout, rin in ROUNDABOUTS:
    cx, cy = rcx*S, rcy*S
    isld.ellipse([cx-rin*S, cy-rin*S, cx+rin*S, cy+rin*S], fill=255)
road = ImageChops.subtract(road, isl)

# 5) RGBA overlay: asphalt + grain
import random; random.seed(7)
flat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
px = flat.load(); rm = road.load()
for y in range(H):
    for x in range(W):
        if rm[x, y] > 127:
            n = random.randint(-6, 6)
            px[x, y] = (ASPHALT[0]+n, ASPHALT[1]+n, ASPHALT[2]+n+2, 255)
flatd = ImageDraw.Draw(flat)

# 6) curb border
dil = road.filter(ImageFilter.MaxFilter(2*int(S*0.08)+1))
border = ImageChops.subtract(dil, road); bpx = border.load()
for y in range(H):
    for x in range(W):
        if bpx[x, y] > 100: px[x, y] = CURB

# 7) dashed centre lines for the straight arterials
def dash_line(p0, p1, seg=44, gap=34, w=6):
    x0, y0 = p0; x1, y1 = p1; L = math.hypot(x1-x0, y1-y0)
    if L == 0: return
    ux, uy = (x1-x0)/L, (y1-y0)/L; d = 0
    while d < L:
        flatd.line([(x0+ux*d, y0+uy*d), (x0+ux*min(d+seg, L), y0+uy*min(d+seg, L))], fill=DASH, width=w)
        d += seg+gap
for pair in [(6,7),(15,16),(24,25),(33,34)]:
    c = (pair[0]+pair[1]+1)/2 * S
    dash_line((c, 0), (c, H)); dash_line((0, c), (W, c))
# dashed centre line following each S-bend
for base, amp, turns, r0, r1 in SBENDS:
    pts = []
    for ty in range(r0*10, r1*10+1):
        t = ty/10.0; tx = base + amp*math.sin((t-r0)/(r1-r0)*turns*math.pi)
        pts.append((tx*S+S/2, t*S+S/2))
    for i in range(0, len(pts)-3, 6):
        flatd.line([pts[i], pts[i+3]], fill=DASH, width=6)

# 8) dashed circle on each roundabout ring centre-line
for rcx, rcy, rout, rin in ROUNDABOUTS:
    cx, cy = rcx*S, rcy*S; ring_r = (rout + rin) / 2 * S; steps = 110
    for k in range(steps):
        if k % 2: continue
        a0 = 2*math.pi*k/steps; a1 = 2*math.pi*(k+0.9)/steps
        flatd.line([(cx+ring_r*math.cos(a0), cy+ring_r*math.sin(a0)),
                    (cx+ring_r*math.cos(a1), cy+ring_r*math.sin(a1))], fill=DASH, width=6)

# erase dashes off-road
dpx = flat.load()
for y in range(H):
    for x in range(W):
        r,g,b,a = dpx[x,y]
        if (r,g,b) == DASH[:3] and rm[x,y] < 127: dpx[x,y] = (0,0,0,0)

flat.save("scripts/_road_flat.png")

# 9) iso-project to scene
ox_place, oy_place = OX-2560, OY-32
def dstp(tx, ty): return (OX+(tx-ty)*TW-ox_place, OY+(tx+ty)*TH-oy_place)
def srcp(tx, ty): return (tx*S+S/2, ty*S+S/2)
(s0x,s0y),(s1x,s1y),(s2x,s2y) = srcp(0,0), srcp(1,0), srcp(0,1)
(d0x,d0y),(d1x,d1y),(d2x,d2y) = dstp(0,0), dstp(1,0), dstp(0,1)
VW, VH = 5380, 2770
affine = f"{s0x},{s0y} {d0x},{d0y}  {s1x},{s1y} {d1x},{d1y}  {s2x},{s2y} {d2x},{d2y}"
subprocess.run(["magick", "scripts/_road_flat.png", "-virtual-pixel", "none",
    "-define", f"distort:viewport={VW}x{VH}+0+0", "-distort", "Affine", affine,
    "public/citymap/assets/road_overlay.png"], check=True)

# 10) export per-tile road cells (sample tile centres of the final road mask)
cells = []
for tx in range(GW):
    for ty in range(GH):
        cxp, cyp = tx*S+S//2, ty*S+S//2
        if rm[cxp, cyp] > 127:
            cells.append(f"{tx},{ty}")
json.dump(cells, open("src/components/world/road_cells.json", "w"))

print("OVERLAY public/citymap/assets/road_overlay.png  PLACE", ox_place, oy_place, "SIZE", VW, VH)
print("ROAD_CELLS", len(cells))
