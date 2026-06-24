import React, { useState } from "react";
import DocsModal from "./DocsModal";
import "./city-nav.css";

/**
 * Top navbar for the city — brand + Docs + How To Play + Connect Wallet.
 * Replaces the full-screen connect gate: the city is visible behind it and you
 * connect from here. When connected the wallet button shows the address (click = disconnect).
 */
export default function CityNav({ connected, shortAddr, onConnect, onDisconnect }) {
  const [howto, setHowto] = useState(false);
  const [docs, setDocs] = useState(false);

  return (
    <>
      <nav className="city-nav">
        <div className="city-nav__brand">
          <span className="city-nav__logo">CYBERIO</span>
          <span className="city-nav__tag">NEON CITY ONLINE</span>
        </div>

        <div className="city-nav__links">
          <button className="city-nav__link" onClick={() => setDocs(true)}>DOCS</button>
          <button className="city-nav__link" onClick={() => setHowto(true)}>HOW TO PLAY</button>
          {connected ? (
            <button className="city-nav__wallet is-connected" onClick={onDisconnect} title="Disconnect">
              <span className="city-nav__dot" />{shortAddr}
            </button>
          ) : (
            <button className="city-nav__wallet" onClick={onConnect}>
              <span className="city-nav__hex">⬡</span> CONNECT WALLET
            </button>
          )}
        </div>
      </nav>

      {docs && <DocsModal onClose={() => setDocs(false)} />}

      {howto && (
        <div className="howto-overlay" onClick={() => setHowto(false)}>
          <div className="howto-card" onClick={(e) => e.stopPropagation()}>
            <button className="howto-close" onClick={() => setHowto(false)} aria-label="Close">✕</button>
            <h2 className="howto-title" data-text="HOW TO PLAY">HOW TO PLAY</h2>
            <ul className="howto-list">
              <li><b>Move</b> — WASD or click a tile. Press <b>E</b> near a building to enter it.</li>
              <li><b>Card Shop</b> — draw cards (1× / 5× / 10×); rarity &amp; power vary.</li>
              <li><b>Inventory</b> — view your cards and their power ⚡.</li>
              <li><b>Marketplace</b> — buy &amp; sell cards for $CYBERIO; click a card to inspect.</li>
              <li><b>Dimension Pass</b> — unlocks Earn mode + a custom nickname.</li>
              <li><b>Earn</b> — with a pass active, duel city NPCs for $CYBERIO (toggle, top-right).</li>
              <li><b>Arena</b> — walk into the portal; right-click or press <b>E</b> to duel a player.</li>
            </ul>
            <button className="howto-ok" onClick={() => setHowto(false)}>GOT IT</button>
          </div>
        </div>
      )}
    </>
  );
}
