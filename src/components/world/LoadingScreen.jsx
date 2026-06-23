import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import "./loading.css";

/**
 * Full-screen cyberpunk loading overlay for world transitions (portal → arena, duels)
 * and the refresh-restore: dimmed scene + neon grid + glitch title + spinner + progress.
 *
 * Props: label, sublabel, bg (scene image), accent (hex), dur (ms, drives the % + bar).
 */
export default function LoadingScreen({
  label = "LOADING",
  sublabel = "",
  bg,
  accent = "#49b6ff",
  dur = 1100,
}) {
  // animated 0→100 counter, eased, timed to the transition
  const [pct, setPct] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      setPct(Math.round((1 - Math.pow(1 - t, 2)) * 100));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dur]);

  // cycling system-status ticker
  const lines = useMemo(
    () => [
      "AUTH // wallet handshake ok",
      "NET  // syncing neon grid",
      "DATA // streaming assets",
      "SYNC // calibrating sector",
    ],
    []
  );
  const [li, setLi] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLi((n) => (n + 1) % lines.length), 520);
    return () => clearInterval(id);
  }, [lines.length]);

  // rising data particles (computed once)
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        dur: 2.4 + Math.random() * 2.6,
        size: 2 + Math.random() * 3,
      })),
    []
  );

  return (
    <motion.div
      className="ls-root"
      style={{ "--ls-accent": accent, "--ls-dur": `${dur}ms` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {bg && <div className="ls-bg" style={{ backgroundImage: `url(${bg})` }} />}
      <div className="ls-tint" />
      <div className="ls-grid" />

      <div className="ls-particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="ls-particle"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>

      <div className="ls-scan" />
      <div className="ls-sweep" />
      <div className="ls-vignette" />

      <span className="ls-corner tl" />
      <span className="ls-corner tr" />
      <span className="ls-corner bl" />
      <span className="ls-corner br" />

      <div className="ls-center">
        <div className="ls-rig" aria-hidden="true">
          <div className="ls-hex" />
          <div className="ls-spinner">
            <span />
            <span />
            <span />
          </div>
          <div className="ls-pct">{pct}</div>
        </div>

        <div className="ls-title" data-text={label}>
          {label}
        </div>
        {sublabel ? (
          <div className="ls-sub">
            {sublabel}
            <em className="ls-dots" />
          </div>
        ) : null}

        <div className="ls-bar">
          <i style={{ width: `${Math.max(4, pct)}%` }} />
        </div>

        <div className="ls-eq" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>

        <div className="ls-ticker">
          <span className="ls-dot" /> {lines[li]}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Lightweight loader for opening tool panels (Inventory / Market / Store / …).
 * Just an animated cyberpunk icon over the same dim+blur backdrop the panel uses —
 * no full-screen scene. The full LoadingScreen is reserved for the arena map jump.
 */
export function PanelLoader({
  accent = "#49b6ff",
  label = "LOADING",
  sublabel = "",
  dur = 800,
}) {
  return (
    <motion.div
      className="panel-loader"
      style={{ "--ls-accent": accent, "--ls-dur": `${dur}ms` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="pl-grid" aria-hidden="true" />
      <div className="pl-scan" aria-hidden="true" />

      <div className="pl-stack">
        <div className="pl-emblem" aria-hidden="true">
          <span className="pl-hex" />
          <span className="pl-ring" />
          <span className="pl-ring pl-ring2" />
          <span className="pl-core" />
          <span className="pl-orbit">
            <i />
          </span>
        </div>

        <div className="pl-label" data-text={label}>
          {label}
        </div>
        {sublabel ? <div className="pl-sub">{sublabel}</div> : null}

        <div className="pl-bar">
          <i />
        </div>
      </div>
    </motion.div>
  );
}
