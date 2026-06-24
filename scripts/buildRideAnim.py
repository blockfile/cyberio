# Polls the char1 riding-state animation, downloads frames, builds per-direction sheets
# ride1_{s,e,n,w}.png (N frames each), ground-aligned with a shared bbox (no jitter).
# Run: PL_TOKEN=<token> python scripts/buildRideAnim.py
import os, sys, re, subprocess, io, time, json
from PIL import Image

def _load_token():
    t = os.environ.get("PL_TOKEN", "")
    if t:
        return t
    # fall back to the configured PixelLab MCP entry in ~/.claude.json (in-process, not persisted)
    try:
        cfg = json.load(open(os.path.expanduser("~/.claude.json")))
        def find(o):
            if isinstance(o, dict):
                if isinstance(o.get("pixellab"), dict):
                    return o["pixellab"]
                for v in o.values():
                    r = find(v)
                    if r:
                        return r
            elif isinstance(o, list):
                for v in o:
                    r = find(v)
                    if r:
                        return r
        pl = find(cfg) or {}
        auth = (pl.get("headers") or {}).get("Authorization", "")
        return auth.replace("Bearer ", "").strip()
    except Exception:
        return ""

TOKEN = _load_token()
SID = "d8d01369-f1c1-4c13-895e-55aab9843995"   # char1 riding state
DMAP = {"south": "s", "east": "e", "north": "n", "west": "w"}
FW, FH = 76, 80   # match the static ride sprites' canvas

def get_text():
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "get_character", "arguments": {"character_id": SID, "include_preview": False}}})
    out = subprocess.run(["curl", "-s", "-X", "POST", "https://api.pixellab.ai/mcp",
        "-H", f"Authorization: Bearer {TOKEN}", "-H", "Content-Type: application/json",
        "-H", "Accept: application/json, text/event-stream", "-d", body],
        capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("data: "):
            try: return json.loads(line[6:])["result"]["content"][0]["text"]
            except Exception: pass
    return ""

def parse(txt):
    dirs = {}
    for dname, nf, urls in re.findall(r"\((south|north|east|west),\s*(\d+)f\)[^\n]*\n\s*frames:\s*([^\n]+)", txt):
        us = [u.strip() for u in urls.split(",") if u.strip().startswith("http")]
        if us: dirs[dname] = us
    return dirs

# 1. poll until all 4 directions have frames
dirs = {}
for attempt in range(180):
    dirs = parse(get_text())
    if len(dirs) >= 4 and all(len(v) for v in dirs.values()):
        print(f"READY: {[(d, len(dirs[d])) for d in dirs]}"); break
    print(f"poll {attempt}: ready={ {d: len(v) for d, v in dirs.items()} }", flush=True); time.sleep(20)
else:
    print("TIMEOUT waiting for animation"); sys.exit(1)

# 2. download frames
def dl(u): return Image.open(io.BytesIO(subprocess.run(["curl", "-s", u], capture_output=True).stdout)).convert("RGBA")
imgs = {DMAP[d]: [dl(u) for u in dirs[d]] for d in dirs}

# 3. shared bbox across ALL frames (no jitter)
bbox = None
for d in imgs:
    for im in imgs[d]:
        bb = im.getbbox()
        if not bb: continue
        bbox = bb if not bbox else (min(bbox[0], bb[0]), min(bbox[1], bb[1]), max(bbox[2], bb[2]), max(bbox[3], bb[3]))
cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
CW, CH = FW, FH                     # force the static canvas so char1 scale == char2/3
ox, oy = (CW - cw) // 2, CH - ch   # centre x, bottom-align (wheels on ground); clips slight overflow

# 4. build per-direction horizontal sheets
n = 0
for d in imgs:
    n = len(imgs[d])
    sheet = Image.new("RGBA", (CW * n, CH), (0, 0, 0, 0))
    for i, im in enumerate(imgs[d]):
        sheet.paste(im.crop(bbox), (i * CW + ox, oy))
    sheet.save(f"public/citymap/assets/ride1_{d}.png")
    print(f"ride1_{d}: {n} frames -> sheet {CW*n}x{CH}")
print(f"RESULT FRAMES={n} FRAMEW={CW} FRAMEH={CH}")
