#!/usr/bin/env python3
"""Dense top-down cyber-city preview (mirrors World2D.jsx).
Hedge-bordered district blocks packed with buildings, 2-wide roads between,
central plaza. Verifies look before porting to React."""
import subprocess, os
A = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "w2d")).replace("\\", "/")
OUT = A + "/_preview.png"
CELL, W, H = 44, 32, 26

def field(d): return [[d]*(H+1) for _ in range(W+1)]
def rect(f, x0, y0, x1, y1, v):
    for x in range(max(0,x0), min(W,x1)+1):
        for y in range(max(0,y0), min(H,y1)+1): f[x][y]=v
def code(f, cx, cy):
    return (1 if f[cx][cy] else 0)|(2 if f[cx+1][cy] else 0)|(4 if f[cx+1][cy+1] else 0)|(8 if f[cx][cy+1] else 0)

# blocks: (bc,br) -> building name | "PLAZA" | "PARK"
BLOCKS = {
 (0,0):"td_apartment",(1,0):"td_arcade",(2,0):"td_cyber_mall",(3,0):"td_data_tower",(4,0):"td_hospital",
 (0,1):"td_police",(1,1):"PARK",(2,1):"PLAZA",(3,1):"PARK",(4,1):"td_server_hall",
 (0,2):"td_cyber_cafe",(1,2):"td_ramen",(2,2):"PARK",(3,2):"td_night_market",(4,2):"td_hotel",
 (0,3):"PARK",(1,3):"td_subway",(2,3):"PARK",(3,3):"PARK",(4,3):"PARK",
}
def blk(bc,br): return bc*6+2, br*6+2          # x0,y0 (4x4 cells)

ground = field(1)
for R in (0,6,12,18,24,30): rect(ground, R,0,R+2,H,0)   # vertical roads (2-wide)
for R in (0,6,12,18,24):    rect(ground, 0,R,W,R+2,0)   # horizontal roads
grass = field(0)
trees = []
for (bc,br),what in BLOCKS.items():
    x0,y0 = blk(bc,br)
    if what == "PLAZA":
        continue                                         # open pavement plaza
    if what == "PARK":
        rect(grass, x0,y0, x0+4,y0+4, 1)                 # full grass park
        for (tx,ty) in [(x0+1,y0+1),(x0+3,y0+1),(x0+1,y0+3),(x0+3,y0+3),(x0+2,y0+2)]:
            trees.append((tx,ty))
    else:
        rect(grass, x0,y0, x0+4,y0+4, 1)                 # hedge ring...
        rect(grass, x0+1,y0+1, x0+3,y0+3, 0)             # ...with pavement courtyard
        trees.append((x0,y0)); trees.append((x0+3,y0+3))

def P(n): return f"{A}/{n}.png"
def dim(n):
    w,h=subprocess.check_output(["magick","identify","-format","%w %h",P(n)]).decode().split(); return int(w),int(h)
tok=["-size",f"{W*CELL}x{H*CELL}","xc:rgb(20,24,34)"]
def tile(name,cx,cy): return ["(",P(name),"-filter","point","-resize",f"{CELL}x{CELL}",")","-geometry",f"+{cx*CELL}+{cy*CELL}","-composite"]
for cy in range(H):
    for cx in range(W):
        tok += tile(f"ts_road_{code(ground,cx,cy)}",cx,cy)
        gc=code(grass,cx,cy)
        if gc!=0: tok += tile(f"ts_grass_{gc}",cx,cy)

# objects (buildings, fountain, trees) sorted by row for painter order
objs=[]
for (bc,br),what in BLOCKS.items():
    x0,y0=blk(bc,br)
    if what=="PLAZA": objs.append(("td_fountain", x0+2, y0+2, 92))
    elif what!="PARK": objs.append((what, x0+2, y0+2, 116))
for (tx,ty) in trees: objs.append(("td_tree", tx, ty, 46))
for name,cx,cy,w in sorted(objs, key=lambda o:o[2]):
    nw,nh=dim(name); dh=int(w*nh/nw)
    x=cx*CELL+CELL//2-w//2; y=cy*CELL+CELL-dh
    tok += ["(",P(name),"-filter","point","-resize",f"{w}x{dh}",")","-geometry",f"+{x}+{y}","-composite"]
tok += ["-write",OUT]
sp=A+"/_w2d_script.txt"; open(sp,"w").write("\n".join(tok)+"\n")
subprocess.run(["magick","-script",sp],check=True)
print("done ->",OUT)
