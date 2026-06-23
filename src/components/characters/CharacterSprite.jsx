import React, { useEffect, useState } from "react";
import { characterById, idleSrc, runFrameSrc, runFrameCount } from "./characters";

/**
 * Animated directional character sprite.
 *
 * props:
 *  - id        character id ("1" | "2" | "3")
 *  - direction "front" | "back" | "left" | "right"
 *  - moving    when true, plays the run animation; otherwise shows the idle frame
 *  - size      rendered px size (square)
 *  - fps       run-animation speed in frames/second
 */
export default function CharacterSprite({
  id,
  direction = "front",
  moving = false,
  size = 96,
  fps = 8,
  className = "",
}) {
  const char = characterById(id);
  const frameCount = runFrameCount(id, direction);
  const [frame, setFrame] = useState(1);

  // Preload the run frames for the current id/direction so movement doesn't flicker.
  useEffect(() => {
    if (!char) return;
    for (let i = 1; i <= runFrameCount(id, direction); i++) {
      const img = new Image();
      img.src = runFrameSrc(id, direction, i);
    }
  }, [id, direction, char]);

  // Restart the cycle whenever direction or moving state changes.
  useEffect(() => {
    setFrame(1);
  }, [direction, moving]);

  // Advance run frames while moving.
  useEffect(() => {
    if (!moving || frameCount <= 1) return undefined;
    const t = setInterval(() => {
      setFrame((f) => (f % frameCount) + 1);
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [moving, frameCount, fps]);

  const src = moving ? runFrameSrc(id, direction, frame) : idleSrc(id, direction);

  return (
    <img
      className={`char-sprite ${className}`}
      src={src}
      alt={`${char?.name || "character"} ${direction}`}
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}
