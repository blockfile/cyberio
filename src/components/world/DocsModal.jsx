import React, { useState } from "react";
import "./docs-modal.css";

const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;
// per-page hero illustration (HD pixel art generated via PixelLab) — distinct per page
const SECTION_IMG = {
  overview: "docs_city", world: "docs_islands", loop: "docs_player",
  facilities: "docs_market", cards: "docs_card", pass: "docs_pass",
  pve: "docs_robot", pvp: "docs_arena", treasury: "docs_vault", vision: "docs_city",
};

// Whitepaper content (from the Cyberio Overview), split into browser "pages".
const SECTIONS = [
  {
    id: "overview", label: "Overview",
    body: (
      <>
        <p className="dx-p">
          <b>Cyberio</b> is an Isometric MMORPG Card Battler powered by the Solana blockchain.
          Players enter Cyberio City, collect Cyberio Cards, battle NPC opponents in PvE, and
          challenge other players in PvP wager battles.
        </p>
        <p className="dx-p">
          It combines MMORPG exploration, collectible card gameplay, and a player‑driven economy
          powered by the <b>$CYBERIO</b> token.
        </p>
        <div className="dx-grid3">
          <div className="dx-stat"><span className="dx-stat-k">Genre</span><span className="dx-stat-v">Isometric MMORPG · Card Battler · Play‑and‑Earn</span></div>
          <div className="dx-stat"><span className="dx-stat-k">Blockchain</span><span className="dx-stat-v">Solana</span></div>
          <div className="dx-stat"><span className="dx-stat-k">Currency</span><span className="dx-stat-v">$CYBERIO</span></div>
        </div>
      </>
    ),
  },
  {
    id: "world", label: "World",
    body: (
      <>
        <p className="dx-p">Cyberio consists of two islands.</p>
        <h3 className="dx-h3">Island 1 — Cyberio City</h3>
        <p className="dx-p">The Central District is the main hub. Facilities:</p>
        <ul className="dx-ul">
          <li>Marketplace</li><li>Store</li><li>Inventory</li>
          <li>Card Shop</li><li>PvE Area</li><li>Portal Gateway</li>
        </ul>
        <h3 className="dx-h3">Island 2 — Cyberio Arena</h3>
        <p className="dx-p">The PvP District for competitive play. Features:</p>
        <ul className="dx-ul"><li>Friendly Duels</li><li>Wager Battles</li></ul>
        <p className="dx-note">Access Island 2 through the Portal Gateway on Island 1.</p>
      </>
    ),
  },
  {
    id: "loop", label: "Gameplay Loop",
    body: (
      <>
        <h3 className="dx-h3">New Player Journey</h3>
        <ol className="dx-ol">
          <li>Connect Solana Wallet</li>
          <li>Receive 5 Free Starter Card Draws</li>
          <li>Play Friendly Duels</li>
          <li>Obtain Premium Cards</li>
          <li>Purchase Dimension Pass</li>
          <li>Participate in PvE</li>
          <li>Earn $CYBERIO Rewards</li>
          <li>Enter PvP Wager Battles</li>
        </ol>
        <h3 className="dx-h3">Randomized Cards</h3>
        <p className="dx-p">Every duel assigns <b>random cards</b> from each side's pool — in PvE
          (player &amp; NPC) and PvP (both players, from owned collections). No two matches are
          identical, so adaptability matters more than a fixed deck.</p>
      </>
    ),
  },
  {
    id: "facilities", label: "Facilities",
    body: (
      <>
        <h3 className="dx-h3">Marketplace</h3>
        <p className="dx-p">Player‑to‑player card trading: buy, sell, and browse listings.</p>
        <h3 className="dx-h3">Store</h3>
        <p className="dx-p">Sells Dimension Passes — holders get PvE access and the ability to edit their in‑game name.</p>
        <h3 className="dx-h3">Inventory</h3>
        <p className="dx-p">Stores all your cards: view your collection, manage decks, organize, and see rarities.</p>
        <h3 className="dx-h3">Card Shop</h3>
        <p className="dx-p">Obtain Cyberio Cards. New players get <b>5 free starter draws</b>; premium draws cost
          <b> 5,000 $CYBERIO</b> each. All draw fees go to the Treasury.</p>
      </>
    ),
  },
  {
    id: "cards", label: "Card System",
    body: (
      <>
        <h3 className="dx-h3">Rarities</h3>
        <div className="dx-grid3">
          <div className="dx-rar dx-rar--common"><b>Common</b><span>★☆☆</span><small>Power 1–7</small></div>
          <div className="dx-rar dx-rar--rare"><b>Rare</b><span>★★☆</span><small>Power 8–9</small></div>
          <div className="dx-rar dx-rar--leg"><b>Legendary</b><span>★★★</span><small>Power 10</small></div>
        </div>
        <h3 className="dx-h3">Starter Draws (5 free)</h3>
        <table className="dx-table">
          <tbody>
            <tr><td>Common</td><td>85%</td></tr>
            <tr><td>Rare</td><td>15%</td></tr>
            <tr><td>Legendary</td><td>0%</td></tr>
          </tbody>
        </table>
        <p className="dx-note">Starter cards are for <b>Friendly Duels only</b> — not usable in PvE or PvP wagers.</p>
        <h3 className="dx-h3">Premium Draws — 5,000 $CYBERIO</h3>
        <table className="dx-table">
          <tbody>
            <tr><td>Common</td><td>80%</td></tr>
            <tr><td>Rare</td><td>19.5%</td></tr>
            <tr><td>Legendary</td><td>0.5%</td></tr>
          </tbody>
        </table>
        <p className="dx-note">Legendary cards are only obtainable via Premium Draws or the Marketplace.</p>
      </>
    ),
  },
  {
    id: "pass", label: "Dimension Pass",
    body: (
      <>
        <p className="dx-p">A Dimension Pass is required to participate in PvE.</p>
        <div className="dx-grid3">
          <div className="dx-tier"><span className="dx-tier-n">TIER 1</span><b>30 Days</b><span className="dx-price">29,999</span><small>$CYBERIO</small></div>
          <div className="dx-tier"><span className="dx-tier-n">TIER 2</span><b>15 Days</b><span className="dx-price">17,999</span><small>$CYBERIO</small></div>
          <div className="dx-tier"><span className="dx-tier-n">TIER 3</span><b>7 Days</b><span className="dx-price">9,999</span><small>$CYBERIO</small></div>
        </div>
        <h3 className="dx-h3">Benefits</h3>
        <ul className="dx-ul"><li>Access to PvE</li><li>Earn PvE Rewards</li><li>Edit In‑Game Name</li></ul>
        <p className="dx-note">All purchases are sent directly to the Treasury.</p>
      </>
    ),
  },
  {
    id: "pve", label: "PvE System",
    body: (
      <>
        <p className="dx-p">PvE battles take place on Island 1 against NPC opponents.</p>
        <h3 className="dx-h3">Requirements</h3>
        <ul className="dx-ul"><li>Active Dimension Pass</li><li>PvE‑compatible cards</li></ul>
        <h3 className="dx-h3">Rewards per Victory</h3>
        <ul className="dx-ul">
          <li><b>Static NPC</b> — 500 to 1,000 $CYBERIO</li>
          <li><b>Walking NPC</b> — 1,000 to 1,500 $CYBERIO</li>
        </ul>
        <h3 className="dx-h3">Daily Limit</h3>
        <p className="dx-p">Max <b>30,000 $CYBERIO/day</b> (≈ 20–60 rewarded victories). At the cap, rewards
          pause (you can still practice) and resume after the daily reset at <b>12 AM UTC</b>. A
          <b> 5‑minute</b> penalty applies on a loss or surrender.</p>
        <p className="dx-note">Rewards are paid from the Treasury — no new tokens are minted.</p>
      </>
    ),
  },
  {
    id: "pvp", label: "PvP System",
    body: (
      <>
        <p className="dx-p">PvP takes place exclusively on Island 2. Only regular Cyberio Cards are
          eligible — starter cards are not.</p>
        <h3 className="dx-h3">Friendly Duels</h3>
        <p className="dx-p">Learn the game, test decks, and challenge friends. No rewards.</p>
        <h3 className="dx-h3">Wager Battles</h3>
        <p className="dx-p">Players wager $CYBERIO against each other. Example:</p>
        <table className="dx-table">
          <tbody>
            <tr><td>Player A</td><td>10,000</td></tr>
            <tr><td>Player B</td><td>10,000</td></tr>
            <tr><td>Total Pot</td><td>20,000</td></tr>
            <tr className="dx-hi"><td>Winner Receives</td><td>19,000</td></tr>
            <tr><td>Treasury (5% tax)</td><td>1,000</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "treasury", label: "Treasury & Token",
    body: (
      <>
        <p className="dx-p">The Treasury is the foundation of the Cyberio economy. Revenue comes from:</p>
        <ul className="dx-ul">
          <li>Card draws — 5,000 $CYBERIO each</li>
          <li>Dimension Pass sales — 29,999 / 17,999 / 9,999</li>
          <li>PvP wager taxes (5%)</li>
        </ul>
        <h3 className="dx-h3">Treasury Wallet</h3>
        <div className="dx-addr">
          <code className="dx-addr-code">sFeGzidDKhjruFyS9HdsB5i44MZRPa2uHnW876FvqhS</code>
          <button
            className="dx-addr-copy"
            onClick={(e) => {
              navigator.clipboard?.writeText("sFeGzidDKhjruFyS9HdsB5i44MZRPa2uHnW876FvqhS");
              const b = e.currentTarget;
              const t = b.textContent;
              b.textContent = "Copied!";
              setTimeout(() => { b.textContent = t; }, 1200);
            }}
          >
            Copy
          </button>
        </div>
        <h3 className="dx-h3">$CYBERIO Utility</h3>
        <ul className="dx-ul">
          <li>Premium Card Draws</li><li>Dimension Pass Purchases</li>
          <li>PvP Wagers</li><li>Marketplace Transactions</li>
        </ul>
      </>
    ),
  },
  {
    id: "vision", label: "Progression & Vision",
    body: (
      <>
        <h3 className="dx-h3">Progression</h3>
        <ul className="dx-ul">
          <li><b>Beginner</b> — enter the city, get starter cards, learn via friendly duels.</li>
          <li><b>Intermediate</b> — obtain premium cards, buy a Dimension Pass, begin PvE.</li>
          <li><b>Advanced</b> — earn through PvE and compete in PvP wagers.</li>
        </ul>
        <h3 className="dx-h3">Vision</h3>
        <p className="dx-p">Cyberio merges MMORPG exploration, collectible card gameplay, and blockchain
          ownership into a single ecosystem — collect powerful cards, earn through PvE, compete in PvP
          wagers, and take part in a sustainable, player‑driven economy powered by $CYBERIO.</p>
      </>
    ),
  },
];

export default function DocsModal({ onClose }) {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const active = SECTIONS.find((s) => s.id === activeId) || SECTIONS[0];

  return (
    <div className="dx-overlay" onClick={onClose}>
      <div className="dx-window" onClick={(e) => e.stopPropagation()}>
        {/* browser chrome */}
        <div className="dx-chrome">
          <div className="dx-dots"><span /><span /><span /></div>
          <div className="dx-omni">
            <span className="dx-lock">⬡</span>
            <span className="dx-url">cyberio://docs/{active.id}</span>
          </div>
          <button className="dx-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* body */}
        <div className="dx-body">
          <nav className="dx-side">
            <div className="dx-side-title">CYBERIO DOCS</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`dx-nav${s.id === activeId ? " active" : ""}`}
                onClick={() => setActiveId(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <main className="dx-content" key={active.id}>
            <div className="dx-hero">
              <div className="dx-hero-scroll" style={{ backgroundImage: `url(${asset("docs_strip")})` }} aria-hidden="true" />
              <img
                className="dx-hero-img"
                src={asset(SECTION_IMG[active.id] || "docs_city")}
                alt="" draggable={false}
                onError={(e) => { e.currentTarget.closest(".dx-hero").classList.add("dx-hero--noimg"); }}
              />
              <span className="dx-hero-title" data-text={active.label}>{active.label}</span>
            </div>
            {active.body}
          </main>
        </div>
      </div>
    </div>
  );
}
