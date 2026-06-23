import React, { useEffect, useRef, useState } from "react";
import CharacterSprite from "./CharacterSprite";
import { CHARACTERS, idleSrc } from "./characters";
import "./characters.css";

// keyboard.code -> logical move direction
const KEY_MAP = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

const SPRITE = 96; // rendered sprite size in px
const SPEED = 2.6; // px per animation frame

/**
 * Self-contained demo that proves the character assets work:
 * pick one of the 3 characters, then walk it around with WASD / arrow keys.
 * The sprite faces its movement direction and plays the run animation while moving.
 */
export default function CharacterStage() {
  // remember the picked character so it becomes the player's avatar in /world
  const [selected, setSelected] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("CYBERIO_CHAR")) || CHARACTERS[0].id
  );
  useEffect(() => {
    try { localStorage.setItem("CYBERIO_CHAR", selected); } catch (e) { /* ignore */ }
  }, [selected]);

  const stageRef = useRef(null);
  const keysRef = useRef(new Set());
  const posRef = useRef({ x: 40, y: 40 });
  const movingRef = useRef(false);
  const dirRef = useRef("front");

  const [pos, setPos] = useState(posRef.current);
  const [direction, setDirection] = useState("front");
  const [moving, setMoving] = useState(false);

  // Track pressed keys.
  useEffect(() => {
    const down = (e) => {
      const k = KEY_MAP[e.code];
      if (!k) return;
      e.preventDefault();
      keysRef.current.add(k);
    };
    const up = (e) => {
      const k = KEY_MAP[e.code];
      if (k) keysRef.current.delete(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Movement / animation loop.
  useEffect(() => {
    let raf;
    const step = () => {
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has("left")) dx -= 1;
      if (keys.has("right")) dx += 1;
      if (keys.has("up")) dy -= 1;
      if (keys.has("down")) dy += 1;
      const isMoving = dx !== 0 || dy !== 0;

      if (isMoving) {
        const len = Math.hypot(dx, dy) || 1;
        const stage = stageRef.current;
        const maxX = stage ? stage.clientWidth - SPRITE : 9999;
        const maxY = stage ? stage.clientHeight - SPRITE : 9999;
        const nx = Math.max(0, Math.min(maxX, posRef.current.x + (dx / len) * SPEED));
        const ny = Math.max(0, Math.min(maxY, posRef.current.y + (dy / len) * SPEED));
        posRef.current = { x: nx, y: ny };
        setPos(posRef.current);

        // Horizontal movement wins for facing; otherwise use vertical.
        let nd = dirRef.current;
        if (dx < 0) nd = "left";
        else if (dx > 0) nd = "right";
        else if (dy < 0) nd = "back";
        else if (dy > 0) nd = "front";
        if (nd !== dirRef.current) {
          dirRef.current = nd;
          setDirection(nd);
        }
      }

      if (isMoving !== movingRef.current) {
        movingRef.current = isMoving;
        setMoving(isMoving);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="char-demo">
      <div className="char-demo__bar">
        <h1>Character Test</h1>
        <p>
          Move with <b>WASD</b> or the <b>arrow keys</b>. Pick a character below.
        </p>
        <div className="char-demo__picker">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`char-pick ${selected === c.id ? "is-active" : ""}`}
              onClick={() => setSelected(c.id)}
              title={c.name}
            >
              <img src={idleSrc(c.id, "front")} alt={c.name} draggable={false} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="char-demo__stage" ref={stageRef}>
        <div
          className="char-demo__actor"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            width: SPRITE,
            height: SPRITE,
          }}
        >
          <CharacterSprite id={selected} direction={direction} moving={moving} size={SPRITE} />
        </div>
      </div>
    </div>
  );
}
