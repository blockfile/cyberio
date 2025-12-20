import React, { useEffect, useState } from "react";
import "./main.css";
import bgImage from "../../assets/images/bg.jpg";
import backCard from "../../assets/images/back.png";
import leaf1 from "../../assets/images/leaf1.png";
import leaf2 from "../../assets/images/leaf2.png";
import enemy70 from "../../assets/images/Enemy_41.png";
import enemy44 from "../../assets/images/Enemy_44.png";
/* NEW: per-card backgrounds */
import enemy20 from "../../assets/images/Enemy_20.png";
import enemy21 from "../../assets/images/Enemy_21.png";
import enemy25 from "../../assets/images/Enemy_25.png";
import enemy27 from "../../assets/images/Enemy_27.png";

import { Link } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { motion } from "framer-motion";

/* ---------------- helpers for responsiveness ---------------- */
const useViewportWidth = () => {
  const [w, setW] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* ---------------- Random monster for hero flip ---------------- */
const randomCardNumber = Math.floor(Math.random() * 30) + 1;
const frontCard = require(`../../assets/images/monsters/${randomCardNumber}.png`);

const leaves = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  image: Math.random() > 0.5 ? leaf1 : leaf2,
  left: Math.random() * 100,
  delay: Math.random() * 10,
  size: 30 + Math.random() * 40,
}));

/* ---------------------------- Data ---------------------------- */
const ROADMAP_PHASES = [
  {
    id: "phase1",
    label: "Genesis Phase",
    time: "Q4 2024",
    title: "Prototype & Core Duels",
    subtitle: "The Deck of Fates opens for the first challengers.",
    bullets: [
      "Core 1v1 duel flow: stake → draw → winner takes the pot.",
      "Initial monster roster with elements and power tiers.",
      "Wallet connect + basic on-chain settlement on devnet.",
    ],
    rewardTitle: "Founder's Arena Access",
    rewardTag: "Exclusive lobbies for early duelists.",
  },
  {
    id: "phase2",
    label: "Battlefield Phase",
    time: "Q1 2025",
    title: "Ranked Lobbies & Enemies",
    subtitle: "Challengers climb brackets and face themed foes.",
    bullets: [
      "Ranked duels with MMR-style progression and tiers.",
      "Enemy passives that warp rules: shields, curses, crit draws.",
      "Match history, streak bonuses, and anti-tilt protections.",
    ],
    rewardTitle: "Ranked Dueler Badges",
    rewardTag: "Visual flex based on your highest tier.",
  },
  {
    id: "phase3",
    label: "Token Phase",
    time: "Mid 2025",
    title: "DUEL Token & Staking",
    subtitle: "Tie long-term value directly to duel volume.",
    bullets: [
      "Launch of DUEL token backed by SolDuels activity.",
      "DUEL + NFT staking pools for consistent grinders.",
      "Season prize pools fed by a slice of duel fees.",
    ],
    rewardTitle: "DUEL Vaults",
    rewardTag: "Yield routes for the most active players.",
  },
  {
    id: "phase4",
    label: "Realm Phase",
    time: "Late 2025",
    title: "Realms, Parties & Co-op",
    subtitle: "SolDuels evolves beyond simple 1v1 arenas.",
    bullets: [
      "Party-based raids versus massive realm bosses.",
      "Shared pots, split rewards, and support-style roles.",
      "Cross-realm events with limited monsters & cosmetics.",
    ],
    rewardTitle: "Realm Boss Events",
    rewardTag: "Time-limited encounters with unique drops.",
  },
];

/* NEW: backgrounds per phase (loops if more phases than images) */
const CARD_BG = [enemy20, enemy21, enemy25, enemy27];

