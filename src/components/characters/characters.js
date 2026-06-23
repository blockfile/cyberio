// Manifest for the player-character sprites stored in /public/characters/<id>/.
// Each character has 4 idle images (front/back/left/right) and 4 run
// animations. Frame counts differ per character/direction, so they're
// declared here explicitly (character 1 has 4 left/right run frames, the
// rest have 2).

const BASE = (process.env.PUBLIC_URL || "") + "/characters";

export const DIRECTIONS = ["front", "back", "left", "right"];

export const CHARACTERS = [
  { id: "1", name: "Runner 01", runFrames: { front: 2, back: 2, left: 4, right: 4 } },
  { id: "2", name: "Runner 02", runFrames: { front: 2, back: 2, left: 2, right: 2 } },
  { id: "3", name: "Runner 03", runFrames: { front: 2, back: 2, left: 2, right: 2 } },
];

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === String(id)) || null;
}

// Standing/idle frame, e.g. /characters/2/left.png
export function idleSrc(id, direction) {
  return `${BASE}/${id}/${direction}.png`;
}

// One run frame, e.g. /characters/1/run-left/3.png  (frame is 1-based)
export function runFrameSrc(id, direction, frame) {
  return `${BASE}/${id}/run-${direction}/${frame}.png`;
}

// How many run frames this character has for a direction (>= 1).
export function runFrameCount(id, direction) {
  const c = characterById(id);
  return Math.max(1, c?.runFrames?.[direction] || 1);
}
