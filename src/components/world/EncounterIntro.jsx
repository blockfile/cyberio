import React, { useEffect, useState } from "react";
import "./encounter.css";

const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;

// flavour per opponent tier
const FOES = {
  static:  { name: "STREET DUELIST",  line: "“Pay the toll… or duel me for it.”" },
  walking: { name: "ROGUE NETRUNNER", line: "“Big bounty on you, runner. Let's dance.”" },
};

/**
 * Pokémon-style battle intro: a bar wipe + flash, then a VS screen with the player and the
 * NPC facing off and a dialog box. Pressing FIGHT (onStart) hands off to the duel.
 */
export default function EncounterIntro({ npcChar = "1", playerChar = "1", tier = "static", onStart }) {
  const [phase, setPhase] = useState("wipe"); // "wipe" → "vs"
  useEffect(() => {
    const t = setTimeout(() => setPhase("vs"), 900);
    return () => clearTimeout(t);
  }, []);

  const foe = FOES[tier === "walking" ? "walking" : "static"];
  const accent = tier === "walking" ? "#9b7bff" : "#37e0a0";

  return (
    <div className={`enc-root enc-${phase}`} style={{ "--accent": accent }}>
      <div className="enc-bars" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className="enc-flash" aria-hidden="true" />

      {phase === "vs" && (
        <div className="enc-vs">
          <div className="enc-fighters">
            <div className="enc-fighter enc-left">
              <img
                className="enc-sprite enc-foe-art"
                src={asset(`enc_player${playerChar}`)}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.classList.remove("enc-foe-art"); e.currentTarget.src = asset(`player${playerChar}_e`); }}
                alt="" draggable={false}
              />
              <div className="enc-name enc-you">YOU</div>
            </div>
            <div className="enc-badge">VS</div>
            <div className="enc-fighter enc-right">
              <img
                className="enc-sprite enc-foe-art"
                src={asset(`enc_foe${npcChar}`)}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = asset(`npc${npcChar}_w`); }}
                alt="" draggable={false}
              />
              <div className="enc-name enc-foe">{foe.name}</div>
            </div>
          </div>

          <div className="enc-dialog">
            <div className="enc-line">A wild <b>{foe.name}</b> challenges you!</div>
            <div className="enc-sub">{foe.line}</div>
            <button className="enc-fight" onClick={onStart}>⚔ FIGHT</button>
          </div>
        </div>
      )}
    </div>
  );
}