export default function Main() {
  const [selected, setSelected] = useState(2); // default active
  const vw = useViewportWidth();

  // Card size scales with viewport (so 3 fit without clipping)
  const cardW = vw < 360 ? 210 : vw < 480 ? 235 : vw < 640 ? 260 : vw < 1024 ? 300 : 320;
  const cardH = vw < 360 ? 320 : vw < 480 ? 340 : vw < 640 ? 360 : vw < 1024 ? 400 : 420;

  // Horizontal spacing between cards (responsive & clamped)
  const spacing = clamp(vw * 0.28, Math.floor(cardW * 0.9), 340);

  // progress bar under subtitle
  const progressPercent =
    ROADMAP_PHASES.length > 1
      ? (selected / (ROADMAP_PHASES.length - 1)) * 100
      : 0;

  const goPrev = () =>
    setSelected((p) => (p === 0 ? ROADMAP_PHASES.length - 1 : p - 1));
  const goNext = () =>
    setSelected((p) => (p === ROADMAP_PHASES.length - 1 ? 0 : p + 1));

  // Only render prev / current / next
  const n = ROADMAP_PHASES.length;
  const prevIndex = (selected - 1 + n) % n;
  const nextIndex = (selected + 1) % n;
  const VISIBLE = [
    { phase: ROADMAP_PHASES[prevIndex], d: -1 },
    { phase: ROADMAP_PHASES[selected], d: 0 },
    { phase: ROADMAP_PHASES[nextIndex], d: 1 },
  ];

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden bg-black">
      {/* HERO (with subtle gradient band) */}
      <div
        className="main-container relative flex items-center justify-center h-screen bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})` }}
      >
        {/* soft white/black gradient overlay strip */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-white/10 via-black/40 to-white/10" />

        {/* Falling Leaves */}
        <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
          {leaves.map((leaf) => (
            <img
              key={leaf.id}
              src={leaf.image}
              className="falling-leaf absolute"
              style={{
                left: `${leaf.left}%`,
                width: `${leaf.size}px`,
                animationDelay: `${leaf.delay}s`,
              }}
              alt="leaf"
            />
          ))}
        </div>

        {/* Dark overlay to help text pop */}
        <div className="overlay absolute inset-0 z-[2]" />

        {/* Content */}
        <div className="z-[3] w-full max-w-3xl px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-play uppercase tracking-widest mb-8 font-bold text-white">
            <span className="text-white font-cyberway">Cyberio</span>

          </h1>

          <div className="card-wrapper mx-auto mb-4">
            <div className="card-inner">
              <img src={backCard} alt="Back" className="card-face card-front" />
              <img src={frontCard} alt="Front" className="card-face card-back" />
            </div>
          </div>

          <p className="text-white/85 font-play text-lg md:text-xl leading-relaxed mb-6 text-justify tracking-widest uppercase">
            In a fractured realm torn between{" "}
            <span className="font-semibold">fate</span> and{" "}
            <span className="font-semibold">fortune</span>, champions across the
            multiverse gather in a timeless arena where destiny is written not in
            blood—but in <span className="font-semibold">cards</span>. Here, ancient
            energies channel through the{" "}
            <span className="font-bold italic">Deck of Fates</span>, a mystical
            artifact that binds <span className="font-semibold">wagered tokens</span>{" "}
            to the will of the game. Only one truth reigns supreme:{" "}
            <span className="font-extrabold">The higher draw claims it all</span>.
          </p>

          <Link to="/dapp">
            <button className="start-button text-black font-semibold px-6 py-2 rounded bg-white hover:bg-white/90 transition">
              START
            </button>
          </Link>
        </div>
      </div>

      {/* ABOUT */}
      <section className="w-full bg-black py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-4xl md:text-5xl font-play font-bold text-white mb-12 uppercase tracking-widest">
            About
          </h2>

          <div className="space-y-12">
            <div className="relative bg-gradient-to-r from-white/10 via-black/40 to-white/10 border border-white/20 rounded-2xl px-6 md:px-10 py-10 flex flex-col md:flex-row items-center md:items-stretch gap-6 overflow-visible md:min-h-[260px]">
              <div className="md:hidden flex justify-center mb-2">
                <img src={enemy70} alt="Arena foe" className="max-h-48 w-auto opacity-90" />
              </div>
              <img
                src={enemy70}
                alt="Arena foe"
                className="hidden md:block pointer-events-none absolute -left-40 top-1/2 -translate-y-1/2 max-h-64 w-auto opacity-90"
              />
              <div className="relative z-10 flex-1 flex flex-col justify-center text-justify md:text-left md:ml-16">
                <h3 className="text-2xl md:text-3xl font-play text-white mb-4 uppercase tracking-[0.35em]">
                  The Duel System
                </h3>
                <p className="text-white/90 font-play text-sm md:text-base leading-relaxed mb-3">
                  Every duel is a wager of will and value. Two challengers lock in
                  their stakes and face the Deck of Fates. Both draw—one card each.
                  <span className="text-white font-semibold"> Highest power takes the entire pot.</span>
                </p>
                <p className="text-white/70 font-play text-xs md:text-sm leading-relaxed">
                  Certain enemies twist the rules with passive effects: shielded draws, bonus power by element, or penalties when you over-extend your wager.
                </p>
              </div>
            </div>

            <div className="relative bg-gradient-to-l from-white/10 via-black/40 to-white/10 border border-white/20 rounded-2xl px-6 md:px-10 py-10 flex flex-col md:flex-row items-center md:items-stretch gap-6 overflow-visible md:min-h-[260px]">
              <div className="md:hidden flex justify-center mb-2 order-1 md:order-none">
                <img src={enemy44} alt="Ranked beast" className="max-h-48 w-auto opacity-90" />
              </div>
              <div className="relative z-10 flex-1 flex flex-col justify-center text-justify md:text-left md:mr-16 order-2 md:order-none">
                <h3 className="text-2xl md:text-3xl font-play text-white mb-4 uppercase tracking-[0.35em]">
                  Ranks & Rewards
                </h3>
                <p className="text-white/90 font-play text-sm md:text-base leading-relaxed mb-3">
                  Duels feed into your record. Win streaks push you through
                  brackets, unlocking tougher enemies, bigger pots, and more brutal
                  arenas.
                </p>
                <p className="text-white/70 font-play text-xs md:text-sm leading-relaxed">
                  Seasons reset ladders but keep your legacy stats. Titles, borders,
                  and cosmetic auras broadcast your highest conquest across SolDuels.
                </p>
              </div>
              <img
                src={enemy44}
                alt="Ranked beast"
                className="hidden md:block pointer-events-none absolute -right-32 top-1/2 -translate-y-1/2 max-h-64 w-auto opacity-90"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
