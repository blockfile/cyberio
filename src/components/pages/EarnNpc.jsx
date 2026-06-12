// src/components/EarnNpc.jsx
// Earn NPC converted into P2E rules:
// - Requires active Dimension Pass
// - Requires >= 2 NFT cards with power < 5
// - 10 matches/day
// - 1000 CYBERIO per win
// - 10,000/day cap
// - Bonus redeal on match-point draw

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WalletContext } from "../../context/WalletConnect";
import io from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { SOCKET_URL } from "../../config/endpoints";

import duelfield from "../assets/images/duelfield.jpg";
import backImage from "../assets/images/back.png";

import "./EarnNpc.css";

/* load 1.webp..46.webp */
function importAll(r) {
    const images = {};
    r.keys().forEach((item) => {
        const key = item.replace("./", "").replace(".webp", "");
        images[key] = r(item);
    });
    return images;
}
const monsterImages = importAll(require.context("../assets/images/cards", false, /\.webp$/i));

const imgSrc = (cid) => monsterImages[String(cid)] || backImage;

const cardImageSrc = (cardOrCid) => {
    if (!cardOrCid) return backImage;
    if (typeof cardOrCid === "string" || typeof cardOrCid === "number") return imgSrc(cardOrCid);
    if (cardOrCid.image) return cardOrCid.image;
    if (cardOrCid.cid != null) return imgSrc(cardOrCid.cid);
    return backImage;
};

const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
});

const fadeInUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

