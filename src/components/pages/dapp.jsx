// src/pages/Dapp.jsx
import React, { useContext, useMemo, useRef, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Wifi,
  Cpu,
  Wallet,
  Layers,
  Shield,
  Lock,
  Ticket,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import Navbar from "../navbar/navbar";
import { WalletContext } from "../../context/WalletConnect";
import "./dapp-hud.css";

// background
import bg2 from "../assets/images/bg4.jpg";

// icons
import playImg from "../assets/images/sword.png";
import marketImg from "../assets/images/market.png";
import EarnImg from "../assets/images/draw.png";
import inventoryImg from "../assets/images/inventory.png";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < breakpoint
  );

  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function shortWallet(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function Dapp() {
  const navigate = useNavigate();
  const isMobile = useIsMobile(820);

  const {
    wallet,
    connectWallet,
    sdBalance,
    solBalance,
    cardCount,
    loadingStats,
    refreshStats,
  } = useContext(WalletContext);

  // ===============================
  // PASS STATUS (for UI display)
  // ===============================
  const [passInfo, setPassInfo] = useState({
    hasActive: false,
    expiresAt: null,
    price: 5, // display only
    durationDays: 30, // display only
  });

  // ===============================
  // EARN ELIGIBILITY (PASS + NFT POWER RULE)
  // ===============================
  const [earnEligibility, setEarnEligibility] = useState({
    loading: false,
    eligible: false,
    hasActivePass: false,
    passExpiresAt: null,
    lowPowerCount: 0,
    requiredLowPower: 2,
    powerThreshold: 5,
  });

  const API_BASE =
    (process.env.REACT_APP_API_URL || "").trim() ||
    (process.env.REACT_APP_API_BASE || "").trim() ||
    "http://localhost:3001";

  const formatDateTime = (d) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return String(d);
    }
  };

  // ===============================
  // PASS STATUS (fallback compatible)
  // ===============================
  const fetchPassStatus = React.useCallback(async () => {
    if (!wallet) return;

    // 1) try: /api/store/pass-status?wallet=
    try {
      const { data } = await axios.get(`${API_BASE}/api/store/pass-status`, {
        params: { wallet },
      });

      if (data && typeof data === "object") {
        setPassInfo((p) => ({
          ...p,
          ...data,
          hasActive: !!data.hasActive,
          expiresAt: data.expiresAt || data.pass?.expiresAt || p.expiresAt,
        }));
        return;
      }
    } catch {
      // ignore and fallback
    }

    // 2) fallback: /api/store/pass/active/:wallet
    try {
      const { data } = await axios.get(`${API_BASE}/api/store/pass/active/${wallet}`);
      if (data?.success) {
        setPassInfo((p) => ({
          ...p,
          hasActive: !!data.active,
          expiresAt: data.active ? data.pass?.expiresAt : null,
        }));
      }
    } catch {
      // keep UI working even if endpoint not ready
    }
  }, [wallet, API_BASE]);

  // ===============================
  // ELIGIBILITY (READS DATABASE ONLY)
  // ===============================
  const fetchEarnEligibility = React.useCallback(async () => {
    if (!wallet) return;

    setEarnEligibility((e) => ({ ...e, loading: true }));

    try {
      const { data } = await axios.get(`${API_BASE}/api/earn/eligibility`, {
        params: { wallet },
      });

      if (!data?.success) throw new Error(data?.error || "Eligibility failed");

      setEarnEligibility({
        loading: false,
        eligible: !!data.eligible,
        hasActivePass: !!data.hasActivePass,
        passExpiresAt: data.passExpiresAt || null,
        lowPowerCount: Number(data.lowPowerCount || 0),
        requiredLowPower: Number(data.requiredLowPower || 2),
        powerThreshold: Number(data.powerThreshold || 5),
      });

      // Keep pass UI consistent
      setPassInfo((p) => ({
        ...p,
        hasActive: !!data.hasActivePass,
        expiresAt: data.passExpiresAt || p.expiresAt,
      }));
    } catch {
      setEarnEligibility((e) => ({ ...e, loading: false }));
    }
  }, [wallet, API_BASE]);

  React.useEffect(() => {
    fetchPassStatus();
  }, [fetchPassStatus]);

  React.useEffect(() => {
    fetchEarnEligibility();
  }, [fetchEarnEligibility]);

  // ===============================
  // ROUTES
  // ===============================
  const goToStorePage = React.useCallback(() => {
    navigate("/store");
  }, [navigate]);

  const goToInventory = React.useCallback(() => {
    navigate("/inventory");
  }, [navigate]);

  // ===============================
  // EARN CLICK HANDLER
  // ===============================
  const handleEarnClick = React.useCallback(() => {
    if (!wallet) return connectWallet();

    if (!earnEligibility.hasActivePass) return goToStorePage();

    if (earnEligibility.lowPowerCount < earnEligibility.requiredLowPower) return goToInventory();

    navigate("/earn");
  }, [
    wallet,
    connectWallet,
    earnEligibility.hasActivePass,
    earnEligibility.lowPowerCount,
    earnEligibility.requiredLowPower,
    goToStorePage,
    goToInventory,
    navigate,
  ]);

  // ===============================
  // MODES
  // ===============================
  const earnLocked = !earnEligibility.eligible;

  const earnLockTitle = !earnEligibility.hasActivePass ? "PASS REQUIRED" : "NFT REQUIREMENT";

  const earnLockDesc = !earnEligibility.hasActivePass
    ? "Go to Store and purchase Dimensional Pass to unlock Earn (P2E)."
    : `Need ${earnEligibility.requiredLowPower} NFTs with power below ${earnEligibility.powerThreshold}. ` +
    `You currently have ${earnEligibility.lowPowerCount}.`;

  const modes = useMemo(
    () => [
      {
        key: "play",
        title: "Play",
        subtitle: "Enter the battlefield",
        image: playImg,
        buttonText: "START",
        hint: "Ranked & casual lobbies. Winner takes the pot.",
        onClick: () => navigate("/play"),
        accent: "cyan",
        locked: false,
        lockTitle: "",
        lockDesc: "",
      },
      {
        key: "market",
        title: "Market",
        subtitle: "Trade cards & gear",
        image: marketImg,
        buttonText: "BROWSE",
        hint: "Buy, sell, and snipe upgrades for your build.",
        onClick: () => navigate("/market"),
        accent: "magenta",
        locked: true,
        lockTitle: "COMING SOON",
        lockDesc: "You can sell / buy NFT using Cyberio token here.",
      },
      {
        key: "earn",
        title: "Earn",
        subtitle: "Play to Earn Cyberio Token",
        image: EarnImg,
        buttonText: earnEligibility.loading ? "CHECKING…" : "EARN",
        hint: "Play daily and earn tokens.",
        onClick: handleEarnClick,
        accent: "violet",
        locked: earnLocked,
        lockTitle: earnLockTitle,
        lockDesc: earnLockDesc,
      },
      {
        key: "store",
        title: "Store",
        subtitle: "Dimensional Pass & boosts",
        image: marketImg,
        buttonText: "OPEN",
        hint: "Purchase Dimensional Pass to unlock Earn (P2E).",
        onClick: goToStorePage,
        accent: "amber",
        locked: false,
        lockTitle: "",
        lockDesc: "",
      },
      {
        key: "inventory",
        title: "Inventory",
        subtitle: "Manage your cards",
        image: inventoryImg,
        buttonText: "VIEW",
        hint: "Equip, upgrade, and prepare your roster.",
        onClick: () => navigate("/inventory"),
        accent: "lime",
        locked: false,
        lockTitle: "",
        lockDesc: "",
      },
    ],
    [
      navigate,
      earnLocked,
      earnLockTitle,
      earnLockDesc,
      handleEarnClick,
      goToStorePage,
      earnEligibility.loading,
    ]
  );

  // Default selection: Earn
  const defaultSelectedIndex = React.useMemo(() => {
    const earnIndex = modes.findIndex((m) => m.key === "earn");
    return earnIndex >= 0 ? earnIndex : 0;
  }, [modes]);

  const [selected, setSelected] = useState(defaultSelectedIndex);

  React.useEffect(() => {
    if (selected < 0 || selected >= modes.length) setSelected(defaultSelectedIndex);
  }, [modes.length, selected, defaultSelectedIndex]);

  const prev = React.useCallback(
    () => setSelected((p) => (p === 0 ? modes.length - 1 : p - 1)),
    [modes.length]
  );
  const next = React.useCallback(
    () => setSelected((p) => (p === modes.length - 1 ? 0 : p + 1)),
    [modes.length]
  );

  // --- swipe support (mobile) ---
  const dragX = useRef(0);
  const onDragStart = () => (dragX.current = 0);
  const onDrag = (_, info) => (dragX.current = info.offset.x);
  const onDragEnd = () => {
    const x = dragX.current;
    if (x > 60) prev();
    else if (x < -60) next();
  };

  const active = modes[selected];

  // ===============================
  // SCRAMBLE ENGINE
  // ===============================
  const GREEKISH = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩλμνξοπρστυφχψω";
  const ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const scrambleTo = React.useCallback((setter, finalText, ms = 520, toUpper = true) => {
    const raw = String(finalText || "");
    const target = toUpper ? raw.toUpperCase() : raw;
    const start = performance.now();

    const tick = () => {
      const t = performance.now() - start;
      const p = Math.min(1, t / ms);
      const lockCount = Math.floor(p * target.length);

      const out = target
        .split("")
        .map((ch, idx) => {
          if (ch === " ") return " ";
          if (idx < lockCount) return ch;

          const bias = p < 0.55 ? GREEKISH : ASCII;
          const pool = (bias + "⌁⌂⟟⟒⟐⟡").split("");
          return pool[Math.floor(Math.random() * pool.length)];
        })
        .join("");

      setter(out);

      if (p < 1) requestAnimationFrame(tick);
      else setter(target);
    };

    requestAnimationFrame(tick);
  }, []);

  // QS scramble
  const [qsLabelMap, setQsLabelMap] = useState(() => ({}));
  const [qsPulse, setQsPulse] = useState(false);

  const scrambleQS = React.useCallback(
    (key, finalText, ms = 520) => {
      scrambleTo((out) => setQsLabelMap((prev) => ({ ...prev, [key]: out })), finalText, ms, true);
    },
    [scrambleTo]
  );

  // Card title/sub
  const [cardTitle, setCardTitle] = useState(() => String(modes[selected]?.title || "").toUpperCase());
  const [cardSub, setCardSub] = useState(() => String(modes[selected]?.subtitle || "").toUpperCase());

  React.useEffect(() => {
    let t;
    const loop = () => {
      const delay = 3000 + Math.random() * 2000;
      t = window.setTimeout(() => {
        setQsPulse(true);
        window.setTimeout(() => setQsPulse(false), 220);

        const m = modes[selected];
        if (m) {
          scrambleTo(setCardTitle, m.title, 520, true);
          scrambleTo(setCardSub, m.subtitle, 560, true);
        }

        loop();
      }, delay);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [modes, selected, scrambleTo]);

  React.useEffect(() => {
    const m = modes[selected];
    if (!m) return;

    scrambleQS(m.key, m.title, 520);
    scrambleTo(setCardTitle, m.title, 520, true);
    scrambleTo(setCardSub, m.subtitle, 560, true);
  }, [selected, modes, scrambleQS, scrambleTo]);

  // Keyboard Enter on locked Earn -> store OR inventory
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Enter") {
        const m = modes[selected];
        if (m?.locked) {
          if (m.key === "earn") {
            if (!earnEligibility.hasActivePass) goToStorePage();
            else goToInventory();
          }
          return;
        }
        m?.onClick?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, modes, prev, next, goToStorePage, goToInventory, earnEligibility.hasActivePass]);

  // Status display
  const showWallet = wallet ? shortWallet(wallet) : "-";
  const showCards = wallet && cardCount != null ? String(cardCount) : wallet ? "..." : "-";
  const showSd = wallet && sdBalance != null ? `$SD ${sdBalance}` : wallet ? "..." : "$SD -";
  const showSol = wallet && solBalance != null ? `${solBalance} SOL` : wallet ? "..." : "-";

  return (
    <div className="dapp-hud">
      <div className="dapp-hud__bg" style={{ backgroundImage: `url(${bg2})` }} />
      <div className="dapp-hud__fx" aria-hidden="true" />

      <div className="dapp-hud__nav">
        <Navbar />
      </div>

      <div className="dapp-hud__frame">
        <div className="dapp-hud__topbar">
          <div className="dapp-hud__brand">
            <span className="dapp-hud__brandTitle font-cyberway">CYBERIO</span>
            <span className="dapp-hud__brandSub">SYSTEM MENU • SELECT GAME MODE</span>
          </div>

          <div className="dapp-hud__telemetry">
            <div className="pill">
              <Wifi size={16} />
              <span>Ping</span>
              <b>32ms</b>
            </div>
            <div className="pill">
              <Cpu size={16} />
              <span>Build</span>
              <b>v0.9.7</b>
            </div>
            <div className="pill pill--hot">
              <Shield size={16} />
              <span>Security</span>
              <b>ON</b>
            </div>
          </div>
        </div>

        <div className="dapp-hud__body">
          {/* LEFT */}
          <aside className="panel panel--left">
            <div className="panel__title">
              <span className="panel__tag">STATUS</span>
              <span className="panel__line" />
            </div>

            <div className="stat">
              <div className="stat__label">
                <Wallet size={16} />
                Wallet
              </div>
              <div className="stat__value mono">{showWallet}</div>
            </div>

            <div className="stat">
              <div className="stat__label">
                <Layers size={16} />
                Cards
              </div>
              <div className="stat__value mono">{showCards}</div>
            </div>

            <div className="stat">
              <div className="stat__label">Cyberio Balance</div>
              <div className="stat__value mono">{showSd}</div>
            </div>

            <div className="stat">
              <div className="stat__label">SOL</div>
              <div className="stat__value mono">{showSol}</div>
            </div>

            <div className="panel__divider" />

            <div className="panel__small">
              {!wallet ? (
                <div className="panel__smallRow">
                  <span>Status</span>
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="mono"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,.2)",
                      background: "rgba(255,255,255,.06)",
                      cursor: "pointer",
                    }}
                  >
                    CONNECT WALLET
                  </button>
                </div>
              ) : (
                <div className="panel__smallRow">
                  <span>Stats</span>
                  <button
                    type="button"
                    onClick={() => {
                      refreshStats && refreshStats();
                      fetchEarnEligibility();
                    }}
                    disabled={!!loadingStats || earnEligibility.loading}
                    className="mono"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,.2)",
                      background: loadingStats || earnEligibility.loading ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)",
                      cursor: loadingStats || earnEligibility.loading ? "not-allowed" : "pointer",
                      opacity: loadingStats || earnEligibility.loading ? 0.7 : 1,
                    }}
                  >
                    {loadingStats || earnEligibility.loading ? "REFRESHING…" : "REFRESH"}
                  </button>
                </div>
              )}

              {/* Quick Select */}
              <div className="panel__smallRow panel__smallRow--tight">
                <span>Quick Select</span>

                <div className="quickSelect mono" role="tablist" aria-label="Quick Select Modes">
                  {modes.map((m, i) => (
                    <button
                      key={m.key}
                      type="button"
                      className={[
                        "qsItem",
                        i === selected ? "qsItem--active" : "",
                        i === selected && qsPulse ? "qsItem--pulse" : "",
                        m.locked ? "qsItem--locked" : "",
                      ].join(" ")}
                      onClick={() => setSelected(i)}
                      role="tab"
                      aria-selected={i === selected}
                      title={m.locked ? (m.key === "earn" ? "Requirements not met" : "Locked") : ""}
                    >
                      <span className="qsText">{qsLabelMap[m.key] ?? m.title.toUpperCase()}</span>
                      {m.locked ? <Lock size={14} className="qsLock" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel__smallRow">
                <span>Controls</span>
                <span className="mono">← → / SWIPE</span>
              </div>
              <div className="panel__smallRow">
                <span>Hint</span>
                <span className="mono">Enter to launch</span>
              </div>
            </div>
          </aside>

          {/* CENTER */}
          <main className="center">
            <div className="center__header">
              <div className="center__kicker">MODE</div>
              <div className="center__title">
                <span className="mono">{String(selected + 1).padStart(2, "0")}</span>
                <span className="center__slash">/</span>
                <span className="mono">{String(modes.length).padStart(2, "0")}</span>
              </div>
            </div>

            {!isMobile && (
              <>
                <button className="navbtn navbtn--left" onClick={prev} aria-label="Previous">
                  <ChevronLeft />
                </button>
                <button className="navbtn navbtn--right" onClick={next} aria-label="Next">
                  <ChevronRight />
                </button>
              </>
            )}

            <div className="carousel">
              {!isMobile ? (
                modes.map((mode, index) => {
                  const offset = index - selected;
                  const isActive = index === selected;

                  return (
                    <motion.div
                      key={mode.key}
                      className={`modeCard ${isActive ? "isActive" : ""} ${mode.locked ? "isLocked" : ""}`}
                      animate={{
                        x: offset * 280,
                        scale: isActive ? 1 : 0.82,
                        opacity: isActive ? 1 : 0.28,
                        rotateY: isActive ? 0 : offset < 0 ? -16 : 16,
                        zIndex: isActive ? 30 : 10,
                      }}
                      transition={{ duration: 0.35, ease: "easeInOut" }}
                      style={{ pointerEvents: isActive ? "auto" : "none" }}
                      whileHover={isActive ? { y: -6 } : {}}
                    >
                      <div
                        className={[
                          "modeCard__frame",
                          `accent--${mode.accent}`,
                          isActive ? "modeCard__frame--active" : "",
                        ].join(" ")}
                      >
                        <div className="modeCard__scan" aria-hidden="true" />
                        <div className="modeCard__sheen" aria-hidden="true" />
                        <div className="modeCard__noise" aria-hidden="true" />

                        {mode.locked ? (
                          <div className="lockedBadge mono" title={mode.key === "earn" ? "Requirements not met" : "Locked"}>
                            <Lock size={16} />
                            <span>LOCKED</span>
                          </div>
                        ) : null}

                        <div className="modeCard__header">
                          <div className="modeCard__title">{isActive ? cardTitle : mode.title.toUpperCase()}</div>
                          <div className="modeCard__sub">{isActive ? cardSub : mode.subtitle.toUpperCase()}</div>
                        </div>

                        <div className="modeCard__imgWrap">
                          <motion.img
                            src={mode.image}
                            alt={mode.title}
                            className="modeCard__img"
                            whileHover={isActive ? { scale: 1.08 } : {}}
                            transition={{ duration: 0.25 }}
                          />
                        </div>

                        {mode.locked ? (
                          <div className="lockPanel">
                            <div className="lockPanel__row">
                              <span className="lockPanel__tag mono">{mode.lockTitle || "LOCKED"}</span>
                              {mode.key === "earn" ? (
                                <span className="lockPanel__pill mono">
                                  <Ticket size={14} />
                                  PASS
                                </span>
                              ) : (
                                <span className="lockPanel__pill mono">
                                  <Lock size={14} />
                                  HOLD
                                </span>
                              )}
                            </div>

                            <div className="lockPanel__desc">{mode.lockDesc || "Unavailable"}</div>

                            {mode.key === "earn" ? (
                              <button className="modeCard__btn" onClick={handleEarnClick}>
                                {!earnEligibility.hasActivePass ? "GO TO STORE" : "CHECK INVENTORY"}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <button className="modeCard__btn" onClick={mode.onClick}>
                            {mode.buttonText}
                          </button>
                        )}

                        <div className="modeCard__meta mono">
                          <span>ACCESS</span>
                          <b>{mode.locked ? "LOCKED" : "OPEN"}</b>
                        </div>

                        <span className="cardCorner cardCorner--tl" aria-hidden="true" />
                        <span className="cardCorner cardCorner--tr" aria-hidden="true" />
                        <span className="cardCorner cardCorner--bl" aria-hidden="true" />
                        <span className="cardCorner cardCorner--br" aria-hidden="true" />
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div
                  className="modeCardMobile"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragStart={onDragStart}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                >
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={active.key}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.22 }}
                      className={`modeCard__frame accent--${active.accent} modeCard__frame--active ${active.locked ? "isLocked" : ""
                        }`}
                    >
                      <div className="modeCard__scan" aria-hidden="true" />
                      <div className="modeCard__sheen" aria-hidden="true" />
                      <div className="modeCard__noise" aria-hidden="true" />

                      {active.locked ? (
                        <div className="lockedBadge mono" title={active.key === "earn" ? "Requirements not met" : "Locked"}>
                          <Lock size={16} />
                          <span>LOCKED</span>
                        </div>
                      ) : null}

                      <div className="modeCard__header">
                        <div className="modeCard__title">{cardTitle}</div>
                        <div className="modeCard__sub">{cardSub}</div>
                      </div>

                      <div className="modeCard__imgWrap">
                        <img src={active.image} alt={active.title} className="modeCard__img" />
                      </div>

                      {active.locked ? (
                        <div className="lockPanel">
                          <div className="lockPanel__row">
                            <span className="lockPanel__tag mono">{active.lockTitle || "LOCKED"}</span>
                            {active.key === "earn" ? (
                              <span className="lockPanel__pill mono">
                                <Ticket size={14} />
                                PASS
                              </span>
                            ) : (
                              <span className="lockPanel__pill mono">
                                <Lock size={14} />
                                HOLD
                              </span>
                            )}
                          </div>

                          <div className="lockPanel__desc">{active.lockDesc || "Unavailable"}</div>

                          {active.key === "earn" ? (
                            <button className="modeCard__btn" onClick={handleEarnClick}>
                              {!earnEligibility.hasActivePass ? "GO TO STORE" : "CHECK INVENTORY"}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <button className="modeCard__btn" onClick={active.onClick}>
                          {active.buttonText}
                        </button>
                      )}

                      <div className="modeDots">
                        {modes.map((m, i) => (
                          <button
                            key={m.key}
                            className={`dot ${i === selected ? "dot--on" : ""}`}
                            onClick={() => setSelected(i)}
                            aria-label={`Go to ${m.title}`}
                          />
                        ))}
                      </div>

                      <div className="modeHint mono">
                        SWIPE LEFT/RIGHT • {active.locked ? "LOCKED" : "ENTER TO LAUNCH"}
                      </div>

                      <span className="cardCorner cardCorner--tl" aria-hidden="true" />
                      <span className="cardCorner cardCorner--tr" aria-hidden="true" />
                      <span className="cardCorner cardCorner--bl" aria-hidden="true" />
                      <span className="cardCorner cardCorner--br" aria-hidden="true" />
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </main>

          {/* RIGHT */}
          <aside className="panel panel--right">
            <div className="panel__title">
              <span className="panel__tag">INFO</span>
              <span className="panel__line" />
            </div>

            <div className="panel__content">
              <div className="infoBlock">
                <div className="infoBlock__label">Selected</div>
                <div className="infoBlock__value">
                  {active.title}{" "}
                  {active.locked ? (
                    <span className="mono" style={{ opacity: 0.8 }}>
                      • LOCKED
                    </span>
                  ) : null}
                </div>
                <div className="infoBlock__hint">
                  {active.locked ? (
                    <>
                      <span className="mono">{active.lockTitle || "LOCKED"}</span> — {active.lockDesc || "Unavailable"}
                    </>
                  ) : (
                    active.hint
                  )}
                </div>
              </div>

              <div className="panel__divider" />

              <div className="infoBlock">
                <div className="infoBlock__label">Dimensional Pass</div>
                <div className="infoBlock__hint">
                  <span className="mono" style={{ opacity: 0.9 }}>
                    {passInfo.hasActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <span style={{ opacity: 0.85 }}> • Expires: {formatDateTime(passInfo.expiresAt)}</span>
                </div>

                {!passInfo.hasActive ? (
                  <button
                    type="button"
                    onClick={goToStorePage}
                    className="mono"
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.06)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ticket size={16} />
                    GO TO STORE
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      fetchPassStatus();
                      fetchEarnEligibility();
                    }}
                    className="mono"
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.06)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    REFRESH
                  </button>
                )}
              </div>

              <div className="panel__divider" />

              <div className="infoBlock">
                <div className="infoBlock__label">Earn Requirements</div>
                <div className="infoBlock__hint">
                  <div className="mono" style={{ opacity: 0.9 }}>
                    {earnEligibility.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    Low-power NFTs: {earnEligibility.lowPowerCount}/{earnEligibility.requiredLowPower} (power &lt;{" "}
                    {earnEligibility.powerThreshold})
                  </div>
                </div>
              </div>
            </div>

            <div className="panel__small">
              <div className="panel__smallRow">
                <span>System</span>
                <span className="mono">ONLINE</span>
              </div>
              <div className="panel__smallRow">
                <span>Region</span>
                <span className="mono">SEA</span>
              </div>
              <div className="panel__smallRow">
                <span>Theme</span>
                <span className="mono">CYBERPUNK HUD</span>
              </div>
            </div>
          </aside>
        </div>

        <div className="dapp-hud__bottombar mono">
          <span>TIP:</span> Use arrow keys / swipe. Press Enter or the mode button to launch.
        </div>

        <span className="corner corner--tl" aria-hidden="true" />
        <span className="corner corner--tr" aria-hidden="true" />
        <span className="corner corner--bl" aria-hidden="true" />
        <span className="corner corner--br" aria-hidden="true" />
      </div>
    </div>
  );
}
