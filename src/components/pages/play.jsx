import React, { useContext, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { WalletContext } from "../../context/WalletConnect";
import duelfield from "../assets/images/duelfield.jpg";
import backImage from "../assets/images/back.png";
import io from "socket.io-client";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram, // kept (not removed)
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import { SOCKET_URL } from "../../config/endpoints";

// ✅ SPL TOKEN IMPORTS (ADDED + FIXED FOR TOKEN-2022)
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  motion,
  LayoutGroup,
  AnimatePresence,
  useAnimationControls,
} from "framer-motion";
import bs58 from "bs58";

/* assets: legacy monster sprites (fallback) */
function importAll(r) {
  const images = {};
  r.keys().forEach((item) => {
    const key = item.replace("./", "").replace(".webp", "");
    images[key] = r(item);
  });
  return images;
}
const monsterImages = importAll(
  require.context("../assets/images/cards", false, /\.webp$/)
);

// Legacy helper: for non-NFT cid values (numeric/string keys)
const imgSrc = (cid) => monsterImages[String(cid)] || backImage;

/**
 * Unified helper to get the correct IMAGE source for a "card":
 * - If it's a plain string/number → treat as legacy cid → local sprite.
 * - If it's a card object → prefer card.image (NFT), fallback to cid → local sprite.
 */
const cardImageSrc = (cardOrCid) => {
  if (!cardOrCid) return backImage;

  // If raw cid/id
  if (typeof cardOrCid === "string" || typeof cardOrCid === "number") {
    // IMPORTANT: if you pass "back", show back
    if (String(cardOrCid).toLowerCase() === "back") return backImage;
    return imgSrc(cardOrCid);
  }

  // If it's a full card object from backend
  const c = cardOrCid;
  if (c.image && typeof c.image === "string" && c.image.length > 0) {
    return c.image;
  }
  if (c.cid != null) {
    return imgSrc(c.cid);
  }
  return backImage;
};

// =========================
// ✅ ENV (your .env values)
// =========================
const RPC_ENDPOINT =
  process.env.REACT_APP_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

// NOTE: your existing constant name was TREASURY; kept.
// For SPL betting, treat this as TREASURY OWNER (not ATA).
const TREASURY =
  process.env.REACT_APP_TREASURY_ADDRESS ||
  "FtjTzPvSRVCaaM3u5BXKMKjkM8TACsyyuHPgv5YSQLGN";

// ✅ SPL WAGER CONFIG (FROM .env)
// (no placeholder strings; require env to be set)
const WAGER_MINT = process.env.REACT_APP_TOKEN_MINT || "";
const WAGER_DECIMALS = Number(process.env.REACT_APP_TOKEN_DECIMALS ?? 6);

// ✅ UI/LOGIC CAP (default 100k; CRA env must be REACT_APP_*)
const MAX_BET_TOKENS = Number(process.env.REACT_APP_MAX_BET_TOKENS ?? 100000);

// =========================
// ✅ socket / chain
// =========================
const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

/* animations */
const cardHover = { y: -10, rotate: -1.5 };
const cardTap = { scale: 0.96 };
const fieldDrop = { scale: [1, 1.06, 1], transition: { duration: 0.35 } };
const glowWin = {
  boxShadow: [
    "0 0 0px rgba(255,255,255,0)",
    "0 0 36px rgba(255,215,0,0.55)",
    "0 0 0px rgba(255,255,255,0)",
  ],
  transition: { duration: 1.2 },
};
const shakeLose = {
  x: [0, -8, 8, -5, 5, -2, 2, 0],
  transition: { duration: 0.6 },
};
const flipFace = {
  rotateY: [180, 0],
  transition: { duration: 0.45, ease: "easeInOut" },
};
const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

/* modal durations */
const MATCH_RESULT_MS = 4200;
const ROUND_RESULT_MS = 2600;

// =========================
// ✅ helper: detect token program (Tokenkeg vs Token-2022)
// =========================
async function resolveTokenProgramId(connection, mintPk) {
  const info = await connection.getAccountInfo(mintPk);
  if (!info) throw new Error("Mint account not found on chain.");

  const ownerStr = info.owner.toBase58();
  if (ownerStr === TOKEN_2022_PROGRAM_ID.toBase58()) return TOKEN_2022_PROGRAM_ID;
  if (ownerStr === TOKEN_PROGRAM_ID.toBase58()) return TOKEN_PROGRAM_ID;

  // Unknown token program (rare, but be explicit)
  throw new Error(`Unsupported token program for mint. Owner=${ownerStr}`);
}

// ✅ mobile helper (UI only; no game logic changes)
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < breakpoint
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

