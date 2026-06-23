# Downloads a character's 'walking' frames (4 dirs x 6) and builds per-direction sheets
# npc{N}_walk_{s,e,n,w}.png. All frames cropped to ONE shared bbox so the cycle stays aligned.
# Usage: python scripts/buildNpcWalk.py N CHARID  [N CHARID ...]
import sys, re, subprocess, io, urllib.request
from PIL import Image

TOKEN = "7b297c30-d0b3-4c51-8a7c-63468ccd5880"
DSHORT = {"south": "s", "east": "e", "north": "n", "west": "w"}

def get_text(cid):
    body = ('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_character",'
            '"arguments":{"character_id":"%s","include_preview":false}}}' % cid)
    out = subprocess.run(["curl", "-s", "-X", "POST", "https://api.pixellab.ai/mcp",
        "-H", f"Authorization: Bearer {TOKEN}", "-H", "Content-Type: application/json",
        "-H", "Accept: application/json, text/event-stream", "-d", body],
        capture_output=True, text=True).stdout
    import json
    for line in out.splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])["result"]["content"][0]["text"]
            except Exception:
                pass
    return ""

def dl(url):
    data = subprocess.run(["curl", "-s", url], capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert("RGBA")

def build(n, cid):
    txt = get_text(cid)
    blocks = re.findall(r"walking \((\w+), \d+f\)[^\n]*\n\s*frames:\s*([^\n]+)", txt)
    if not blocks:
        print(f"npc{n}: no walking frames found"); return
    dirs = {}
    for dname, urls in blocks:
        dirs[DSHORT.get(dname, dname)] = [u.strip() for u in urls.split(",") if u.strip().startswith("http")]
    # download all
    imgs = {d: [dl(u) for u in us] for d, us in dirs.items()}
    # shared bbox across ALL frames/dirs
    bbox = None
    for d in imgs:
        for im in imgs[d]:
            bb = im.getbbox()
            if bb is None: continue
            bbox = bb if bbox is None else (min(bbox[0], bb[0]), min(bbox[1], bb[1]),
                                            max(bbox[2], bb[2]), max(bbox[3], bb[3]))
    fw, fh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # standard frame canvas shared by ALL characters so one CSS frame size fits everyone
    FW, FH = 46, 80
    ox = (FW - fw) // 2
    oy = FH - fh                       # bottom-align (feet on the ground)
    for d in imgs:
        sheet = Image.new("RGBA", (FW * len(imgs[d]), FH), (0, 0, 0, 0))
        for i, im in enumerate(imgs[d]):
            sheet.paste(im.crop(bbox), (i * FW + ox, oy))
        sheet.save(f"public/citymap/assets/{PREFIX}{n}_walk_{d}.png")
    print(f"{PREFIX}{n}: built {list(imgs)} content={fw}x{fh} -> frame {FW}x{FH}")

args = sys.argv[1:]
PREFIX = "npc"
if args and not args[0].isdigit():   # optional output prefix, e.g. "player"
    PREFIX = args.pop(0)
for i in range(0, len(args), 2):
    build(args[i], args[i + 1])
