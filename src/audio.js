// Central game audio: scene BGM track URLs + one-shot SFX.
// Files live in /public/audio (served statically; no bundling). SFX respect the BGM mute
// (the 🔇 button persists "bgm_muted" in localStorage) but play independently of the ▶ toggle.

export const BGM = {
  world: "/audio/world-loop.mp3",
  arena: "/audio/arena-loop.mp3",
  duel:  "/audio/duel-loop.mp3",
  draw:  "/audio/draw-loop.mp3",
};

// per-cue source + base volume (+ optional throttle ms to avoid machine-gun repeats)
const SFX = {
  building:   { src: "/audio/sfx-building.mp3",    vol: 0.55 },
  move:       { src: "/audio/sfx-move.mp3",        vol: 0.30, throttle: 120 },
  portal:     { src: "/audio/sfx-portal.mp3",      vol: 0.60, throttle: 600 },
  mint:       { src: "/audio/sfx-mint.mp3",        vol: 0.70 },
  endturn:    { src: "/audio/sfx-endturn.mp3",     vol: 0.60 },
  match:      { src: "/audio/sfx-match.mp3",       vol: 0.70 },
  arenaEnter: { src: "/audio/sfx-arena-enter.mp3", vol: 0.70 },
  winModal:   { src: "/audio/sfx-winmodal.mp3",    vol: 0.70 },
  win:        { src: "/audio/sfx-win.mp3",         vol: 0.80 },
  lose:       { src: "/audio/sfx-lose.mp3",        vol: 0.70 },
};

function isMuted() {
  try { return localStorage.getItem("bgm_muted") === "true"; } catch (e) { return false; }
}

const lastAt = {};
export function playSfx(key) {
  const s = SFX[key];
  if (!s || isMuted()) return;
  const now = Date.now();
  if (s.throttle && lastAt[key] && now - lastAt[key] < s.throttle) return; // de-spam rapid triggers
  lastAt[key] = now;
  try {
    const a = new Audio(s.src);  // fresh element each time → overlapping one-shots are fine
    a.volume = s.vol;
    a.play().catch(() => {});    // ignore autoplay rejections (browser gesture policy)
  } catch (e) { /* ignore */ }
}