export default function EarnNpc() {
    const { wallet } = useContext(WalletContext);
    const navigate = useNavigate();

    const [status, setStatus] = useState("idle"); // idle | dueling | redealing

    // hands/piles
    const [selfCards, setSelfCards] = useState([]);
    const [npcCards, setNpcCards] = useState([]);

    // field display
    const [selfFieldCard, setSelfFieldCard] = useState(null);
    const [npcFieldSlot, setNpcFieldSlot] = useState(null);
    const [npcHiddenCard, setNpcHiddenCard] = useState(null);

    // score
    const [selfScore, setSelfScore] = useState(0);
    const [npcScore, setNpcScore] = useState(0);

    // pending selection lock
    const [pendingUid, setPendingUid] = useState(null);

    // rules/profile
    const [rules, setRules] = useState({
        roundsToWin: 2,
        dailyCap: 10000,
        earnedToday: 0,
        remainingToday: null,
        winPayout: 1000,
        matchesPerDay: 10,
        matchesPlayedToday: 0,
        remainingMatchesToday: 10,
        passExpiresAt: null,
        poolBalance: 0,
        requirements: { lowPowerThreshold: 5, lowPowerMinCount: 2 },
    });

    const [npcProfile, setNpcProfile] = useState({
        name: "NEON NPC",
        rank: "P2E BOT",
    });

    // modals
    const [infoModal, setInfoModal] = useState({ open: false, title: "", message: "" });
    const openInfo = (title, message) => setInfoModal({ open: true, title, message });

    const [roundModal, setRoundModal] = useState({
        open: false,
        yourCard: null,
        oppCard: null,
        winner: "draw",
        youPower: 0,
        npcPower: 0,
    });

    const [resultModal, setResultModal] = useState({
        open: false,
        win: false,
        payout: null,
    });

    const [bonusModal, setBonusModal] = useState(false);

    const ignoreNextScoreUpdateRef = useRef(false);
    const requestedBonusRef = useRef(false);

    // ✅ Mobile HUD toggle (UI only)
    const [hudOpen, setHudOpen] = useState(false);

    useEffect(() => {
        if (wallet) socket.emit("hello", { wallet });
    }, [wallet]);

    useEffect(() => {
        const onStart = ({ selfCards, npcCards, npcProfile, rules, bonusRound }) => {
            setStatus("dueling");
            setSelfCards(selfCards || []);
            setNpcCards(npcCards || []);
            setNpcProfile(npcProfile || { name: "NEON NPC", rank: "P2E BOT" });

            const mergedRules = {
                roundsToWin: rules?.roundsToWin ?? 2,
                dailyCap: rules?.dailyCap ?? 10000,
                earnedToday: rules?.earnedToday ?? 0,
                remainingToday:
                    rules?.remainingToday ??
                    (rules?.dailyCap != null && rules?.earnedToday != null
                        ? Math.max(0, Number(rules.dailyCap) - Number(rules.earnedToday))
                        : null),
                winPayout: rules?.winPayout ?? 1000,
                matchesPerDay: rules?.matchesPerDay ?? 10,
                matchesPlayedToday: rules?.matchesPlayedToday ?? 0,
                remainingMatchesToday: rules?.remainingMatchesToday ?? 10,
                passExpiresAt: rules?.passExpiresAt ?? null,
                poolBalance: rules?.poolBalance ?? 0,
                requirements: rules?.requirements ?? { lowPowerThreshold: 5, lowPowerMinCount: 2 },
            };
            setRules(mergedRules);

            if (!bonusRound) {
                setSelfScore(0);
                setNpcScore(0);
            }

            setSelfFieldCard(null);
            setNpcFieldSlot(null);
            setNpcHiddenCard(null);
            setPendingUid(null);

            requestedBonusRef.current = false;
            ignoreNextScoreUpdateRef.current = false;

            setRoundModal({
                open: false,
                yourCard: null,
                oppCard: null,
                winner: "draw",
                youPower: 0,
                npcPower: 0,
            });

            setResultModal({ open: false, win: false, payout: null });

            if (bonusRound) setBonusModal(true);
        };

        socket.on("earnNpc:startDuel", onStart);

        socket.on("earnNpc:bonusHand", ({ selfCards, npcCards, npcProfile }) => {
            setStatus("dueling");
            setSelfCards(selfCards || []);
            setNpcCards(npcCards || []);
            if (npcProfile) setNpcProfile(npcProfile);

            setSelfFieldCard(null);
            setNpcFieldSlot(null);
            setNpcHiddenCard(null);
            setPendingUid(null);

            requestedBonusRef.current = false;
            setBonusModal(true);
        });

        socket.on("earnNpc:eligibilityFailed", ({ code, message, expiresAt, lockedUntil, lowCount }) => {
            let extra = "";
            if (code === "PASS_REQUIRED") {
                extra = expiresAt
                    ? `\n\nPass expired: ${new Date(expiresAt).toLocaleString()}`
                    : "\n\nYou need to buy a Dimension Pass in the Store.";
            }
            if (code === "MATCH_LIMIT") {
                extra = lockedUntil ? `\n\nLocked until: ${new Date(lockedUntil).toLocaleString()}` : "";
            }
            if (code === "LOW_POWER_RULE") {
                extra = lowCount != null ? `\n\nLow-power cards owned: ${lowCount}` : "";
            }
            openInfo("P2E Access Denied", `${message || "Not eligible."}${extra}`);
            setStatus("idle");
        });

        socket.on("earnNpc:ackPlayed", ({ uid }) => {
            setSelfCards((prev) => {
                const full = prev.find((c) => c.uid === uid);
                if (full) setSelfFieldCard(full);
                return prev.filter((c) => c.uid !== uid);
            });
            setPendingUid(null);
        });

        socket.on("earnNpc:opponentPlayedCard", () => {
            setNpcFieldSlot("back");
            setNpcHiddenCard(null);

            setNpcCards((prev) => {
                if (!prev?.length) return prev;
                const next = [...prev];
                const idx = next.findIndex((x) => x === "back");
                if (idx !== -1) next.splice(idx, 1);
                return next;
            });
        });

        socket.on("earnNpc:revealOpponentCard", (card) => {
            setNpcHiddenCard(card || null);
        });

        socket.on("earnNpc:roundResolved", ({ yourCard, oppCard, winner }) => {
            const youPower = Number(yourCard?.power || 0);
            const npcPower = Number(oppCard?.power || 0);
            const finalWinner = winner || "draw";
            ignoreNextScoreUpdateRef.current = finalWinner === "draw";

            setRoundModal({
                open: true,
                yourCard,
                oppCard,
                winner: finalWinner,
                youPower,
                npcPower,
            });
        });

        socket.on("earnNpc:scoreUpdate", ({ selfScore, opponentScore }) => {
            if (ignoreNextScoreUpdateRef.current) {
                ignoreNextScoreUpdateRef.current = false;
                return;
            }
            setSelfScore(Number(selfScore || 0));
            setNpcScore(Number(opponentScore || 0));
        });

        socket.on("earnNpc:duelResult", ({ payout }) => {
            const didWin = (payout?.amount || 0) > 0;
            setResultModal({ open: true, win: didWin, payout });

            setRules((prev) => ({
                ...prev,
                dailyCap: payout?.dailyCap ?? prev.dailyCap,
                earnedToday: payout?.earnedToday ?? prev.earnedToday,
                remainingToday: payout?.remainingToday ?? prev.remainingToday,
                matchesPerDay: payout?.matchesPerDay ?? prev.matchesPerDay,
                matchesPlayedToday: payout?.matchesPlayedToday ?? prev.matchesPlayedToday,
                remainingMatchesToday: payout?.remainingMatchesToday ?? prev.remainingMatchesToday,
                passExpiresAt: payout?.passExpiresAt ?? prev.passExpiresAt,
                winPayout: payout?.winPayout ?? prev.winPayout,
                poolBalance: payout?.poolBalance ?? prev.poolBalance,
            }));

            setStatus("idle");
        });

        socket.on("earnNpc:insufficientDeck", ({ you, need }) => {
            openInfo("Insufficient Deck", `You have ${you || 0} cards. You need at least ${need || 3} to play.`);
            setStatus("idle");
        });

        socket.on("earnNpc:error", ({ message }) => {
            openInfo("P2E", message || "Something went wrong");
            setPendingUid(null);
            setStatus((s) => (s === "redealing" ? "dueling" : s));
            requestedBonusRef.current = false;
        });

        return () => {
            socket.off("earnNpc:startDuel", onStart);
            socket.removeAllListeners("earnNpc:bonusHand");
            socket.removeAllListeners("earnNpc:eligibilityFailed");
            socket.removeAllListeners("earnNpc:ackPlayed");
            socket.removeAllListeners("earnNpc:opponentPlayedCard");
            socket.removeAllListeners("earnNpc:revealOpponentCard");
            socket.removeAllListeners("earnNpc:roundResolved");
            socket.removeAllListeners("earnNpc:scoreUpdate");
            socket.removeAllListeners("earnNpc:duelResult");
            socket.removeAllListeners("earnNpc:insufficientDeck");
            socket.removeAllListeners("earnNpc:error");
        };
    }, []);

    const startEarn = () => {
        if (!wallet) return openInfo("Wallet Required", "Connect your wallet first.");
        socket.emit("hello", { wallet });
        socket.emit("earnNpc:start", { wallet });
    };

    const handleCardSelect = (card) => {
        if (status !== "dueling") return;
        if (selfFieldCard) return;
        if (pendingUid) return;
        if (roundModal.open) return;

        setPendingUid(card.uid);
        socket.emit("earnNpc:playCard", { wallet, uid: card.uid, cid: card.cid });
    };

    const endTurn = () => {
        if (status !== "dueling") return;
        if (roundModal.open) return openInfo("Round Result", "Close the round result first.");

        if (!selfFieldCard) return openInfo("Play a Card", "Select a card first.");
        if (!npcFieldSlot) return openInfo("Wait for NPC", "NPC has not played yet.");
        if (npcFieldSlot === "back" && !npcHiddenCard) {
            return openInfo("Wait for Reveal", "NPC is still choosing…");
        }

        socket.emit("earnNpc:endTurn", { wallet });
    };

    const isMatchPointDraw = (winner) => {
        if (winner !== "draw") return false;
        const target = Number(rules.roundsToWin || 2) - 1;
        return selfScore === target && npcScore === target;
    };

    const requestBonusRedraw = () => {
        if (!wallet) return;
        if (requestedBonusRef.current) return;

        requestedBonusRef.current = true;
        setStatus("redealing");
        socket.emit("earnNpc:bonusRedraw", { wallet });
    };

    const closeRoundModal = () => {
        const winner = roundModal.winner;
        setRoundModal((m) => ({ ...m, open: false }));

        setSelfFieldCard(null);
        setNpcFieldSlot(null);
        setNpcHiddenCard(null);

        if (isMatchPointDraw(winner)) {
            requestBonusRedraw();
        }
    };

    const progressText = useMemo(() => {
        return `${selfScore} / ${rules.roundsToWin} vs ${npcScore} / ${rules.roundsToWin}`;
    }, [selfScore, npcScore, rules.roundsToWin]);

    const dailyText = useMemo(() => {
        const cap = rules.dailyCap ?? 0;
        const earned = rules.earnedToday ?? 0;
        const remaining = rules.remainingToday != null ? rules.remainingToday : Math.max(0, Number(cap) - Number(earned));
        return { cap, earned, remaining };
    }, [rules]);

    const matchText = useMemo(() => {
        const total = rules.matchesPerDay ?? 10;
        const played = rules.matchesPlayedToday ?? 0;
        const remaining = rules.remainingMatchesToday != null ? rules.remainingMatchesToday : Math.max(0, total - played);
        return { total, played, remaining };
    }, [rules]);

    const passText = useMemo(() => {
        if (!rules.passExpiresAt) return "No pass loaded";
        try {
            return new Date(rules.passExpiresAt).toLocaleString();
        } catch {
            return String(rules.passExpiresAt);
        }
    }, [rules.passExpiresAt]);

    const npcFieldImage = npcFieldSlot === "back" ? backImage : backImage;

    return (
        <div className="earnnpc-scene font-silkscreen">
            {/* Background */}
            <img src={duelfield} alt="" className="earnnpc-bg" />
            <div className="earnnpc-dim" />
            <div className="earnnpc-glow" />

            {/* Top actions */}
            <div className="earnnpc-top-actions">
                <button
                    type="button"
                    onClick={() => setHudOpen((v) => !v)}
                    className="md:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-md
                     bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs"
                >
                    {hudOpen ? "Hide HUD" : "Show HUD"}
                </button>

                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md
                     bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs"
                >
                    ← Back
                </button>
            </div>

            {/* Ribbon */}
            <div className="earnnpc-ribbon">
                <div
                    className="rounded-2xl px-3 py-2 text-[10px] border border-white/15 bg-black/35 backdrop-blur-md
                     flex flex-wrap items-center justify-center gap-x-2 gap-y-1
                     shadow-[0_0_22px_rgba(255,43,214,0.12)]"
                >
                    <span className="opacity-80">P2E:</span>
                    <span className="font-semibold text-fuchsia-200">{npcProfile.name}</span>

                    <span className="opacity-50">•</span>

                    <span className="opacity-80">Daily:</span>
                    <span className="font-semibold">
                        {dailyText.earned}/{dailyText.cap}
                    </span>

                    <span className="opacity-50">•</span>

                    <span className="opacity-80">Matches:</span>
                    <span className="font-semibold">
                        {matchText.played}/{matchText.total}
                    </span>

                    <span className="opacity-50">•</span>

                    <span className="opacity-80">Win:</span>
                    <span className="font-semibold text-cyan-200">+{rules.winPayout}</span>
                </div>
            </div>

            {/* Desktop HUD */}
            <div className="hidden md:block fixed top-4 left-4 z-40 space-y-1 text-sm">
                <div className="rounded-2xl border border-white/15 bg-black/30 backdrop-blur-md p-3 shadow-[0_0_28px_rgba(0,255,240,0.10)]">
                    <p>
                        Progress: <span className="font-bold">{progressText}</span>
                    </p>
                    <p className="opacity-85">
                        Status: <span className="font-bold">{status}</span>{" "}
                        {status === "dueling" ? (
                            <span className="opacity-80">• Remaining: You {selfCards.length} / NPC {npcCards.length}</span>
                        ) : status === "redealing" ? (
                            <span className="opacity-80">• Bonus hand dealing…</span>
                        ) : null}
                    </p>
                    <p className="opacity-85">
                        Remaining Today: <span className="font-bold">{dailyText.remaining}</span>
                    </p>
                    <p className="opacity-85">
                        Matches Remaining: <span className="font-bold">{matchText.remaining}</span>
                    </p>
                    <p className="opacity-85">
                        Pass Expires: <span className="font-bold">{passText}</span>
                    </p>
                    <p className="opacity-85">
                        Pool: <span className="font-bold">{rules.poolBalance ?? 0}</span>
                    </p>
                </div>
            </div>

            {/* Mobile HUD overlay */}
            <AnimatePresence>
                {hudOpen && (
                    <motion.div
                        className="fixed inset-x-3 top-[92px] z-50 md:hidden"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                    >
                        <div className="rounded-2xl border border-white/15 bg-black/60 backdrop-blur-md p-3 shadow-[0_0_26px_rgba(255,43,214,0.12)]">
                            <div className="text-[10px] uppercase tracking-widest opacity-80">HUD</div>
                            <div className="mt-2 space-y-1 text-[11px]">
                                <div>
                                    Progress: <span className="font-bold">{progressText}</span>
                                </div>
                                <div className="opacity-85">
                                    Status: <span className="font-bold">{status}</span>{" "}
                                    {status === "dueling" ? (
                                        <span className="opacity-80">• You {selfCards.length} / NPC {npcCards.length}</span>
                                    ) : status === "redealing" ? (
                                        <span className="opacity-80">• Bonus dealing…</span>
                                    ) : null}
                                </div>
                                <div className="opacity-85">
                                    Remaining Today: <span className="font-bold">{dailyText.remaining}</span>
                                </div>
                                <div className="opacity-85">
                                    Matches Remaining: <span className="font-bold">{matchText.remaining}</span>
                                </div>
                                <div className="opacity-85">
                                    Pass Expires: <span className="font-bold">{passText}</span>
                                </div>
                                <div className="opacity-85">
                                    Pool: <span className="font-bold">{rules.poolBalance ?? 0}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Viewport content (fits inside screen, no scroll) */}
            <div className="earnnpc-viewport">
                <div className="earnnpc-wrap">
                    {status !== "dueling" && status !== "redealing" ? (
                        <motion.div
                            className="w-full max-w-xl mx-auto rounded-2xl border border-fuchsia-400/30
                         bg-gradient-to-b from-fuchsia-900/25 to-violet-900/10
                         p-5 md:p-6
                         shadow-[0_0_32px_rgba(255,43,214,0.14)]
                         relative overflow-hidden"
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                        >
                            <div
                                className="pointer-events-none absolute inset-0 opacity-60"
                                style={{
                                    background: "linear-gradient(90deg, rgba(0,255,240,0.08), transparent 35%, rgba(255,43,214,0.10))",
                                }}
                            />
                            <div className="text-xs uppercase tracking-widest opacity-80">Play-to-Earn</div>
                            <div className="mt-1 text-2xl md:text-3xl font-extrabold text-fuchsia-200 drop-shadow">Duel the AI. Win tokens.</div>

                            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Requirements</div>
                                    <div className="mt-1 text-sm font-extrabold">
                                        Active Dimension Pass + {rules.requirements.lowPowerMinCount} cards below power {rules.requirements.lowPowerThreshold}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Daily limits</div>
                                    <div className="mt-1 text-sm font-extrabold">
                                        {rules.matchesPerDay} matches/day • {rules.dailyCap} max/day
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Win reward</div>
                                    <div className="mt-1 text-sm font-extrabold text-cyan-200">+{rules.winPayout} CYBERIO</div>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Draw rule</div>
                                    <div className="mt-1 text-sm font-extrabold">Draw discards cards. Bonus redeal at 1–1 draw.</div>
                                </div>
                            </div>

                            <motion.button
                                onClick={startEarn}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.98 }}
                                className="mt-5 w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                            >
                                Start P2E Duel
                            </motion.button>
                        </motion.div>
                    ) : (
                        <>
                            {/* NPC draw pile */}
                            <div className="w-full">
                                <div className="mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-black/35 border border-white/15 backdrop-blur-md">
                                    NPC Remaining Cards
                                </div>

                                <div className="relative mx-auto flex justify-center gap-2 md:gap-3 mb-3 flex-wrap">
                                    <AnimatePresence initial={false}>
                                        {npcCards.map((card, i) => (
                                            <motion.div key={`npc-${i}`} layout {...fadeInUp} className="relative">
                                                <motion.img
                                                    src={card === "back" ? backImage : imgSrc(card)}
                                                    className="earnnpc-card-npc w-14 h-20 sm:w-16 sm:h-24 md:w-24 md:h-36 rounded-xl shadow border border-white/10 bg-white/5"
                                                    alt=""
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Field */}
                            <div className="w-full grid grid-cols-1 md:grid-cols-3 items-start md:items-center gap-3 md:gap-8">
                                <div className="md:justify-self-end">
                                    <div className="relative rounded-2xl p-3 bg-black/35 border border-fuchsia-300/25 backdrop-blur-md">
                                        <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-fuchsia-500/80 text-white font-bold tracking-widest uppercase">
                                            NPC Field
                                        </div>

                                        <div className="relative w-24 h-32 sm:w-28 sm:h-40 md:w-32 md:h-44 mx-auto flex items-center justify-center rounded-xl border-2 border-fuchsia-300/60 bg-black/35">
                                            {npcFieldSlot ? (
                                                <img src={npcFieldImage} className="w-[95%] h-[95%] object-contain rounded-lg" alt="" />
                                            ) : (
                                                <div className="text-xs opacity-80">Waiting…</div>
                                            )}
                                        </div>

                                        {npcFieldSlot === "back" && npcHiddenCard && (
                                            <div className="mt-2 text-[11px] opacity-90">
                                                NPC revealed:{" "}
                                                <span className="font-bold text-fuchsia-200">
                                                    {npcHiddenCard?.name || `CID ${npcHiddenCard?.cid || "—"}`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="hidden md:flex items-center justify-center">
                                    <div className="rounded-full px-4 py-2 border border-white/15 bg-black/30 backdrop-blur-md text-sm tracking-wide">VS</div>
                                </div>

                                <div className="md:justify-self-start">
                                    <div className="relative rounded-2xl p-3 bg-black/35 border border-cyan-300/20 backdrop-blur-md">
                                        <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-cyan-500/80 text-black font-bold tracking-widest uppercase">
                                            Your Field
                                        </div>

                                        <div className="relative w-24 h-32 sm:w-28 sm:h-40 md:w-32 md:h-44 mx-auto flex items-center justify-center rounded-xl border-2 border-cyan-300/55 bg-black/35">
                                            {selfFieldCard ? (
                                                <img src={cardImageSrc(selfFieldCard)} className="w-[95%] h-[95%] object-contain rounded-lg" alt="" />
                                            ) : (
                                                <div className="text-xs opacity-80">Play a card</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Hand */}
                            <div className="w-full mt-3">
                                <div className="mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-black/35 border border-white/15 backdrop-blur-md">
                                    Your Remaining Cards
                                </div>

                                <div
                                    className={`flex flex-wrap justify-center gap-2 ${pendingUid || roundModal.open || status === "redealing" ? "pointer-events-none opacity-90" : ""
                                        }`}
                                >
                                    <AnimatePresence initial={false}>
                                        {selfCards.map((card) => (
                                            <motion.div key={card.uid} layout {...fadeInUp} className="relative w-[72px] h-[104px] sm:w-20 sm:h-28 md:w-24 md:h-36">
                                                <motion.img
                                                    src={cardImageSrc(card)}
                                                    className="earnnpc-card-you w-full h-full rounded-2xl cursor-pointer border border-white/15 bg-white/5 object-contain"
                                                    whileHover={{ y: -6 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => handleCardSelect(card)}
                                                    alt=""
                                                />
                                                <div className="absolute bottom-1 left-1 right-1 text-[10px] text-center bg-black/60 border border-white/10 rounded-md py-[2px]">
                                                    PWR: <span className="font-bold text-cyan-200">{card.power ?? 0}</span>
                                                </div>

                                                {pendingUid === card.uid && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                                    </div>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>

                                <div className="mt-2 text-[11px] opacity-80 text-center">Tip: Draw discards cards. If you draw at 1–1, bonus hand is dealt.</div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Bottom action bar (End Turn centered on mobile and desktop) */}
            {status === "dueling" || status === "redealing" ? (
                <div className="earnnpc-bottom-bar">
                    <div className="earnnpc-bottom-inner">
                        <motion.button
                            onClick={endTurn}
                            whileTap={{ scale: 0.98 }}
                            disabled={status === "redealing"}
                            className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase disabled:opacity-60"
                        >
                            {status === "redealing" ? "Redealing…" : "End Turn"}
                        </motion.button>
                    </div>
                </div>
            ) : null}

            {/* BONUS MODAL */}
            <AnimatePresence>
                {bonusModal && (
                    <motion.div
                        className="fixed inset-0 z-[85] flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setBonusModal(false)}
                    >
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            className="earnnpc-modal earnnpc-modal-tight relative mx-4 rounded-2xl text-center
                         bg-gradient-to-b from-slate-900/70 to-violet-900/35 border border-white/15"
                            initial={{ scale: 0.94, y: 10, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.98, y: -6, opacity: 0 }}
                        >
                            <div className="px-5 pt-4">
                                <div className="text-xs uppercase tracking-widest opacity-80">Bonus Round</div>
                                <div className="mt-2 font-extrabold text-fuchsia-200 earnnpc-modal-title">Bonus Hand Dealt</div>
                            </div>

                            <div className="earnnpc-modal-body px-5 pb-4 mt-3">
                                <p className="text-sm opacity-90">Draw at match point triggered a fresh hand redraw from your NFTs.</p>
                            </div>

                            <div className="px-5 pb-5">
                                <button
                                    className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    onClick={() => setBonusModal(false)}
                                >
                                    Continue
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ROUND RESULT MODAL (FIXED SIZE + INTERNAL SCROLL) */}
            <AnimatePresence>
                {roundModal.open && (
                    <motion.div
                        className="fixed inset-0 z-[75] flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeRoundModal}
                    >
                        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            className="earnnpc-modal earnnpc-modal-tight relative mx-4 rounded-2xl text-center
                         bg-gradient-to-b from-slate-900/60 to-violet-900/30 border border-white/15"
                            initial={{ scale: 0.96, y: 10, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.98, y: -6, opacity: 0 }}
                        >
                            {/* Header (non-scroll) */}
                            <div className="px-5 pt-4">
                                <div className="text-xs uppercase tracking-widest opacity-80">Round Result</div>

                                <div className="mt-2 font-extrabold earnnpc-modal-title">
                                    {roundModal.winner === "self" ? (
                                        <span className="text-emerald-200">You Win the Round</span>
                                    ) : roundModal.winner === "opponent" ? (
                                        <span className="text-rose-200">NPC Wins the Round</span>
                                    ) : isMatchPointDraw("draw") ? (
                                        <span className="text-white">Draw — Bonus Round Triggered</span>
                                    ) : (
                                        <span className="text-white">Draw — Replay Round</span>
                                    )}
                                </div>
                            </div>

                            {/* Body (scrollable) */}
                            <div className="earnnpc-modal-body px-5 pb-4 mt-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left">
                                        <div className="text-[10px] uppercase tracking-widest opacity-70">Your Card</div>
                                        <div className="mt-2 flex items-center gap-3">
                                            <img
                                                src={cardImageSrc(roundModal.yourCard)}
                                                alt=""
                                                className="earnnpc-modal-cardimg w-20 h-28 md:w-24 md:h-36 rounded-xl border border-white/10 bg-black/20 object-contain"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-extrabold truncate">
                                                    {roundModal.yourCard?.name || `CID ${roundModal.yourCard?.cid || "—"}`}
                                                </div>
                                                <div className="mt-1 text-sm opacity-90">
                                                    Power: <span className="font-extrabold text-cyan-200">{roundModal.youPower}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left">
                                        <div className="text-[10px] uppercase tracking-widest opacity-70">NPC Card</div>
                                        <div className="mt-2 flex items-center gap-3">
                                            <img
                                                src={cardImageSrc(roundModal.oppCard)}
                                                alt=""
                                                className="earnnpc-modal-cardimg w-20 h-28 md:w-24 md:h-36 rounded-xl border border-white/10 bg-black/20 object-contain"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-extrabold truncate">
                                                    {roundModal.oppCard?.name || `CID ${roundModal.oppCard?.cid || "—"}`}
                                                </div>
                                                <div className="mt-1 text-sm opacity-90">
                                                    Power: <span className="font-extrabold text-fuchsia-200">{roundModal.npcPower}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Score</div>
                                    <div className="mt-1 text-sm font-extrabold">
                                        You {selfScore} — {npcScore} NPC (first to {rules.roundsToWin})
                                    </div>
                                </div>
                            </div>

                            {/* Footer (non-scroll) */}
                            <div className="px-5 pb-5">
                                <button
                                    className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    onClick={closeRoundModal}
                                >
                                    Continue
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MATCH RESULT MODAL */}
            <AnimatePresence>
                {resultModal.open && (
                    <motion.div
                        className="fixed inset-0 z-[70] flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setResultModal((m) => ({ ...m, open: false }))}
                    >
                        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

                        <motion.div
                            onClick={(e) => e.stopPropagation()}
                            className="earnnpc-modal earnnpc-modal-tight relative mx-4 rounded-2xl text-center
                         bg-gradient-to-b from-fuchsia-900/35 to-violet-900/20 border border-white/15"
                            initial={{ scale: 0.94, y: 8, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.98, y: -6, opacity: 0 }}
                        >
                            <div className="px-5 pt-4">
                                <div className="text-xs uppercase tracking-widest opacity-80">Match Result</div>
                                <div className="mt-2 font-extrabold text-fuchsia-200 earnnpc-modal-title">
                                    {resultModal.payout?.amount > 0 ? "Victory Payout" : "Match Complete"}
                                </div>
                            </div>

                            <div className="earnnpc-modal-body px-5 pb-4 mt-3">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                                    {resultModal.payout?.amount > 0 ? (
                                        <>
                                            <div className="text-[10px] uppercase tracking-widest opacity-70">Reward</div>
                                            <div className="mt-1 text-xl font-extrabold text-cyan-200">+{resultModal.payout.amount} CYBERIO</div>
                                            <div className="mt-2 text-[11px] opacity-80 break-all">TX: {resultModal.payout.txid || "—"}</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-[10px] uppercase tracking-widest opacity-70">No payout</div>
                                            <div className="mt-1 text-sm opacity-90">{resultModal.payout?.reason || "Payout not available."}</div>
                                        </>
                                    )}
                                </div>

                                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Daily progress</div>
                                    <div className="mt-1 text-sm opacity-90">
                                        Earned today:{" "}
                                        <span className="font-bold">{resultModal.payout?.earnedToday ?? rules.earnedToday ?? 0}</span> /{" "}
                                        <span className="font-bold">{resultModal.payout?.dailyCap ?? rules.dailyCap ?? 0}</span>
                                    </div>
                                    <div className="mt-1 text-sm opacity-90">
                                        Remaining today:{" "}
                                        <span className="font-bold">{resultModal.payout?.remainingToday ?? rules.remainingToday ?? 0}</span>
                                    </div>
                                    <div className="mt-1 text-sm opacity-90">
                                        Matches:{" "}
                                        <span className="font-bold">{resultModal.payout?.matchesPlayedToday ?? rules.matchesPlayedToday ?? 0}</span> /{" "}
                                        <span className="font-bold">{resultModal.payout?.matchesPerDay ?? rules.matchesPerDay ?? 10}</span>
                                    </div>
                                    <div className="mt-1 text-sm opacity-90">
                                        Pool: <span className="font-bold">{resultModal.payout?.poolBalance ?? rules.poolBalance ?? 0}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="px-5 pb-5 space-y-3">
                                <button
                                    className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    onClick={() => setResultModal((m) => ({ ...m, open: false }))}
                                >
                                    Close
                                </button>

                                <button
                                    className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    onClick={() => {
                                        setResultModal((m) => ({ ...m, open: false }));
                                        startEarn();
                                    }}
                                >
                                    Play Again
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* INFO MODAL */}
            <AnimatePresence>
                {infoModal.open && (
                    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setInfoModal((m) => ({ ...m, open: false }))} />

                        <motion.div
                            className="earnnpc-modal earnnpc-modal-tight relative mx-4 rounded-2xl text-center
                         bg-gradient-to-b from-slate-800/80 to-slate-700/60 border border-white/15"
                            initial={{ scale: 0.94, y: 8, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.98, y: -6, opacity: 0 }}
                        >
                            <div className="px-5 pt-4">
                                <div className="text-xs uppercase tracking-widest opacity-80">Notice</div>
                                <h3 className="mt-2 font-extrabold text-fuchsia-200 earnnpc-modal-title">{infoModal.title}</h3>
                            </div>

                            <div className="earnnpc-modal-body px-5 pb-4 mt-3">
                                <p className="text-sm opacity-90 whitespace-pre-wrap">{infoModal.message}</p>
                            </div>

                            <div className="px-5 pb-5">
                                <button
                                    className="w-full rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-3 font-bold tracking-[.18em] uppercase"
                                    onClick={() => setInfoModal((m) => ({ ...m, open: false }))}
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