export default function Play() {
  const { wallet } = useContext(WalletContext);
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  // connection banner
  const [netDown, setNetDown] = useState(false);
  const ignoreDisconnectRef = useRef(false);

  // mode: "quick" | "friendly" | "ranked"
  const [mode, setMode] = useState("quick");

  // negotiation
  const [status, setStatus] = useState("idle");
  const [betAmount, setBetAmount] = useState(1);
  const [opponent, setOpponent] = useState("");
  const [isFirst, setIsFirst] = useState(false);
  const [negotiation, setNegotiation] = useState(null);
  const [selfConfirmed, setSelfConfirmed] = useState(false);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [oppCountdown, setOppCountdown] = useState(null);

  // duel state
  const [selfCards, setSelfCards] = useState([]);
  const [opponentCards, setOpponentCards] = useState([]);
  const [selfFieldCard, setSelfFieldCard] = useState(null);
  const [opponentFieldCard, setOpponentFieldCard] = useState(null);
  const [selfEndedTurn, setSelfEndedTurn] = useState(false);
  const [opponentEndedTurn, setOpponentEndedTurn] = useState(false);

  // overlays + scoring
  const [reveal, setReveal] = useState(false);
  const [fighting, setFighting] = useState(false);
  const [selfScore, setSelfScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [roundWinner, setRoundWinner] = useState(null);
  const [bonusModal, setBonusModal] = useState(false);
  const [matchOver, setMatchOver] = useState(false);

  // reconnect UX (opponent)
  const [oppGone, setOppGone] = useState(false);
  const [oppReconnectSeconds, setOppReconnectSeconds] = useState(null);

  // round timer (server-driven)
  const [roundSecondsLeft, setRoundSecondsLeft] = useState(null);

  // Phantom confirm UX
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [txError, setTxError] = useState("");

  // MATCH result modal
  const [resultModal, setResultModal] = useState({
    open: false,
    winner: "",
    loser: "",
    forfeit: false,
  });
  const [resultPct, setResultPct] = useState(100);
  const [resultTicker, setResultTicker] = useState(null);

  // ROUND result modal
  const [roundModal, setRoundModal] = useState({
    open: false,
    outcome: "draw",
  });
  const [roundPct, setRoundPct] = useState(100);
  const [roundTicker, setRoundTicker] = useState(null);

  // Info modal (replaces alert)
  const [infoModal, setInfoModal] = useState({
    open: false,
    title: "",
    message: "",
  });
  const openInfo = (title, message) =>
    setInfoModal({ open: true, title, message });

  // pending selection (ACK-based)
  const [pendingUid, setPendingUid] = useState(null);
  const [pendingCid, setPendingCid] = useState(null);

  // ✅ FIX: pending failsafe so you never get stuck unable to click
  const pendingTimerRef = useRef(null);
  const clearPending = () => {
    setPendingUid(null);
    setPendingCid(null);
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  // ✅ FIX: store last played full card (for reveal if backend only returns uid/cid)
  const lastPlayedCardRef = useRef(null);

  // retry-safe escrow
  const [lastEscrowId, setLastEscrowId] = useState(null);

  const selfFieldFx = useAnimationControls();
  const oppFieldFx = useAnimationControls();

  // store cards for VS overlay
  const [lastReveal, setLastReveal] = useState({
    yourCard: null,
    oppCard: null,
    winner: null,
  });

  // =========================
  // CYBERPUNK THEME HELPERS
  // =========================
  const CY = {
    glass:
      "bg-black/40 backdrop-blur-md border border-white/10 shadow-[0_0_40px_rgba(0,255,255,0.10)]",
    neonFrame:
      "border border-cyan-300/30 shadow-[0_0_28px_rgba(0,255,255,0.14)]",
    neonPink:
      "shadow-[0_0_28px_rgba(236,72,153,0.16)] border border-pink-300/25",
    neonYellow:
      "shadow-[0_0_28px_rgba(250,204,21,0.16)] border border-yellow-300/25",
    hudText: "text-white/90",
    mono: "font-silkscreen",
  };

  // ✅ FIX: force readable text color even if .rpg-button sets color: #000
  function CyberButton({ className = "", ...props }) {
    return (
      <button
        {...props}
        className={[
          "rpg-button",
          "relative overflow-hidden",
          "border border-cyan-300/30",
          "bg-gradient-to-b from-cyan-400/15 via-white/5 to-fuchsia-500/10",
          "shadow-[0_0_26px_rgba(0,255,255,0.18)]",
          "hover:shadow-[0_0_36px_rgba(236,72,153,0.20)]",
          "transition",
          "text-white", // ✅ force text visible
          "before:content-[''] before:absolute before:inset-0 before:pointer-events-none",
          "before:bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,255,0.18),transparent_35%),radial-gradient(circle_at_80%_60%,rgba(236,72,153,0.14),transparent_45%)]",
          className,
        ].join(" ")}
      />
    );
  }

  useEffect(() => {
    if (wallet) socket.emit("hello", { wallet });
  }, [wallet]);

  useEffect(() => {
    // connection events (UI banner)
    const onConnect = () => setNetDown(false);
    const onDisconnect = () => {
      if (ignoreDisconnectRef.current) return;
      setNetDown(true);
    };
    const onConnectErr = () => setNetDown(true);
    const onReconnecting = () => setNetDown(true);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectErr);
    socket.io.on("reconnect_attempt", onReconnecting);
    socket.io.on("reconnect", onConnect);

    // core signals
    socket.on("insufficientDeck", ({ you, need }) => {
      openInfo(
        "Deck Too Small",
        `You need at least ${need} cards to duel. You currently have ${you}.`
      );
      setStatus("idle");
    });

    // Quick match requires NON-FREE cards
    socket.on("paidCardsRequired", ({ need }) => {
      openInfo(
        "Paid Cards Required",
        `Quick Match requires at least ${need} non-free cards. Free starter cards can only be used in Friendly matches.`
      );
      setStatus("idle");
    });

    socket.on("matchFound", ({ opponentWallet, isFirst, mode: m }) => {
      setMode(m || "quick");
      setOpponent(opponentWallet);
      setIsFirst(isFirst);
      setStatus("matchFound");
      setNegotiation(null);
      setOppCountdown(null);
      setSelfConfirmed(false);
      setOpponentConfirmed(false);
      setMatchOver(false);
      setSelfScore(0);
      setOpponentScore(0);
      setSelfCards([]);
      setOpponentCards([]);
      setSelfFieldCard(null);
      setOpponentFieldCard(null);
      setRoundWinner(null);
      setOppGone(false);
      setOppReconnectSeconds(null);
      setRoundSecondsLeft(null);
      setIsSendingTx(false);
      setTxError("");
      clearPending();
      lastPlayedCardRef.current = null;
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // betting-only signals
    socket.on("proposalReceived", ({ opponentWallet, bet }) => {
      setNegotiation({ opponentWallet, bet });
      setStatus("negotiation");
    });
    socket.on("acceptProposal", ({ bet }) => {
      setBetAmount(bet);
      setStatus("confirming");
      setIsSendingTx(false);
      setTxError("");
    });
    socket.on("opponentConfirmed", () => setOpponentConfirmed(true));
    socket.on("awaitingOpponentPayment", ({ secondsLeft }) =>
      setOppCountdown(secondsLeft)
    );

    socket.on("paymentError", ({ reason }) => {
      openInfo("Payment Error", `${reason}`);
      setStatus("idle");
      setNegotiation(null);
      setOppCountdown(null);
      setSelfConfirmed(false);
      setOpponentConfirmed(false);
      setMatchOver(false);
      setRoundSecondsLeft(null);
      setSelfCards([]);
      setOpponentCards([]);
      setSelfFieldCard(null);
      setOpponentFieldCard(null);
      setRoundWinner(null);
      setIsSendingTx(false);
      setTxError("");
      clearPending();
      lastPlayedCardRef.current = null;
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // ✅ REFUND HANDLER (keeps your old lamports flow, also supports SPL amountRaw/decimals)
    socket.on("refundProcessed", ({ lamports, amountRaw, decimals }) => {
      if (typeof amountRaw === "number" && typeof decimals === "number") {
        const tokens = amountRaw / Math.pow(10, decimals);
        openInfo(
          "Refunded",
          `Opponent didn't confirm. Refunded ${tokens.toFixed(2)} tokens.`
        );
      } else {
        openInfo(
          "Refunded",
          `Opponent didn't confirm. Refunded ${(lamports / 1e9).toFixed(2)} SOL.`
        );
      }

      setStatus("idle");
      setNegotiation(null);
      setOppCountdown(null);
      setSelfConfirmed(false);
      setOpponentConfirmed(false);
      setMatchOver(false);
      setRoundSecondsLeft(null);
      setSelfCards([]);
      setOpponentCards([]);
      setSelfFieldCard(null);
      setOpponentFieldCard(null);
      setRoundWinner(null);
      setIsSendingTx(false);
      setTxError("");
      clearPending();
      lastPlayedCardRef.current = null;
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // duel start / bonus round hand
    socket.on("startDuel", ({ selfCards, opponentCards, bonusRound }) => {
      // selfCards here are NFTs from DB: [{ uid, cid, image, name, ... }]
      setSelfCards(selfCards || []);
      setOpponentCards(opponentCards || []);
      setStatus("dueling");
      setReveal(false);
      setFighting(false);
      setSelfEndedTurn(false);
      setOpponentEndedTurn(false);
      setSelfFieldCard(null);
      setOpponentFieldCard(null);
      setRoundWinner(null);
      setRoundSecondsLeft(null);
      setIsSendingTx(false);
      setTxError("");
      clearPending();
      lastPlayedCardRef.current = null;

      if (bonusRound) setBonusModal(true);
      selfFieldFx.stop();
      oppFieldFx.stop();
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // resume
    socket.on("resumeState", (snap) => {
      setStatus(snap.status === "dueling" ? "dueling" : "matchFound");
      setSelfScore(snap.selfScore);
      setOpponentScore(snap.opponentScore);
      setSelfCards(snap.selfCards || []);
      setOpponentCards((snap.opponentCards || []).map(() => "back"));
      setSelfFieldCard(snap.selfFieldCard || null);
      setOpponentFieldCard(snap.opponentFieldCard || null);
      setSelfEndedTurn(!!snap.youEnded);
      setOpponentEndedTurn(!!snap.oppEnded);
      setReveal(false);
      setFighting(false);
      setRoundWinner(null);
      setOppGone(false);
      setOppReconnectSeconds(null);
      setRoundSecondsLeft(snap.roundSecondsLeft ?? null);
      setIsSendingTx(false);
      setTxError("");
      clearPending();
      selfFieldFx.stop();
      oppFieldFx.stop();
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // timer
    socket.on("roundTimerTick", ({ secondsLeft }) =>
      setRoundSecondsLeft(secondsLeft)
    );

    // ACK path: move card from hand → field with full NFT data
    socket.on("ackPlayed", ({ uid, cid }) => {
      setSelfCards((prev) => {
        const full = prev.find((c) => c.uid === uid);
        if (full) {
          setSelfFieldCard(full);
          lastPlayedCardRef.current = full;
        } else if (lastPlayedCardRef.current?.uid === uid) {
          // still safe
          setSelfFieldCard(lastPlayedCardRef.current);
        } else {
          // fallback if somehow not found
          setSelfFieldCard({ uid, cid });
          lastPlayedCardRef.current = { uid, cid };
        }
        return prev.filter((c) => c.uid !== uid);
      });
      clearPending();
    });

    socket.on("rejectPlayed", ({ reason }) => {
      clearPending();
    });

    // opponent actions
    socket.on("opponentPlayedCard", () => {
      // keep back while waiting for reveal (server should later send opp card details)
      setOpponentFieldCard("back");
      setOpponentCards((prev) => {
        if (!prev?.length) return prev;
        const next = [...prev];
        const idx = next.findIndex((x) => x === "back");
        if (idx !== -1) next.splice(idx, 1);
        return next;
      });
    });

    // ✅ IMPORTANT FIX:
    // If server sends only cid here, we store as object { cid } (NOT "back").
    // If your backend can send { cid, image }, this will show the NFT immediately.
    socket.on("revealOpponentCard", (payload) => {
      if (payload && typeof payload === "object") {
        // expected: { cid, image?, uid?, name?, ... }
        setOpponentFieldCard(payload);
      } else {
        // cid number/string
        setOpponentFieldCard({ cid: payload });
      }
    });

    socket.on("opponentEndedTurn", () => setOpponentEndedTurn(true));

    // round result
    socket.on("roundResolved", ({ yourCard, oppCard, winner }) => {
      setReveal(true);
      setFighting(true);

      // ✅ IMPORTANT FIX:
      // Enrich yourCard with your NFT image if backend only returns uid/cid
      let resolvedYour = yourCard || null;
      if (resolvedYour && (!resolvedYour.image || resolvedYour.image.length === 0)) {
        const played = lastPlayedCardRef.current;
        if (played && (played.uid === resolvedYour.uid || played.cid === resolvedYour.cid)) {
          resolvedYour = played;
        }
      }
      if (resolvedYour) setSelfFieldCard(resolvedYour);

      // ✅ IMPORTANT FIX:
      // Do NOT overwrite opponent card to "back". Keep full oppCard object if provided.
      // To show NFT, backend must include oppCard.image (recommended).
      let resolvedOpp = oppCard || null;
      if (resolvedOpp) setOpponentFieldCard(resolvedOpp);

      setRoundWinner(winner);

      setLastReveal({
        yourCard: resolvedYour,
        oppCard: resolvedOpp,
        winner: winner || null,
      });

      if (winner === "self") {
        selfFieldFx.start(glowWin);
        oppFieldFx.start(shakeLose);
      } else if (winner === "opponent") {
        oppFieldFx.start(glowWin);
        selfFieldFx.start(shakeLose);
      } else {
        selfFieldFx.start(fieldDrop);
        oppFieldFx.start(fieldDrop);
      }

      const outcome =
        winner === "self" ? "self" : winner === "opponent" ? "opponent" : "draw";
      showRoundModal(outcome);

      setTimeout(() => {
        setTimeout(() => {
          setFighting(false);
          setTimeout(() => {
            setReveal(false);
            setTimeout(() => {
              setRoundWinner(null);
              setSelfEndedTurn(false);
              setOpponentEndedTurn(false);
              setSelfFieldCard(null);
              setOpponentFieldCard(null);
              selfFieldFx.stop();
              oppFieldFx.stop();
              setLastReveal((lr) => ({ ...lr, winner: null }));
              lastPlayedCardRef.current = null;
            }, 400);
          }, 400);
        }, 1600);
      }, 400);
    });

    socket.on("scoreUpdate", ({ selfScore, opponentScore }) => {
      setSelfScore(selfScore);
      setOpponentScore(opponentScore);
    });

    // disconnect/reconnect (opponent)
    socket.on("opponentDisconnected", () => {
      setOppGone(true);
      setOppReconnectSeconds(null);
    });
    socket.on("opponentReconnectCountdown", ({ secondsLeft }) => {
      setOppGone(true);
      setOppReconnectSeconds(secondsLeft);
    });
    socket.on("opponentReconnected", () => {
      setOppGone(false);
      setOppReconnectSeconds(null);
    });

    // match result
    socket.on("duelResult", ({ winner, loser, forfeit }) => {
      setMatchOver(true);
      setStatus("idle");
      setResultModal({ open: true, winner, loser, forfeit: !!forfeit });
      animateMatchResult();
    });

    const onCanceled = () => setStatus("idle");
    socket.on("searchCanceled", onCanceled);

    return () => {
      socket.removeAllListeners();
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect");
      socket.off("searchCanceled", onCanceled);
      if (resultTicker) cancelAnimationFrame(resultTicker);
      if (roundTicker) cancelAnimationFrame(roundTicker);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, selfFieldFx, oppFieldFx]);

  // UI timers
  function animateMatchResult() {
    setResultPct(100);
    if (resultTicker) cancelAnimationFrame(resultTicker);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / MATCH_RESULT_MS) * 100);
      setResultPct(pct);
      if (elapsed < MATCH_RESULT_MS) {
        const id = requestAnimationFrame(tick);
        setResultTicker(id);
      } else {
        setResultModal((m) => ({ ...m, open: false }));
        setResultTicker(null);
      }
    };
    const id = requestAnimationFrame(tick);
    setResultTicker(id);
  }
  function showRoundModal(outcome) {
    setRoundModal({ open: true, outcome });
    setRoundPct(100);
    if (roundTicker) cancelAnimationFrame(roundTicker);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / ROUND_RESULT_MS) * 100);
      setRoundPct(pct);
      if (elapsed < ROUND_RESULT_MS) {
        const id = requestAnimationFrame(tick);
        setRoundTicker(id);
      } else {
        setRoundModal((m) => ({ ...m, open: false }));
        setRoundTicker(null);
      }
    };
    const id = requestAnimationFrame(tick);
    setRoundTicker(id);
  }

  // actions
  const findMatch = () => {
    if (!wallet)
      return openInfo("Wallet Required", "🔌 Connect your wallet first.");
    socket.emit("findMatch", { wallet, mode, bet: betAmount });
    setStatus("searching");
  };

  const cancelFindMatch = () => {
    ignoreDisconnectRef.current = true;
    socket.emit("cancelFindMatch");
    setTimeout(() => (ignoreDisconnectRef.current = false), 200);
    setStatus("idle");
  };

  // betting-only actions
  const sendOffer = () => {
    if (mode !== "quick") return;
    if (status === "confirming" || selfConfirmed) return;
    socket.emit("sendBetProposal", { bet: betAmount });
    setStatus("proposing");
  };

  const acceptProposal = () => {
    if (!negotiation) return;
    setBetAmount(negotiation.bet);
    socket.emit("acceptProposal", { bet: negotiation.bet });
    setNegotiation(null);
    setStatus("confirming");
    setTxError("");
  };

  const counterProposal = () => {
    if (mode !== "quick") return;
    if (status === "confirming" || selfConfirmed) return;
    socket.emit("sendBetProposal", { bet: betAmount });
    setNegotiation(null);
    setStatus("proposing");
  };

  // ✅ SPL TOKEN BET CONFIRM (INTEGRATED; FIXED FOR TOKEN-2022; NO OTHER LOGIC REMOVED)
  const confirmMatch = async () => {
    if (mode !== "quick") return;
    try {
      if (isSendingTx) return;
      setIsSendingTx(true);
      setTxError("");

      if (!WAGER_MINT) {
        setTxError("Token mint is not set. Please configure REACT_APP_TOKEN_MINT.");
        setIsSendingTx(false);
        return;
      }

      // cap safety (UI + tx)
      if (Number(betAmount) > MAX_BET_TOKENS) {
        setTxError(`Max wager is ${MAX_BET_TOKENS} tokens.`);
        setIsSendingTx(false);
        return;
      }

      const connection = new Connection(RPC_ENDPOINT, "confirmed");
      const provider = window.solana;
      if (!provider) {
        setTxError("Wallet not found. Please connect a Solana wallet.");
        setIsSendingTx(false);
        return;
      }
      if (!wallet) {
        setTxError("Your wallet address is missing.");
        setIsSendingTx(false);
        return;
      }

      // ✅ Use provider.publicKey for on-chain pubkeys.
      const ownerPk = provider.publicKey;
      if (!ownerPk) {
        setTxError("Wallet publicKey not available. Please reconnect wallet.");
        setIsSendingTx(false);
        return;
      }

      const escrowId =
        lastEscrowId ||
        crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const mintPk = new PublicKey(WAGER_MINT);
      const treasuryOwnerPk = new PublicKey(TREASURY);

      // ✅ Detect token program for this mint (Tokenkeg vs Token-2022)
      const tokenProgramId = await resolveTokenProgramId(connection, mintPk);

      // SPL raw amount
      const betAmountRaw = Math.round(
        Number(betAmount) * Math.pow(10, WAGER_DECIMALS)
      );

      if (!Number.isFinite(betAmountRaw) || betAmountRaw <= 0) {
        setTxError("Invalid wager amount.");
        setIsSendingTx(false);
        return;
      }

      // ✅ ATAs must be derived with the SAME token program id
      const fromAta = await getAssociatedTokenAddress(
        mintPk,
        ownerPk,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const treasuryAta = await getAssociatedTokenAddress(
        mintPk,
        treasuryOwnerPk,
        false,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction();

      // ensure sender ATA exists (payer = user)
      const fromInfo = await connection.getAccountInfo(fromAta);
      if (!fromInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            ownerPk, // payer
            fromAta,
            ownerPk,
            mintPk,
            tokenProgramId, // ✅ IMPORTANT
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // ensure treasury ATA exists (payer = user)
      const treasuryInfo = await connection.getAccountInfo(treasuryAta);
      if (!treasuryInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            ownerPk, // payer
            treasuryAta,
            treasuryOwnerPk,
            mintPk,
            tokenProgramId, // ✅ IMPORTANT
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // transferChecked (uses detected token program)
      tx.add(
        createTransferCheckedInstruction(
          fromAta,
          mintPk,
          treasuryAta,
          ownerPk,
          betAmountRaw,
          WAGER_DECIMALS,
          [],
          tokenProgramId // ✅ IMPORTANT
        )
      );

      // memo escrowId
      tx.add(createMemoInstruction(escrowId));

      tx.feePayer = ownerPk;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      // =========================
      // ✅ FIX: avoid legacy populate simulateTransaction crash
      // - Prefer signAndSendTransaction (wallet handles sending)
      // - Fallback: signTransaction + sendRawTransaction
      // - Hard guard signed tx return (prevents undefined -> numRequiredSignatures crash)
      // =========================
      let txid = null;

      if (typeof provider.signAndSendTransaction === "function") {
        const res = await provider.signAndSendTransaction(tx, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
        txid = res?.signature || res;
      } else {
        const signed = await provider.signTransaction(tx);

        if (!signed || typeof signed.serialize !== "function") {
          throw new Error(
            "Wallet did not return a signed transaction. Please reconnect your wallet and try again."
          );
        }

        // (No simulateTransaction here: this is what was triggering numRequiredSignatures in your stack)
        txid = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      }

      if (!txid || typeof txid !== "string") {
        throw new Error("Failed to obtain transaction signature (txid).");
      }

      await connection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setLastEscrowId(escrowId);

      // ✅ Keep your socket event name; just send SPL fields
      socket.emit("confirmDuel", {
        wallet,
        txid,

        // Old SOL payload kept if your server still reads it (safe):
        betLamports: null,

        // New SPL payload (primary):
        betAmountRaw,
        betMint: WAGER_MINT,
        betDecimals: WAGER_DECIMALS,
        escrowId,

        // helpful debug (optional on backend)
        tokenProgramId: tokenProgramId.toBase58(),
        treasuryAta: treasuryAta.toBase58(),
        fromAta: fromAta.toBase58(),
      });

      setSelfConfirmed(true);
      setStatus("confirming");
      setIsSendingTx(false);
      setTxError("");
    } catch (err) {
      console.error("Transaction failed:", err);
      let msg =
        "Transaction failed. You can try again (we'll keep your escrowId so you won't be charged twice).";
      if (err?.message) msg = err.message;
      setTxError(msg);
      setSelfConfirmed(false);
      setIsSendingTx(false);
      if (status !== "confirming") setStatus("confirming");
    }
  };

  // play / end turn
  const handleCardSelect = (card) => {
    if (matchOver || reveal || fighting) return;
    if (selfFieldCard) return;
    if (pendingUid) return;
    if (status !== "dueling") return;

    // optimistic “pending”
    setPendingUid(card.uid);
    setPendingCid(card.cid);

    // ✅ FIX: keep last played full NFT card so reveal can show image even if server returns uid/cid only
    lastPlayedCardRef.current = card;

    // ✅ FIX: failsafe unlock so you never get stuck unable to pick again
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      clearPending();
    }, 2500);

    socket.emit("playCard", { uid: card.uid, cid: card.cid });
  };

  const handleEndTurn = () => {
    if (matchOver) return;
    if (!selfFieldCard)
      return openInfo("Play a Card", "Select a card to play!");
    setSelfEndedTurn(true);
    socket.emit("endTurn", { uid: selfFieldCard.uid, cid: selfFieldCard.cid });
  };

  // timers
  const timerPct = useMemo(() => {
    if (roundSecondsLeft == null) return 0;
    const pct = (roundSecondsLeft / 30) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [roundSecondsLeft]);

  const isYouMatchWinner = resultModal.open && resultModal.winner === wallet;

  // ✅ FIX: force readable text color on chips too
  function ModeChip({ active, children, disabled, onClick }) {
    return (
      <button
        disabled={disabled}
        onClick={onClick}
        className={`px-3 sm:px-4 py-2 rounded-xl border text-sm transition relative overflow-hidden
          text-white ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02]"}
          ${active
            ? "bg-cyan-400/10 border-cyan-300/40 shadow-[0_0_18px_rgba(0,255,255,0.18)]"
            : "bg-white/5 border-white/10 hover:border-fuchsia-300/30 hover:shadow-[0_0_18px_rgba(236,72,153,0.14)]"
          }`}
        title={disabled ? "Coming soon" : ""}
      >
        <span className="pointer-events-none absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,255,0.16),transparent_35%),radial-gradient(circle_at_80%_60%,rgba(236,72,153,0.14),transparent_45%)]" />
        <span className="relative">{children}</span>
      </button>
    );
  }

  const powerText = (c) =>
    c && (c.power ?? c.atk ?? c.strength ?? c.value) != null
      ? String(c.power ?? c.atk ?? c.strength ?? c.value)
      : "?";

  const isWinnerSelf = lastReveal.winner === "self";
  const isWinnerOpp = lastReveal.winner === "opponent";

  // ✅ responsive sizing (UI only)
  const HAND_CARD_W = "w-[76px] xs:w-[84px] sm:w-24 md:w-24";
  const HAND_CARD_H = "h-[110px] xs:h-[122px] sm:h-36 md:h-36";
  const PILE_CARD_W = "w-[60px] xs:w-[68px] sm:w-24";
  const PILE_CARD_H = "h-[88px] xs:h-[100px] sm:h-36";
  const FIELD_W = "w-[110px] xs:w-[122px] sm:w-32";
  const FIELD_H = "h-[152px] xs:h-[168px] sm:h-44";

  const isLobby = status !== "dueling";
  const showTopHud =
    status === "dueling" ||
    status === "matchFound" ||
    status === "confirming" ||
    status === "negotiation" ||
    status === "proposing";

  return (
    <div
      className={[
        "relative w-full min-h-[100svh] overflow-hidden font-silkscreen",
        "touch-pan-y",
        "text-white", // ✅ ensure default text is readable
      ].join(" ")}
    >
      {/* Cyberpunk decorative background layers */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_top,rgba(0,255,255,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.10),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-35 [background:repeating-linear-gradient(135deg,rgba(0,255,255,0.06)_0px,rgba(0,255,255,0.06)_2px,transparent_2px,transparent_8px)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-20 [background:repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_5px)]" />

      {/* BACK BUTTON */}
      <button
        onClick={() => navigate(-1)}
        className="fixed z-[70] right-3 top-3 sm:right-4 sm:top-4 inline-flex items-center gap-1 px-3 py-2 rounded-md bg-black/55 hover:bg-black/65 border border-cyan-300/30 text-cyan-100 text-xs sm:text-sm shadow-[0_0_18px_rgba(0,255,255,0.16)]"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
      >
        ← Back
      </button>

      {/* NET BANNER */}
      <AnimatePresence>
        {netDown && (
          <motion.div
            className="fixed top-0 left-0 right-0 z-[80] bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white text-xs sm:text-sm text-center py-2 shadow-[0_0_22px_rgba(0,255,255,0.18)]"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            Network connection lost. Attempting to reconnect…
          </motion.div>
        )}
      </AnimatePresence>

      <img
        src={duelfield}
        alt=""
        className="absolute inset-0 w-full h-full object-cover z-[-2] saturate-125 contrast-125"
      />
      <div className="absolute inset-0 bg-black/75 z-[-1]" />

      {/* Top HUD ribbon */}
      {showTopHud && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[60] top-2 sm:top-3 w-[92%] max-w-3xl"
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          <div className="rounded-2xl sm:rounded-full px-3 sm:px-4 py-2 text-cyan-100 text-[11px] sm:text-sm border border-cyan-300/25 bg-black/45 backdrop-blur-md shadow-[0_0_24px_rgba(0,255,255,0.14)] flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span className="opacity-80">Mode:</span>
            <span className="font-semibold text-white">
              {mode === "friendly"
                ? "Friendly"
                : mode === "quick"
                  ? "Quick"
                  : "Ranked"}
            </span>
            <span className="opacity-40 hidden sm:inline">•</span>
            <span className="opacity-80">Status:</span>
            <span className="font-semibold capitalize text-fuchsia-200">
              {status}
            </span>
          </div>
        </div>
      )}

      {/* LEFT HUD (only when it helps) */}
      {(status === "dueling" ||
        status === "matchFound" ||
        status === "confirming") && (
          <div
            className="fixed z-[60] left-3 sm:left-4 top-[72px] sm:top-[72px] text-white"
            style={{ marginTop: "env(safe-area-inset-top)" }}
          >
            <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md px-3 py-2 shadow-[0_0_22px_rgba(0,255,255,0.12)] max-w-[75vw] sm:max-w-none">
              <div className="flex flex-col gap-0.5 text-[11px] sm:text-sm">
                <p className="text-cyan-100/90">
                  Your: <span className="text-white">{selfScore}</span>
                </p>
                <p className="text-fuchsia-100/90">
                  Opp: <span className="text-white">{opponentScore}</span>
                </p>
                {oppGone && (
                  <p className="text-yellow-300">
                    Opponent disconnected
                    {oppReconnectSeconds != null
                      ? ` — ${oppReconnectSeconds}s`
                      : ""}
                  </p>
                )}
                {status === "dueling" && roundSecondsLeft != null && (
                  <p className="text-yellow-300">Timer: {roundSecondsLeft}s</p>
                )}
              </div>
            </div>
          </div>
        )}

      {/* ROUND RESULT MODAL */}
      <AnimatePresence>
        {roundModal.open && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden border
                ${roundModal.outcome === "self"
                  ? "bg-gradient-to-b from-cyan-500/15 to-cyan-400/5 border-cyan-300/45 shadow-[0_0_44px_rgba(0,255,255,0.16)]"
                  : roundModal.outcome === "opponent"
                    ? "bg-gradient-to-b from-fuchsia-500/15 to-fuchsia-400/5 border-fuchsia-300/45 shadow-[0_0_44px_rgba(236,72,153,0.16)]"
                    : "bg-gradient-to-b from-slate-600/20 to-slate-400/10 border-white/15 shadow-[0_0_44px_rgba(148,163,184,0.14)]"
                } text-white`}
              initial={{ scale: 0.92, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              <div
                className={`absolute -inset-1 rounded-3xl blur-2xl opacity-25 ${roundModal.outcome === "self"
                    ? "bg-cyan-300"
                    : roundModal.outcome === "opponent"
                      ? "bg-fuchsia-300"
                      : "bg-white"
                  }`}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest opacity-80">
                  <span>Round Result</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-80">Neon Protocol</span>
                </div>

                <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold drop-shadow flex items-center justify-center gap-2">
                  {roundModal.outcome === "self" && (
                    <>
                      <span>⚡</span>
                      <span className="text-cyan-200">You Win the Round</span>
                      <span>🧬</span>
                    </>
                  )}
                  {roundModal.outcome === "opponent" && (
                    <>
                      <span>☠️</span>
                      <span className="text-fuchsia-200">
                        Opponent Wins the Round
                      </span>
                      <span>⚡</span>
                    </>
                  )}
                  {roundModal.outcome === "draw" && (
                    <>
                      <span>⟐</span>
                      <span className="text-slate-100">Round is a Draw</span>
                      <span>⟐</span>
                    </>
                  )}
                </h2>

                <p className="mt-2 text-sm opacity-90">
                  {roundModal.outcome === "self"
                    ? "Your signal cut through the noise."
                    : roundModal.outcome === "opponent"
                      ? "Counter-hack detected—recalibrate for the next cycle."
                      : "Deadlock in the grid. Run it again."}
                </p>

                <div className="mt-5">
                  <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-2 ${roundModal.outcome === "self"
                          ? "bg-cyan-300"
                          : roundModal.outcome === "opponent"
                            ? "bg-fuchsia-300"
                            : "bg-white/60"
                        }`}
                      style={{ width: `${roundPct}%` }}
                      initial={false}
                      animate={{ width: `${roundPct}%` }}
                      transition={{
                        type: "tween",
                        ease: "linear",
                        duration: 0.2,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] opacity-70">
                    Continuing the duel…
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MATCH RESULT MODAL */}
      <AnimatePresence>
        {resultModal.open && (
          <motion.div
            className="fixed inset-0 z-[95] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden ${isYouMatchWinner
                  ? "bg-gradient-to-b from-cyan-500/16 to-cyan-400/6"
                  : "bg-gradient-to-b from-fuchsia-500/16 to-fuchsia-400/6"
                } border ${isYouMatchWinner
                  ? "border-cyan-300/45 shadow-[0_0_52px_rgba(0,255,255,0.18)]"
                  : "border-fuchsia-300/45 shadow-[0_0_52px_rgba(236,72,153,0.18)]"
                } text-white`}
              initial={{ scale: 0.92, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              <div
                className={`absolute -inset-1 rounded-3xl blur-2xl opacity-30 ${isYouMatchWinner ? "bg-cyan-300" : "bg-fuchsia-300"
                  }`}
                aria-hidden
              />
              <div className="relative">
                <div className="text-xs tracking-widest uppercase opacity-80">
                  {resultModal.forfeit ? "Match Result · Forfeit" : "Match Result"}
                </div>
                <h2
                  className={`mt-2 text-2xl sm:text-3xl font-extrabold drop-shadow ${isYouMatchWinner ? "text-cyan-200" : "text-fuchsia-200"
                    }`}
                >
                  {resultModal.forfeit
                    ? isYouMatchWinner
                      ? "Victory by Forfeit"
                      : "Defeat by Forfeit"
                    : isYouMatchWinner
                      ? "Victory"
                      : "Defeat"}
                </h2>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="px-3 py-2 rounded-lg bg-black/35 border border-white/10">
                    <div className="text-[10px] uppercase opacity-70">Winner</div>
                    <div className="text-sm font-semibold break-all">
                      {shortPk(resultModal.winner)}
                    </div>
                  </div>
                  <div className="text-xs opacity-80 hidden sm:block">vs</div>
                  <div className="px-3 py-2 rounded-lg bg-black/35 border border-white/10">
                    <div className="text-[10px] uppercase opacity-70">Loser</div>
                    <div className="text-sm font-semibold break-all">
                      {shortPk(resultModal.loser)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 h-6">
                  {isYouMatchWinner ? (
                    <div className="text-lg">⚡ 🏆 ⚡</div>
                  ) : (
                    <div className="text-lg">⛓️ 💔 ⛓️</div>
                  )}
                </div>

                <div className="mt-5">
                  <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-2 ${isYouMatchWinner ? "bg-cyan-300" : "bg-fuchsia-300"
                        }`}
                      style={{ width: `${resultPct}%` }}
                      initial={false}
                      animate={{ width: `${resultPct}%` }}
                      transition={{
                        type: "tween",
                        ease: "linear",
                        duration: 0.2,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] opacity-70">
                    Closing in a moment…
                  </div>
                </div>

                <CyberButton
                  onClick={() => setResultModal((m) => ({ ...m, open: false }))}
                  className="mt-4 w-full"
                >
                  Close
                </CyberButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LayoutGroup>
        {/* =========================
            ✅ LAYOUT SWITCH
            - Lobby screens: TRUE center (horizontal + vertical)
            - Duel screen: ✅ now scroll container + FIXED bottom End Turn bar
           ========================= */}
        <div className="relative z-10 h-[100svh]">
          {/* LOBBY WRAPPER (centers your match card + searching card) */}
          {isLobby && (
            <div
              className="h-full overflow-y-auto flex items-center justify-center px-3 sm:px-4"
              style={{
                paddingTop: `calc(${showTopHud ? "76px" : "20px"} + env(safe-area-inset-top))`,
                paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
              }}
            >
              <div className="w-full flex items-center justify-center">
                <div className="w-full max-w-5xl flex flex-col items-center">
                  {/* Header */}
                  <motion.h1
                    className="text-2xl sm:text-3xl md:text-5xl font-bold mb-5 sm:mb-6 text-cyan-100 drop-shadow-[0_0_18px_rgba(0,255,255,0.22)] text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    ⚔️ Duel Arena
                  </motion.h1>

                  {/* MODE SELECTOR (IDLE) */}
                  {status === "idle" && (
                    <motion.div
                      className="w-full max-w-xl mx-auto rounded-2xl border border-cyan-300/20 bg-black/45 p-5 sm:p-6 shadow-[0_0_46px_rgba(0,255,255,0.12)] backdrop-blur-md"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 140, damping: 18 }}
                    >
                      <div className="text-left">
                        <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200">
                          Choose Your Path
                        </div>
                        <div className="text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow">
                          Seek a Worthy Opponent
                        </div>
                        <p className="mt-1 text-sm opacity-90">
                          Quick Match uses betting, Friendly has no betting. Ranked is coming soon.
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 justify-center">
                        <ModeChip
                          active={mode === "quick"}
                          onClick={() => setMode("quick")}
                        >
                          ⚡ Quick Match
                        </ModeChip>
                        <ModeChip
                          active={mode === "friendly"}
                          onClick={() => setMode("friendly")}
                        >
                          🤝 Friendly
                        </ModeChip>
                        <ModeChip active={mode === "ranked"} disabled onClick={() => { }}>
                          🏅 Ranked (Soon)
                        </ModeChip>
                      </div>

                      {/* Bet slider only for quick */}
                      {mode === "quick" && (
                        <div className="mt-5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm opacity-90">Default Wager</label>
                            <div className="text-sm font-semibold text-cyan-200">
                              {betAmount.toFixed(2)} TOKENS
                            </div>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max={MAX_BET_TOKENS}
                            step="1"
                            value={betAmount}
                            onChange={(e) => setBetAmount(+e.target.value)}
                            className="w-full accent-cyan-300 mt-2"
                          />
                          <div className="mt-2 flex flex-wrap gap-2 justify-center">
                            {[10, 25, 50, 100, 250, 500, 1000, 5000, 10000, 50000, 100000]
                              .filter((v) => v <= MAX_BET_TOKENS)
                              .map((v) => (
                                <button
                                  key={v}
                                  onClick={() => setBetAmount(v)}
                                  className={`px-3 py-1 rounded-lg text-sm border text-white ${betAmount === v
                                      ? "bg-cyan-400/10 border-cyan-300/40 shadow-[0_0_18px_rgba(0,255,255,0.14)]"
                                      : "bg-black/30 border-white/10 hover:border-fuchsia-300/30"
                                    }`}
                                >
                                  {v} TOKENS
                                </button>
                              ))}
                          </div>
                        </div>
                      )}

                      <CyberButton onClick={findMatch} className="mt-5 w-full py-3 sm:py-2">
                        🔎 Find Match
                      </CyberButton>
                    </motion.div>
                  )}

                  {/* SEARCHING */}
                  {status === "searching" && (
                    <motion.div
                      className="w-full max-w-md mx-auto rounded-2xl border border-cyan-300/20 bg-black/45 p-5 sm:p-6 shadow-[0_0_46px_rgba(0,255,255,0.12)] backdrop-blur-md"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                    >
                      <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200 text-center">
                        Divining Opponents
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow text-center">
                        Casting the Matchmaking Rune…
                      </div>

                      <div className="relative mx-auto mt-6 h-28 w-28">
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-cyan-300/25"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                        />
                        <motion.div
                          className="absolute inset-2 rounded-full border-2 border-fuchsia-300/20"
                          animate={{ rotate: -360 }}
                          transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                        />
                        <div className="absolute inset-6 rounded-full bg-cyan-300/15 blur" />
                        <div className="absolute inset-8 rounded-full bg-fuchsia-300/15 blur" />
                        <div className="absolute inset-[38%] rounded-full bg-white/70" />
                      </div>

                      <p className="mt-4 text-sm opacity-90 text-center">
                        Searching for a challenger worthy of your blade…
                      </p>

                      <CyberButton
                        onClick={cancelFindMatch}
                        className="mt-5 w-full border-fuchsia-300/35 shadow-[0_0_26px_rgba(236,72,153,0.16)] py-3 sm:py-2"
                      >
                        ❌ Cancel
                      </CyberButton>
                    </motion.div>
                  )}

                  {/* MATCH FOUND */}
                  {status === "matchFound" && (
                    <motion.div
                      className="w-full max-w-xl mx-auto rounded-2xl border border-cyan-300/20 bg-black/45 p-5 sm:p-6 shadow-[0_0_46px_rgba(0,255,255,0.12)] backdrop-blur-md"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-left min-w-0">
                          <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200">
                            Opponent Found · {mode === "friendly" ? "Friendly" : "Quick"}
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow break-all">
                            {shortPk(opponent)}
                          </div>
                        </div>
                        <div className="hidden sm:block text-3xl">🛡️</div>
                      </div>

                      {mode === "quick" ? (
                        isFirst ? (
                          <>
                            <div className="mt-4">
                              <div className="flex items-center justify-between">
                                <label className="text-sm opacity-90">Set Your Wager</label>
                                <div className="text-sm font-semibold text-cyan-200">
                                  {betAmount.toFixed(2)} TOKENS
                                </div>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max={MAX_BET_TOKENS}
                                step="1"
                                value={betAmount}
                                onChange={(e) => setBetAmount(+e.target.value)}
                                className="w-full accent-cyan-300 mt-2"
                                disabled={status === "confirming" || selfConfirmed}
                              />
                              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                                {[10, 25, 50, 100, 250, 500, 1000, 5000, 10000, 50000, 100000]
                                  .filter((v) => v <= MAX_BET_TOKENS)
                                  .map((v) => (
                                    <button
                                      key={v}
                                      onClick={() => setBetAmount(v)}
                                      className={`px-3 py-1 rounded-lg text-sm border text-white ${betAmount === v
                                          ? "bg-cyan-400/10 border-cyan-300/40 shadow-[0_0_18px_rgba(0,255,255,0.14)]"
                                          : "bg-black/30 border-white/10 hover:border-fuchsia-300/30"
                                        }`}
                                      disabled={status === "confirming" || selfConfirmed}
                                    >
                                      {v} TOKENS
                                    </button>
                                  ))}
                              </div>
                            </div>
                            <CyberButton
                              onClick={sendOffer}
                              className="mt-5 w-full py-3 sm:py-2"
                              disabled={status === "confirming" || selfConfirmed}
                            >
                              📜 Send Bet Offer
                            </CyberButton>
                          </>
                        ) : (
                          <p className="mt-4 text-sm opacity-90 text-center">
                            Awaiting their wager…
                          </p>
                        )
                      ) : (
                        <p className="mt-4 text-sm opacity-90 text-center">
                          Friendly match – no betting. Duel will begin automatically when both are
                          ready.
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* PROPOSING */}
                  {status === "proposing" && mode === "quick" && (
                    <motion.div
                      className="w-full max-w-md mx-auto rounded-2xl border border-cyan-300/15 bg-black/40 p-5 sm:p-6 shadow-[0_0_30px_rgba(0,255,255,0.10)] backdrop-blur-md"
                      initial={{ opacity: 0.8, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="text-sm opacity-90 text-center">
                        ⏳ Waiting for opponent to review your offer…
                      </div>
                    </motion.div>
                  )}

                  {/* NEGOTIATION */}
                  {status === "negotiation" && negotiation && mode === "quick" && (
                    <motion.div
                      className="w-full max-w-xl mx-auto rounded-2xl border border-fuchsia-300/20 bg-black/45 p-5 sm:p-6 shadow-[0_0_46px_rgba(236,72,153,0.12)] backdrop-blur-md"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                    >
                      <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200">
                        Offer Received
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow">
                        {shortPk(negotiation.opponentWallet)} offered{" "}
                        {Number(negotiation.bet).toFixed(2)} TOKENS
                      </div>

                      <div className="mt-5 grid sm:grid-cols-2 gap-3">
                        <CyberButton
                          onClick={acceptProposal}
                          className="bg-gradient-to-b from-emerald-500/20 to-cyan-500/10 border-emerald-300/30 py-3 sm:py-2"
                        >
                          ✅ Accept & Confirm
                        </CyberButton>

                        <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-left">
                          <div className="text-xs uppercase opacity-70 mb-1 text-fuchsia-200">
                            Counter Offer
                          </div>
                          <input
                            type="range"
                            min="1"
                            max={MAX_BET_TOKENS}
                            step="1"
                            value={betAmount}
                            onChange={(e) => setBetAmount(+e.target.value)}
                            className="w-full accent-fuchsia-300"
                          />
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-cyan-200">
                              {betAmount.toFixed(2)} TOKENS
                            </div>
                            <motion.button
                              onClick={counterProposal}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="rpg-button px-3 py-2 sm:py-1 border border-fuchsia-300/25 bg-fuchsia-400/10 shadow-[0_0_18px_rgba(236,72,153,0.14)] text-white"
                            >
                              ↩ Send Counter
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* CONFIRMING / ESCROW */}
                  {status === "confirming" && mode === "quick" && (
                    <motion.div
                      className="w-full max-w-xl mx-auto rounded-2xl border border-cyan-300/20 bg-black/45 p-5 sm:p-6 shadow-[0_0_46px_rgba(0,255,255,0.12)] backdrop-blur-md"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-left">
                          <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200">
                            Confirmation
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow">
                            Wager {betAmount.toFixed(2)} TOKENS
                          </div>
                        </div>
                        <div className="hidden sm:block text-3xl">💰</div>
                      </div>

                      {txError && (
                        <div className="mt-3 text-sm text-fuchsia-200">⚠️ {txError}</div>
                      )}

                      <motion.button
                        onClick={confirmMatch}
                        whileHover={{ scale: isSendingTx ? 1 : 1.02 }}
                        whileTap={{ scale: isSendingTx ? 1 : 0.98 }}
                        className={`rpg-button bg-green-600 mt-4 w-full relative overflow-hidden border border-emerald-300/25 shadow-[0_0_26px_rgba(16,185,129,0.16)] py-3 sm:py-2 text-white ${isSendingTx ? "opacity-70 cursor-not-allowed" : ""
                          }`}
                        disabled={isSendingTx || selfConfirmed}
                      >
                        {isSendingTx
                          ? "Processing..."
                          : selfConfirmed
                            ? "Awaiting opponent…"
                            : "Confirm & Send Tokens"}
                      </motion.button>

                      <div className="mt-3 grid sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm">
                          <div className="text-[11px] uppercase opacity-70 text-fuchsia-200">
                            Opponent
                          </div>
                          <div className="font-semibold break-all">
                            {shortPk(opponent)}
                          </div>
                          {opponentConfirmed && (
                            <div className="mt-1 text-emerald-300 text-xs">
                              ✅ Opponent confirmed
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm">
                          <div className="text-[11px] uppercase opacity-70 text-fuchsia-200">
                            Escrow Timer
                          </div>
                          <div className="font-semibold">
                            {oppCountdown !== null ? `${oppCountdown}s` : "—"}
                          </div>
                          {oppCountdown !== null && (
                            <div className="text-[11px] opacity-80">
                              Auto-refund if they don’t pay
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ✅ DUEL WRAPPER (scrollable) */}
          {!isLobby && (
            <div
              className="h-[100svh] overflow-y-auto flex flex-col"
              style={{
                paddingTop: "calc(92px + env(safe-area-inset-top))",
                // reserve space for the fixed bottom action bar (End Turn) so it never hides
                paddingBottom: "calc(128px + env(safe-area-inset-bottom))",
              }}
            >
              {/* Versus banner */}
              {(status === "dueling" || status === "matchFound") && (
                <motion.div
                  className="mb-3 sm:mb-4 w-full max-w-3xl mx-auto px-3 sm:px-4"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-black/40 backdrop-blur-md px-3 sm:px-4 py-3 shadow-[0_0_34px_rgba(0,255,255,0.12)]">
                    <div className="text-left">
                      <div className="text-[10px] uppercase opacity-70">You</div>
                      <div className="font-semibold text-cyan-200 break-all text-xs sm:text-sm">
                        {shortPk(wallet)}
                      </div>
                    </div>
                    <div className="text-center order-first sm:order-none">
                      <div className="text-xs uppercase opacity-70">Score</div>
                      <div className="text-xl sm:text-2xl font-extrabold tracking-wide">
                        {selfScore} : {opponentScore}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase opacity-70">
                        Opponent
                      </div>
                      <div className="font-semibold text-fuchsia-200 break-all text-xs sm:text-sm">
                        {shortPk(opponent)}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* OPPONENT DRAW PILE */}
              <div className="w-full max-w-5xl mx-auto px-3 sm:px-4">
                <div className="mx-auto mb-2 sm:mb-3 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-black/40 border border-cyan-300/20 text-cyan-100 shadow-[0_0_18px_rgba(0,255,255,0.12)]">
                  Opponent Draw Pile
                </div>

                <div className="relative mx-auto mb-4 sm:mb-5">
                  <div className="pointer-events-none absolute -inset-x-6 -inset-y-2 rounded-3xl bg-[radial-gradient(circle_at_center,rgba(0,255,255,0.14),transparent_70%)]" />

                  <div className="mx-auto max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                    <div className="flex justify-center gap-2 sm:gap-3 min-w-max px-1">
                      <AnimatePresence initial={false}>
                        {opponentCards.map((card, i) => (
                          <motion.div
                            key={`opp-${i}`}
                            layout
                            {...fadeInUp}
                            className="relative flex-shrink-0"
                          >
                            <motion.img
                              src={card === "back" ? backImage : imgSrc(card)}
                              className={`${PILE_CARD_W} ${PILE_CARD_H} rounded-xl shadow border border-white/10 bg-black/25`}
                              draggable={false}
                            />
                            <div className="absolute -bottom-1 left-1 right-1 h-1 rounded-full bg-black/40 blur-sm" />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              {/* FIELD BOXES */}
              <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 items-center gap-3 sm:gap-4 md:gap-8 px-3 sm:px-4">
                {/* Opponent Field Box */}
                <div className="md:justify-self-end">
                  <div className="relative rounded-2xl p-3 bg-black/40 border border-fuchsia-300/25 shadow-[inset_0_0_50px_rgba(236,72,153,0.10)] backdrop-blur-md">
                    <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-fuchsia-400/85 text-black font-bold tracking-widest uppercase">
                      Opponent Field
                    </div>
                    <motion.div
                      layout
                      className={`relative ${FIELD_W} ${FIELD_H} mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-fuchsia-900/40 to-black/20 border-2 border-fuchsia-300/55 shadow-inner shadow-fuchsia-500/10`}
                    >
                      <AnimatePresence initial={false}>
                        {opponentFieldCard ? (
                          <motion.img
                            key={`opp-field-${opponentFieldCard?.uid || opponentFieldCard?.cid || String(opponentFieldCard)}`}
                            layout
                            src={cardImageSrc(opponentFieldCard)}
                            className="w-[95%] h-[95%] object-contain rounded-lg"
                            animate={typeof opponentFieldCard === "string" ? {} : flipFace}
                            draggable={false}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-fuchsia-200">
                            <span className="text-xl">⟐</span>
                            <span className="text-[10px] opacity-80">Deploy</span>
                          </div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                </div>

                {/* VS badge */}
                <div className="flex md:hidden items-center justify-center py-1">
                  <div className="rounded-full px-4 py-2 border border-cyan-300/20 bg-black/40 text-xs tracking-wide text-cyan-100 shadow-[0_0_20px_rgba(0,255,255,0.12)]">
                    VS
                  </div>
                </div>
                <div className="hidden md:flex items-center justify-center">
                  <div className="rounded-full px-4 py-2 border border-cyan-300/20 bg-black/40 text-sm tracking-wide text-cyan-100 shadow-[0_0_20px_rgba(0,255,255,0.12)]">
                    VS
                  </div>
                </div>

                {/* Your Field Box */}
                <div className="md:justify-self-start">
                  <div className="relative rounded-2xl p-3 bg-black/40 border border-cyan-300/25 shadow-[inset_0_0_50px_rgba(0,255,255,0.10)] backdrop-blur-md">
                    <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-cyan-300/85 text-black font-bold tracking-widest uppercase">
                      Your Field
                    </div>
                    <motion.div
                      layout
                      className={`relative ${FIELD_W} ${FIELD_H} mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-cyan-900/35 to-black/20 border-2 border-cyan-300/55 shadow-inner shadow-cyan-500/10`}
                    >
                      <AnimatePresence initial={false}>
                        {selfFieldCard ? (
                          <motion.img
                            key={`self-field-${selfFieldCard.uid || String(selfFieldCard.cid)}`}
                            src={cardImageSrc(selfFieldCard)}
                            className="w-[95%] h-[95%] object-contain rounded-lg"
                            onAnimationComplete={() => selfFieldFx.start(fieldDrop)}
                            draggable={false}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-cyan-200">
                            <span className="text-xl">⟐</span>
                            <span className="text-[10px] opacity-80">Deploy</span>
                          </div>
                        )}
                      </AnimatePresence>
                      {!selfFieldCard && (
                        <div className="absolute inset-1 rounded-lg border-2 border-dashed border-white/15 pointer-events-none" />
                      )}
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* HAND AREA (scroll only) */}
              <div className="w-full max-w-5xl mx-auto mt-4 sm:mt-6 px-3 sm:px-4">
                <div className="mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-black/40 border border-cyan-300/20 text-cyan-100 shadow-[0_0_18px_rgba(0,255,255,0.12)]">
                  Your Hand
                </div>

                <div className="relative rounded-3xl px-3 sm:px-4 py-4 sm:py-5 border border-cyan-300/15 bg-gradient-to-t from-black/55 to-white/5 backdrop-blur-md shadow-[0_10px_46px_rgba(0,0,0,0.45)]">
                  <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-cyan-300/20 to-transparent blur-lg" />
                  <div className="pointer-events-none absolute -bottom-8 left-0 right-0 h-10 bg-gradient-to-t from-fuchsia-300/15 to-transparent blur-2xl" />

                  {/* ✅ FIX: DO NOT pointer-events-none the entire hand (this was the “can’t pick cards” bug) */}
                  <div className="mx-auto max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                    <div className="flex gap-3 justify-start sm:justify-center min-w-max px-1">
                      <AnimatePresence initial={false}>
                        {selfCards.map((card) => {
                          const isPending = pendingUid === card.uid;
                          return (
                            <motion.div
                              key={card.uid}
                              layout
                              {...fadeInUp}
                              className={`relative flex-shrink-0 ${HAND_CARD_W} ${HAND_CARD_H} rounded-2xl ${isPending ? "opacity-70" : ""
                                }`}
                            >
                              <div className="absolute -inset-[2px] rounded-2xl bg-[conic-gradient(from_180deg_at_50%_50%,rgba(0,255,255,0.20),rgba(236,72,153,0.12),rgba(255,255,255,0.08),rgba(0,255,255,0.20))] opacity-70" />
                              <motion.img
                                src={cardImageSrc(card)}
                                className={`relative w-full h-full rounded-2xl cursor-pointer border border-white/15 bg-black/25 ${isPending ? "cursor-wait" : ""
                                  }`}
                                whileHover={isPending || isMobile ? undefined : cardHover}
                                whileTap={isPending ? undefined : cardTap}
                                transition={{ type: "spring", stiffness: 280, damping: 20 }}
                                onClick={() => handleCardSelect(card)}
                                draggable={false}
                              />
                              <div className="absolute -bottom-1 left-2 right-2 h-2 rounded-full bg-black/50 blur-[3px]" />
                              {isPending && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-cyan-200 animate-spin" />
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              {/* ✅ FIXED BOTTOM ACTION BAR: End Turn ALWAYS visible */}
              <div
                className="fixed left-0 right-0 bottom-0 z-[75] px-3 sm:px-4"
                style={{
                  paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
                }}
              >
                <div className="mx-auto max-w-5xl">
                  <div className="rounded-2xl border border-cyan-300/20 bg-black/55 backdrop-blur-md shadow-[0_0_34px_rgba(0,255,255,0.12)] px-3 sm:px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                      <motion.button
                        onClick={handleEndTurn}
                        disabled={selfEndedTurn}
                        className="rpg-button w-full relative overflow-hidden border border-cyan-300/30 bg-gradient-to-b from-cyan-400/15 via-white/5 to-fuchsia-500/10 shadow-[0_0_26px_rgba(0,255,255,0.16)] py-3 sm:py-2 text-white"
                        whileTap={{ scale: 0.98 }}
                      >
                        {selfEndedTurn
                          ? opponentEndedTurn
                            ? "🔍 Revealing..."
                            : "⏳ Waiting for opponent..."
                          : "🕒 End Turn"}
                      </motion.button>

                      <div className="sm:w-[260px]">
                        {roundSecondsLeft != null ? (
                          <div>
                            <div className="h-2 w-full bg-white/20 rounded overflow-hidden">
                              <motion.div
                                className="h-2 bg-gradient-to-r from-cyan-300 to-fuchsia-300"
                                style={{ width: `${timerPct}%` }}
                                initial={false}
                                animate={{ width: `${timerPct}%` }}
                                transition={{
                                  type: "tween",
                                  ease: "linear",
                                  duration: 0.2,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-xs opacity-80 text-center sm:text-right">
                              {roundSecondsLeft}s left to choose
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs opacity-70 text-center sm:text-right">
                            Awaiting timer…
                          </div>
                        )}
                      </div>
                    </div>

                    {/* small debug line; remove anytime */}
                    <div className="mt-2 text-[11px] opacity-70">
                      Click lock: <span className="text-cyan-200">{pendingUid ? "ON" : "OFF"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bonus modal */}
          <AnimatePresence>
            {bonusModal && (
              <motion.div
                className="fixed inset-0 bg-black/85 text-white z-[85] flex flex-col items-center justify-center backdrop-blur-sm px-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.h2
                  className="text-2xl sm:text-3xl mb-4 font-bold text-cyan-200 drop-shadow-[0_0_18px_rgba(0,255,255,0.22)]"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                >
                  🌀 Bonus Round Triggered!
                </motion.h2>
                <p className="text-base sm:text-lg text-white/90 text-center">
                  A draw occurred in regulation — fresh hand dealt.
                </p>
                <CyberButton onClick={() => setBonusModal(false)} className="mt-6 py-3 sm:py-2">
                  Continue Duel
                </CyberButton>
              </motion.div>
            )}
          </AnimatePresence>

          {/* INFO MODAL */}
          <AnimatePresence>
            {infoModal.open && (
              <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setInfoModal((m) => ({ ...m, open: false }))}
                />
                <motion.div
                  className="relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden bg-black/55 border border-cyan-300/20 text-white shadow-[0_0_50px_rgba(0,255,255,0.12)]"
                  initial={{ scale: 0.94, y: 8, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.98, y: -6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 18 }}
                >
                  <div className="absolute -inset-1 rounded-3xl blur-2xl opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,255,0.20),transparent_45%),radial-gradient(circle_at_80%_60%,rgba(236,72,153,0.16),transparent_55%)]" />
                  <div className="relative">
                    <div className="text-xs uppercase tracking-widest opacity-80 text-fuchsia-200">
                      Notice
                    </div>
                    <h3 className="mt-1 text-xl sm:text-2xl font-extrabold text-cyan-200 drop-shadow">
                      {infoModal.title || "Info"}
                    </h3>
                    <p className="mt-3 text-sm opacity-90 whitespace-pre-wrap">
                      {infoModal.message}
                    </p>
                    <CyberButton
                      onClick={() => setInfoModal((m) => ({ ...m, open: false }))}
                      className="mt-5 py-3 sm:py-2"
                    >
                      Close
                    </CyberButton>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {/* BIG VERSUS OVERLAY */}
      <AnimatePresence>
        {reveal && fighting && (lastReveal.yourCard || lastReveal.oppCard) && (
          <motion.div
            className="fixed inset-0 z-[99] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-[92%] max-w-5xl rounded-3xl border border-cyan-300/20 bg-black/65 text-white shadow-[0_0_90px_rgba(0,0,0,0.7)] overflow-hidden"
              initial={{ y: 18, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              style={{
                marginTop: "env(safe-area-inset-top)",
                marginBottom: "env(safe-area-inset-bottom)",
              }}
            >
              <div className="pointer-events-none absolute -inset-1 blur-3xl opacity-50 bg-[radial-gradient(circle_at_left,rgba(0,255,255,0.22),transparent_45%),radial-gradient(circle_at_right,rgba(236,72,153,0.18),transparent_45%)]" />

              <div className="relative px-4 sm:px-8 py-5 sm:py-8">
                <div className="text-center text-[10px] sm:text-xs uppercase tracking-[0.2em] opacity-80 text-fuchsia-200">
                  Versus Reveal
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-6 sm:gap-8">
                  {/* YOUR CARD */}
                  <motion.div
                    className="relative flex flex-col items-center"
                    initial={{ x: -12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    <div className="mb-2 text-[10px] sm:text-xs uppercase tracking-widest text-cyan-200/90">
                      You
                    </div>
                    <div className="relative">
                      <motion.img
                        src={cardImageSrc(lastReveal?.yourCard)}
                        className={`h-52 sm:h-72 w-auto max-w-[78vw] rounded-2xl border ${isWinnerSelf
                            ? "border-cyan-200 shadow-[0_0_44px_rgba(0,255,255,0.30)]"
                            : "border-white/20"
                          }`}
                        initial={{ rotate: -2, scale: 0.98 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 120, damping: 14 }}
                        draggable={false}
                      />
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-1 rounded-full bg-black/40 border border-cyan-300/20 backdrop-blur">
                        Power:{" "}
                        <span className="font-bold text-cyan-200">
                          {powerText(lastReveal.yourCard)}
                        </span>
                      </div>
                      {isWinnerSelf && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-[2px] rounded-full bg-cyan-300 text-black font-bold">
                          WINNER
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* VS MEDALLION */}
                  <motion.div
                    className="flex sm:hidden flex-col items-center gap-2"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <div className="rounded-full px-4 py-3 border border-cyan-300/25 bg-black/40 backdrop-blur-md text-sm font-bold tracking-widest text-cyan-100 shadow-[0_0_22px_rgba(0,255,255,0.14)]">
                      VS
                    </div>
                    <div
                      className={`text-[10px] uppercase tracking-widest ${isWinnerSelf
                          ? "text-cyan-200"
                          : isWinnerOpp
                            ? "text-fuchsia-200"
                            : "text-slate-200"
                        }`}
                    >
                      {isWinnerSelf
                        ? "You Prevail"
                        : isWinnerOpp
                          ? "Opponent Prevails"
                          : "Draw"}
                    </div>
                  </motion.div>

                  <motion.div
                    className="hidden sm:flex flex-col items-center gap-2"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <div className="rounded-full px-4 py-3 border border-cyan-300/25 bg-black/40 backdrop-blur-md text-sm font-bold tracking-widest text-cyan-100 shadow-[0_0_22px_rgba(0,255,255,0.14)]">
                      VS
                    </div>
                    <div
                      className={`text-[10px] uppercase tracking-widest ${isWinnerSelf
                          ? "text-cyan-200"
                          : isWinnerOpp
                            ? "text-fuchsia-200"
                            : "text-slate-200"
                        }`}
                    >
                      {isWinnerSelf
                        ? "You Prevail"
                        : isWinnerOpp
                          ? "Opponent Prevails"
                          : "Draw"}
                    </div>
                  </motion.div>

                  {/* OPPONENT CARD */}
                  <motion.div
                    className="relative flex flex-col items-center"
                    initial={{ x: 12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    <div className="mb-2 text-[10px] sm:text-xs uppercase tracking-widest text-fuchsia-200/90">
                      Opponent
                    </div>
                    <div className="relative">
                      <motion.img
                        src={cardImageSrc(lastReveal?.oppCard)}
                        className={`h-52 sm:h-72 w-auto max-w-[78vw] rounded-2xl border ${isWinnerOpp
                            ? "border-fuchsia-200 shadow-[0_0_44px_rgba(236,72,153,0.30)]"
                            : "border-white/20"
                          }`}
                        initial={{ rotate: 2, scale: 0.98 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 120, damping: 14 }}
                        draggable={false}
                      />
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-1 rounded-full bg-black/40 border border-fuchsia-300/20 backdrop-blur">
                        Power:{" "}
                        <span className="font-bold text-fuchsia-200">
                          {powerText(lastReveal.oppCard)}
                        </span>
                      </div>
                      {isWinnerOpp && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-[2px] rounded-full bg-fuchsia-300 text-black font-bold">
                          WINNER
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>

                <div className="mt-7 sm:mt-8 text-center text-[11px] sm:text-xs tracking-widest uppercase opacity-90 text-white/90">
                  {isWinnerSelf
                    ? "Your card prevails!"
                    : isWinnerOpp
                      ? "Opponent's card prevails!"
                      : "Stalemate — no winner this round."}
                </div>

                {/* NOTE for your “only back card shows” issue:
                    This UI will show opponent NFT ONLY if backend sends `oppCard.image` (or payload object in revealOpponentCard).
                    If backend only sends cid, we can only show local sprite via cid. */}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* utilities */
function shortPk(pk) {
  if (!pk) return "—";
  const s = String(pk);
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
