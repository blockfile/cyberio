from PIL import Image, ImageDraw
import math

TW, TH, OX, OY = 64, 32, 2640, 360
def iso(tx, ty): return (OX + (tx-ty)*TW, OY + (tx+ty)*TH)

# pad tile bounds (inclusive) — keep in sync with World.jsx HP_*
HP_X0, HP_X1, HP_Y0, HP_Y1 = 8, 14, 15, 23

# 4 outer diamond corners (scene coords)
N = (iso(HP_X0, HP_Y0)[0],            iso(HP_X0, HP_Y0)[1] - TH)   # top
E = (iso(HP_X1, HP_Y0)[0] + TW,       iso(HP_X1, HP_Y0)[1])        # right
S = (iso(HP_X1, HP_Y1)[0],            iso(HP_X1, HP_Y1)[1] + TH)   # bottom
W = (iso(HP_X0, HP_Y1)[0] - TW,       iso(HP_X0, HP_Y1)[1])        # left
corners = [N, E, S, W]

xs = [c[0] for c in corners]; ys = [c[1] for c in corners]
PAD = 40
minx, miny = min(xs)-PAD, min(ys)-PAD-26   # extra top room for post height
maxx, maxy = max(xs)+PAD, max(ys)+PAD
W_img, H_img = int(maxx-minx), int(maxy-miny)
def L(p): return (p[0]-minx, p[1]-miny)

img = Image.new("RGBA", (W_img, H_img), (0,0,0,0))
d = ImageDraw.Draw(img)

POST_H = 26               # fence post / rail height in px
RAIL = (150,170,190,255)  # cool gray rail
RAIL_HI = (210,225,235,255)
NEON = (90, 225, 255, 255) # cyan accent
DARK = (60, 72, 92, 255)

edges = [(N,E),(E,S),(S,W),(W,N)]
# draw each edge: bottom rail (on ground), top rail (raised POST_H), verticals (posts), neon mid
for a,b in edges:
    ax,ay = L(a); bx,by = L(b)
    # ground (bottom) rail — double line for thickness
    d.line([(ax,ay),(bx,by)], fill=DARK, width=3)
    d.line([(ax,ay-1),(bx,by-1)], fill=RAIL, width=2)
    # top rail (raised)
    d.line([(ax,ay-POST_H),(bx,by-POST_H)], fill=RAIL, width=2)
    d.line([(ax,ay-POST_H+1),(bx,by-POST_H+1)], fill=RAIL_HI, width=1)
    # cyan neon rail just under the top
    d.line([(ax,ay-POST_H+6),(bx,by-POST_H+6)], fill=NEON, width=2)
    # posts + pickets along the edge
    length = math.hypot(bx-ax, by-ay)
    n = max(2, int(round(length/14)))
    for i in range(n+1):
        t = i/n
        px, py = ax+(bx-ax)*t, ay+(by-ay)*t
        post = (i % 3 == 0)  # every 3rd is a thicker post
        if post:
            d.line([(px,py),(px,py-POST_H-3)], fill=RAIL_HI, width=3)
            d.line([(px,py-POST_H-3),(px,py-POST_H-1)], fill=NEON, width=3)  # glowing cap
        else:
            d.line([(px,py),(px,py-POST_H)], fill=(120,140,165,235), width=1)

img.save("public/citymap/assets/fence_overlay.png")
# emit the scene placement (top-left) for the JSX
print("PLACE_LEFT", int(minx))
print("PLACE_TOP", int(miny))
print("SIZE", W_img, H_img)
