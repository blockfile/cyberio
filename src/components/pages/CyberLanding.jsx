// Cyberpunk landing / connect screen for CYBERIO (shown before a wallet is connected).
import React, { useState } from "react";
import "./cyber-landing.css";

const CA = ""; // CYBERIO token mint
const LINKS = {
  docs: "https://cyberio.fun",
  terms: "https://cyberio.fun/terms",
  x: "https://x.com/cyberio",
  discord: "https://discord.gg/cyberio",
};

export default function CyberLanding({ onConnect, overlay = false }) {
  const [copied, setCopied] = useState(false);
  const short = `${CA.slice(0, 6)}…${CA.slice(-4)}`;

  const copyCA = async () => {
    try { await navigator.clipboard.writeText(CA); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch (e) { /* ignore */ }
  };

  return (
    <div className={`cl-root ${overlay ? "cl-root--overlay" : ""}`}>
      {/* overlay mode (on /world) lets the LIVE city animate behind instead of a static image */}
      {!overlay && (
        <div className="cl-bg" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/cyber-landing-bg.jpg)` }} />
      )}
      <div className="cl-grid" aria-hidden="true" />
      <div className="cl-scan" aria-hidden="true" />
      <div className="cl-vignette" aria-hidden="true" />

      <div className="cl-panel">
        <div className="cl-corner cl-corner--tl" />
        <div className="cl-corner cl-corner--tr" />
        <div className="cl-corner cl-corner--bl" />
        <div className="cl-corner cl-corner--br" />

        <div className="cl-badge">▣ NEON CITY ONLINE</div>
        <h1 className="cl-logo" data-text="CYBERIO">CYBERIO</h1>
        <p className="cl-tag">Claim your turf · build your syndicate · rule the grid</p>

        <button className="cl-connect" onClick={() => onConnect && onConnect()}>
          <span className="cl-connect__ic">⬡</span>
          <span>Connect Wallet</span>
        </button>

        <div className="cl-links">
          <a href={LINKS.docs} target="_blank" rel="noreferrer">Docs</a>
          <span className="cl-dot">•</span>
          <a href={LINKS.terms} target="_blank" rel="noreferrer">Terms</a>
          <span className="cl-dot">•</span>
          <a href={LINKS.x} target="_blank" rel="noreferrer" aria-label="X">𝕏</a>
          <a href={LINKS.discord} target="_blank" rel="noreferrer" aria-label="Discord" className="cl-disc">✦ Discord</a>
        </div>

        {CA && (
          <button className="cl-ca" onClick={copyCA} title="Copy contract address">
            <span className="cl-ca__label">CA</span>
            <span className="cl-ca__addr">{short}</span>
            <span className="cl-ca__copy">{copied ? "copied ✓" : "copy"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
