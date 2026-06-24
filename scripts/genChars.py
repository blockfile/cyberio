# Regenerate all 3 player characters via PixelLab: pro base + v3 walk + ride-state + v3 ride.
# Writes UUIDs/state to scratchpad charstate.json so buildCharSheets.py can assemble (no re-spend).
# Token loaded from ~/.claude.json pixellab MCP entry (or PL_TOKEN env).
import json, os, subprocess, re, time, sys

STATE = os.path.join(os.path.dirname(__file__), "..", "charstate.json")
RIDE_EDIT = ("sitting on and riding a sleek black cyberpunk sport motorcycle with glowing cyan wheels, "
             "leaning forward gripping the handlebars, legs astride the bike")
RIDE_ACTION = "sitting on a motorcycle leaning forward gripping the handlebars"
DIRS = ["south", "east", "north", "west"]

CHARS = {
    "1": {"desc": "cyberpunk samurai warrior, dark green and black armor, long white hair",
          "base": "31ecd506-9a53-487f-ae60-b03241907573"},  # already pro-created
    "2": {"desc": "cyberpunk soldier in dark purple armored suit with a closed visor helmet", "base": None},
    "3": {"desc": "cyberpunk rebel teen, spiky blue hair, red and black tech jacket", "base": None},
}

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

def call(name, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}})
    out = subprocess.run(["curl", "-s", "-X", "POST", URL, "-H", f"Authorization: {AUTH}",
        "-H", "Content-Type: application/json", "-H", "Accept: application/json, text/event-stream", "-d", body],
        capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("data: "):
            try: return json.loads(line[6:])["result"]["content"][0]["text"]
            except Exception: pass
    return ""

def uuid_in(t):
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", t or "")
    return m.group(0) if m else None

def status_of(cid):
    t = call("get_character", {"character_id": cid, "include_preview": False})
    st = next((l.split("status:")[1].strip() for l in t.splitlines() if l.strip().startswith("status:")), "?")
    return st, t

def wait(cid, label, tries=60, gap=15):
    for i in range(tries):
        st, t = status_of(cid)
        print(f"  [{label}] poll {i}: {st[:40]}", flush=True)
        if st.startswith("completed"): return t
        time.sleep(gap)
    print(f"  [{label}] TIMEOUT", flush=True); return None

state = {}
if os.path.exists(STATE):
    try: state = json.load(open(STATE))
    except Exception: state = {}

for n, c in CHARS.items():
    st = state.get(n, {})
    # 1) pro base
    base = c["base"] or st.get("base")
    if not base:
        print(f"char{n}: creating pro base…", flush=True)
        r = call("create_character", {"description": c["desc"], "name": f"char{n} pro",
                                      "mode": "pro", "size": 64, "view": "low top-down"})
        base = uuid_in(r); print(f"char{n} base = {base}", flush=True)
    if base:
        wait(base, f"char{n} base")
    st["base"] = base
    # 2) v3 walk (4 dirs, 6 frames)
    if base and not st.get("walk_done"):
        print(f"char{n}: animating walk (v3)…", flush=True)
        call("animate_character", {"character_id": base, "action_description": "walking",
             "animation_name": "walk", "directions": DIRS, "mode": "v3", "frame_count": 6})
        wait(base, f"char{n} walk")
        st["walk_done"] = True
    # 3) ride state (pose)
    ride = st.get("ride")
    if base and not ride:
        print(f"char{n}: creating ride state…", flush=True)
        r = call("create_character_state", {"character_id": base, "edit_description": RIDE_EDIT,
                                            "use_color_palette_from_reference": True})
        ride = uuid_in(r); print(f"char{n} ride state = {ride}", flush=True)
        if ride: wait(ride, f"char{n} ridestate")
    st["ride"] = ride
    # 4) v3 ride anim (4 dirs, 4 frames)
    if ride and not st.get("rideanim_done"):
        print(f"char{n}: animating ride (v3)…", flush=True)
        call("animate_character", {"character_id": ride, "action_description": RIDE_ACTION,
             "animation_name": "ride", "directions": DIRS, "mode": "v3", "frame_count": 4})
        wait(ride, f"char{n} rideanim")
        st["rideanim_done"] = True
    state[n] = st
    json.dump(state, open(STATE, "w"), indent=1)
    print(f"char{n} STATE: {st}", flush=True)

print("ALL DONE", json.dumps(state), flush=True)
