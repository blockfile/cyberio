# Assemble player walk + ride sheets from the regenerated PixelLab characters (charstate.json).
# No generations spent — pure download + compose. Re-runnable. Token from ~/.claude.json or PL_TOKEN.
# walk -> public/citymap/assets/player{n}_walk_{dir}.png  (6 frames, FWxFH)
# ride -> public/citymap/assets/ride{n}_{dir}.png         (4 frames, RWxRH)
import json, os, subprocess, re, io, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
STATE = os.path.join(ROOT, "charstate.json")
OUT = os.path.join(ROOT, "public", "citymap", "assets")
DMAP = {"south": "s", "east": "e", "north": "n", "west": "w"}
WALK_FW, WALK_FH = 46, 80     # match existing player{n}_walk frame size (no CSS change)
RIDE_FW, RIDE_FH = 76, 80     # match existing ride{n} frame size
WALK_FRAMES = 6               # CSS walkCycle is steps(6); v3 returns 7 (extra loop-close frame) → trim
RIDE_FRAMES = 4               # CSS rideCycle is steps(4); v3 returns 5 → trim

cfg = json.load(open(os.path.expanduser("~/.claude.json")))
def find_pl(o):
    if isinstance(o, dict):
        if isinstance(o.get("pixellab"), dict): return o["pixellab"]
        for v in o.values():
            r = find_pl(v)
            if r: return r
    elif isinstance(o, list):
        for v in o:
            r = find_pl(v)
            if r: return r
pl = find_pl(cfg); AUTH = os.environ.get("PL_TOKEN") and ("Bearer " + os.environ["PL_TOKEN"]) or pl["headers"]["Authorization"]
URL = pl.get("url", "https://api.pixellab.ai/mcp")

def get_text(cid):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "get_character", "arguments": {"character_id": cid, "include_preview": False}}})
    out = subprocess.run(["curl", "-s", "-X", "POST", URL, "-H", f"Authorization: {AUTH}",
        "-H", "Content-Type: application/json", "-H", "Accept: application/json, text/event-stream", "-d", body],
        capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("data: "):
            try: return json.loads(line[6:])["result"]["content"][0]["text"]
            except Exception: pass
    return ""

def parse_anim(txt, want):
    """return {dir_letter: [urls]} for the animation whose name contains `want`."""
    dirs = {}
    # match: <animname> (<dir>, <n>f) ... \n  frames: <urls>
    for m in re.finditer(r"([A-Za-z][\w\- ]*?)\s*\((south|north|east|west),\s*\d+f\)[^\n]*\n\s*frames:\s*([^\n]+)", txt):
        name, dname, urls = m.group(1).strip().lower(), m.group(2), m.group(3)
        if want not in name: continue
        us = [u for u in re.split(r"[,\s]+", urls) if u.startswith("http")]
        if us: dirs[DMAP[dname]] = us
    return dirs

def dl(u):
    return Image.open(io.BytesIO(subprocess.run(["curl", "-sL", u], capture_output=True).stdout)).convert("RGBA")

def shared_bbox(frames):
    bb = None
    for im in frames:
        b = im.getbbox()
        if not b: continue
        bb = b if not bb else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    return bb

def build(urls_by_dir, fw, fh, name_fmt, n, cap):
    # download every frame first (parse_anim returns URLs); trim to the CSS-expected count
    frames_by_dir = {d: [dl(u) for u in urls_by_dir[d][:cap]] for d in urls_by_dir}
    # collect all frames to compute one shared bbox per character (no jitter, consistent scale)
    allf = [im for d in frames_by_dir for im in frames_by_dir[d]]
    if not allf:
        print(f"  no frames for char{n} {name_fmt}"); return 0
    bb = shared_bbox(allf)
    cw, ch = bb[2] - bb[0], bb[3] - bb[1]
    scale = min(fw / cw, fh / ch, 1.0) if cw and ch else 1.0   # fit inside frame, never upscale past native
    sw, sh = max(1, int(cw * scale)), max(1, int(ch * scale))
    ox, oy = (fw - sw) // 2, fh - sh                            # center x, bottom-anchor (feet on ground)
    nframes = 0
    for d, frames in frames_by_dir.items():
        nframes = len(frames)
        sheet = Image.new("RGBA", (fw * nframes, fh), (0, 0, 0, 0))
        for i, im in enumerate(frames):
            cropped = im.crop(bb).resize((sw, sh), Image.NEAREST)
            sheet.paste(cropped, (i * fw + ox, oy), cropped)
        path = os.path.join(OUT, name_fmt.format(n=n, d=d))
        sheet.save(path)
        print(f"  {os.path.basename(path)}: {nframes}f -> {sheet.width}x{sheet.height}")
    return nframes

state = json.load(open(STATE))
only = sys.argv[1] if len(sys.argv) > 1 else None   # optional: build just one char number
for n, st in state.items():
    if only and n != only: continue
    print(f"=== char{n} ===")
    base, ride = st.get("base"), st.get("ride")
    if base:
        w = parse_anim(get_text(base), "walk")
        if w: build(w, WALK_FW, WALK_FH, "player{n}_walk_{d}.png", n, WALK_FRAMES)
        else: print(f"  char{n}: no walk animation found")
    if ride:
        r = parse_anim(get_text(ride), "ride")
        if r: build(r, RIDE_FW, RIDE_FH, "ride{n}_{d}.png", n, RIDE_FRAMES)
        else: print(f"  char{n}: no ride animation found")
print("ASSEMBLY DONE")
