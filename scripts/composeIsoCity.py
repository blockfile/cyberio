#!/usr/bin/env python3
"""Dense waterfront cyber-city v2 — centred blocks, megabuildings, piers, rooftop ads.
Mirrors src/components/world/World.jsx — keep LAYOUT tables/logic in sync."""
import subprocess, os

ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "citymap", "assets")).replace("\\", "/")
OUT = ASSETS + "/_city_iso.png"
TW, TH, DW, TILE_TOP = 44, 22, 88, 32
OX, OY = 1120, 90
GW, GH = 28, 24

T_PAVE, T_ROAD, T_CROSS, T_WATER, T_DOCK, T_PLAZA = "isn_pave","isn_wetroad","isn_wetcross","isn_water","isn_dock","isn_plaza"
ROAD_COLS, ROAD_ROWS = {6,7,15,16}, {6,7,15,16}
WATER_X0, DOCK_X = 24, 23
PIER = {(24,10),(25,10),(24,11),(25,11),(26,11)}   # dock pier tiles jutting into water

TALL = ["tower_future","tower_hotel","tower_cyber","tower_beats","tower_office_a","tower_office_b",
        "data_tower","tower_apt","tower_indus","tower_spiral","tower_screen","tower_red",
        "tower_green","tower_pagoda","tower_antenna"]
SHORT = ["cyber_mall","hospital","hotel","arcade","police","clinic","ramen_court","night_market",
         "cyber_cafe","server_hall","tech_shop","weapon_market","apartment_a","apartment_b","subway_hub","taxi_hub"]

# (x0,y0,x1,y1, mega_name_or_None)
BLOCKS = [
    (0,0,5,5,None), (8,0,14,5,"landmark_a"), (17,0,22,5,None),
    (0,8,5,14,None), (17,8,22,14,None),
    (0,17,5,23,None), (8,17,14,23,None), (17,17,22,23,"landmark_b"),
]
PLAZA = {(tx,ty) for tx in range(8,15) for ty in range(8,15)}
PLAZA_C = (11, 11)

def P(n): return f"{ASSETS}/{n}.png"
DIM = {}
def dim(n):
    if n not in DIM:
        w,h = subprocess.check_output(["magick","identify","-format","%w %h",P(n)]).decode().split(); DIM[n]=(int(w),int(h))
    return DIM[n]
def iso(tx,ty): return OX + (tx-ty)*TW, OY + (tx+ty)*TH

def tile_for(tx,ty):
    if (tx,ty) in PIER: return (T_DOCK, False)
    if tx >= WATER_X0: return (T_WATER, False)
    if tx == DOCK_X: return (T_DOCK, False)
    if (tx,ty) in PLAZA: return (T_PLAZA, False)
    rc, rr = tx in ROAD_COLS, ty in ROAD_ROWS
    if rc and rr: return (T_CROSS, False)
    if rc: return (T_ROAD, False)
    if rr: return (T_ROAD, True)
    return (T_PAVE, False)

floor, objs = [], []
for tx in range(GW):
    for ty in range(GH):
        name, flip = tile_for(tx,ty)
        sx, sy = iso(tx,ty)
        frag = ["(", P(name)]
        if flip: frag += ["-flop"]
        frag += ["-filter","point","-resize", f"{DW}x{DW}", ")", "-geometry", f"+{int(sx-DW/2)}+{int(sy-TILE_TOP)}", "-composite"]
        floor.append((tx+ty, frag))

def place(name, tx, ty, target_w, kind=2, dy=0):
    w,h = dim(name); s = target_w/w; dw,dh = int(w*s), int(h*s)
    sx, sy = iso(tx,ty)
    objs.append((tx+ty, kind, ["(", P(name), "-filter","point","-resize", f"{dw}x{dh}", ")",
                 "-geometry", f"+{int(sx-dw/2)}+{int(sy+TH-dh+dy)}", "-composite"]))

def fill_block(x0,y0,x1,y1, seed):
    w, h = x1-x0+1, y1-y0+1
    ncols, nrows = 3, 3
    for r in range(nrows):
        cy = y0 + (r+0.5)*h/nrows - 0.5
        for c in range(ncols):
            cx = x0 + (c+0.5)*w/ncols - 0.5
            idx = seed + r*ncols + c
            if r == 0: place(TALL[idx % len(TALL)], cx, cy, int(DW*1.45))   # tall skyline at back
            else:      place(SHORT[idx % len(SHORT)], cx, cy, int(DW*1.5))

seed = 0
for (x0,y0,x1,y1,mega) in BLOCKS:
    if mega:
        cx, cy = (x0+x1)/2.0, (y0+y1)/2.0
        # short buildings around the base so the block isn't bare, landmark drawn last (front)
        for k,(ox,oy) in enumerate([(x0+1,y0+1),(x1-1,y0+1),(x0+1,y1-1),(x1-1,y1-1)]):
            place(SHORT[(ox+oy+k) % len(SHORT)], ox, oy, int(DW*1.15))
        place(mega, cx, cy, int(DW*1.85))
    else:
        fill_block(x0,y0,x1,y1, seed); seed += 5
    # streetlights on two sidewalk corners (NOT on roads)
    place("street_lamp", x0, y0, int(DW*0.4), kind=3)
    place("street_lamp", x1, y1, int(DW*0.4), kind=3)

# central plaza (fountain dead centre)
place("fountain", PLAZA_C[0], PLAZA_C[1], int(DW*1.05), kind=3)
place("stairs", 11, 13, int(DW*0.8), kind=3); place("stairs", 12, 9, int(DW*0.8), kind=3)
place("bench", 9, 9, int(DW*0.5), kind=3); place("bench", 13, 13, int(DW*0.5), kind=3)
place("muted_tree", 9, 13, int(DW*0.5), kind=1); place("muted_tree", 13, 9, int(DW*0.5), kind=1)

# rooftop billboards anchored on the megabuildings' roofs
place("billboard_ad", 11, 2.5, int(DW*0.75), kind=3, dy=-int(DW*1.6))      # mega_mall roof
place("billboard_face", 19.5, 20, int(DW*0.95), kind=3, dy=-int(DW*1.45))  # mega_hq roof

# waterfront / industrial on the pier
place("dock_crane", 24, 10, int(DW*1.0), kind=2)
place("pipes", 22, 12, int(DW*1.05), kind=2)
place("billboard_face", 22, 20, int(DW*1.25), kind=2)

# roadside props
place("hologram_sign", 7, 11, int(DW*0.7), kind=3)
place("flying_taxi", 11, 6, int(DW*0.7), kind=3)
place("subway_entrance", 3, 23, int(DW*0.8), kind=3)

# extra streetlights mid-avenue but on the lane edge tile (sidewalk side)
for t in (2, 11, 20):
    place("street_lamp", 5, t, int(DW*0.38), kind=3)   # left sidewalk of vertical road
    place("street_lamp", 17, t, int(DW*0.38), kind=3)  # right sidewalk

floor.sort(key=lambda e: e[0]); objs.sort(key=lambda e: (e[0], e[1]))
tokens = ["-size","3500x2500","xc:rgb(8,9,16)"]
for _, f in floor: tokens += f
for _, _, f in objs: tokens += f
tokens += ["-trim","+repage","-bordercolor","rgb(8,9,16)","-border","70","-write",OUT]
sp = ASSETS + "/_city_script.txt"; open(sp,"w").write("\n".join(tokens)+"\n")
print("compositing", len(floor), "floor +", len(objs), "objects")
subprocess.run(["magick","-script",sp], check=True)
print("done ->", OUT)
