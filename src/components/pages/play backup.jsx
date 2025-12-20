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
  SystemProgram,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import {
  motion,
  LayoutGroup,
  AnimatePresence,
  useAnimationControls,
} from "framer-motion";
import bs58 from "bs58";

/* assets */
function importAll(r) {
  const images = {};
  r.keys().forEach((item) => {
    const key = item.replace("./", "").replace(".png", "");
    images[key] = r(item);
  });
  return images;
}
const monsterImages = importAll(
  require.context("../assets/images/monsters", false, /\.png$/)
);
const imgSrc = (cid) => monsterImages[String(cid)] || backImage;

/* socket / chain */
const socket = io("http://localhost:3001", {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});
const TREASURY = "FtjTzPvSRVCaaM3u5BXKMKjkM8TACsyyuHPgv5YSQLGN";
const RPC_ENDPOINT = "https://api.devnet.solana.com";

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

export default function Play() {
  const { wallet } = useContext(WalletContext);
  const navigate = useNavigate();

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

  // retry-safe escrow
  const [lastEscrowId, setLastEscrowId] = useState(null);

  const selfFieldFx = useAnimationControls();
  const oppFieldFx = useAnimationControls();

  // NEW: store the cards used in the current reveal for a visible "VS" overlay
  const [lastReveal, setLastReveal] = useState({
    yourCard: null,
    oppCard: null,
    winner: null,
  });

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

    // NEW: Quick match requires NON-FREE cards
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
      setPendingUid(null);
      setPendingCid(null);
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
      setPendingUid(null);
      setPendingCid(null);
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    socket.on("refundProcessed", ({ lamports }) => {
      openInfo(
        "Refunded",
        `Opponent didn't confirm. Refunded ${(lamports / 1e9).toFixed(2)} SOL.`
      );
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
      setPendingUid(null);
      setPendingCid(null);
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // duel start / bonus round hand
    socket.on("startDuel", ({ selfCards, opponentCards, bonusRound }) => {
      setSelfCards(selfCards);
      setOpponentCards(opponentCards);
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
      // important: clear any stale pending (fixes lost card on bonus round)
      setPendingUid(null);
      setPendingCid(null);

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
      setPendingUid(null);
      setPendingCid(null);
      selfFieldFx.stop();
      oppFieldFx.stop();
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // timer
    socket.on("roundTimerTick", ({ secondsLeft }) =>
      setRoundSecondsLeft(secondsLeft)
    );

    // ACK path to fix “lost card”
    socket.on("ackPlayed", ({ uid, cid }) => {
      // move the selected card from hand → field after server ACKs
      setSelfFieldCard({ uid, cid });
      setSelfCards((prev) => prev.filter((c) => c.uid !== uid));
      setPendingUid(null);
      setPendingCid(null);
    });
    socket.on("rejectPlayed", ({ reason }) => {
      // keep hand intact; just clear pending
      setPendingUid(null);
      setPendingCid(null);
    });

    // opponent actions
    socket.on("opponentPlayedCard", () => {
      setOpponentFieldCard("back");
      setOpponentCards((prev) => {
        if (!prev?.length) return prev;
        const next = [...prev];
        const idx = next.findIndex((x) => x === "back");
        if (idx !== -1) next.splice(idx, 1);
        return next;
      });
    });
    socket.on("revealOpponentCard", (cid) => setOpponentFieldCard(cid));
    socket.on("opponentEndedTurn", () => setOpponentEndedTurn(true));

    // round result
    socket.on("roundResolved", ({ yourCard, oppCard, winner }) => {
      setReveal(true);
      setFighting(true);
      if (yourCard) setSelfFieldCard(yourCard);
      if (oppCard) setOpponentFieldCard(oppCard.cid || "back");
      setRoundWinner(winner);

      // keep a snapshot for the VS overlay
      setLastReveal({
        yourCard: yourCard || null,
        oppCard: oppCard || null,
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
        winner === "self"
          ? "self"
          : winner === "opponent"
            ? "opponent"
            : "draw";
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
              setLastReveal((lr) => ({ ...lr, winner: null })); // keep cards briefly if needed
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

    return () => {
      socket.removeAllListeners();
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect");
      if (resultTicker) cancelAnimationFrame(resultTicker);
      if (roundTicker) cancelAnimationFrame(roundTicker);
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
    // don't disconnect the socket (prevents fake 'network lost')
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

  const confirmMatch = async () => {
    if (mode !== "quick") return;
    try {
      if (isSendingTx) return;
      setIsSendingTx(true);
      setTxError("");

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

      // Generate or reuse escrowId to keep the attempt idempotent on retries
      const escrowId =
        lastEscrowId ||
        crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const lamports = Math.round(betAmount * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet),
          toPubkey: new PublicKey(TREASURY),
          lamports,
        }),
        // Attach memo = escrowId
        createMemoInstruction(escrowId)
      );
      tx.feePayer = new PublicKey(wallet);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await provider.signTransaction(tx);

      let txid;
      try {
        txid = await connection.sendRawTransaction(signed.serialize());
      } catch (err) {
        const msg = String(err?.message || "");
        if (msg.includes("already been processed")) {
          txid = signed.signatures?.[0]?.signature
            ? bs58.encode(signed.signatures[0].signature)
            : null;
          if (!txid) throw err;
        } else {
          throw err;
        }
      }

      await connection.confirmTransaction(txid, "confirmed");

      // mark escrowId used client-side (prevents generating a new one on retries)
      setLastEscrowId(escrowId);

      // notify server with escrowId
      socket.emit("confirmDuel", {
        wallet,
        txid,
        betLamports: lamports,
        escrowId,
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
  const handleCardSelect = (card, idx) => {
    if (matchOver || reveal || fighting) return;
    if (selfFieldCard) return;
    if (pendingUid) return; // lock taps while awaiting ACK
    if (status !== "dueling") return;

    // optimistic “pending” UX (don’t remove from hand yet)
    setPendingUid(card.uid);
    setPendingCid(card.cid);

    // ask server to play; server will ACK (ackPlayed) or reject
    socket.emit("playCard", { uid: card.uid, cid: card.cid });
  };
  useEffect(() => {
    const onCanceled = () => setStatus("idle");
    socket.on("searchCanceled", onCanceled);
    return () => socket.off("searchCanceled", onCanceled);
  }, []);

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

  function ModeChip({ active, children, disabled, onClick }) {
    return (
      <button
        disabled={disabled}
        onClick={onClick}
        className={`px-4 py-2 rounded-xl border text-sm transition
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02]"}
          ${active
            ? "bg-white/10 border-white/30"
            : "bg-white/5 border-white/10"
          }`}
        title={disabled ? "Coming soon" : ""}
      >
        {children}
      </button>
    );
  }

  // helper to show power text (fallback to "?")
  const powerText = (c) =>
    c && (c.power ?? c.atk ?? c.strength ?? c.value) != null
      ? String(c.power ?? c.atk ?? c.strength ?? c.value)
      : "?";

  const isWinnerSelf = lastReveal.winner === "self";
  const isWinnerOpp = lastReveal.winner === "opponent";

  return (
    <div className="relative w-full min-h-screen overflow-hidden font-silkscreen">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] mix-blend-overlay opacity-30 [background:repeating-linear-gradient(135deg,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0.04)_2px,transparent_2px,transparent_6px)]" />

      {/* BACK BUTTON */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 right-4 z-30 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm"
      >
        ← Back
      </button>

      {/* NET BANNER */}
      <AnimatePresence>
        {netDown && (
          <motion.div
            className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm text-center py-2"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
          >
            Network connection lost. Attempting to reconnect…
          </motion.div>
        )}
      </AnimatePresence>

      <img
        src={duelfield}
        alt=""
        className="absolute inset-0 w-full h-full object-cover z-[-2]"
      />
      <div className="absolute inset-0 bg-black/70 z-[-1]" />

      {/* Top HUD ribbon */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20">
        <div className="rounded-full px-4 py-2 text-white text-xs md:text-sm border border-white/15 bg-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(255,255,255,0.12)]">
          <span className="opacity-80">Mode:</span>
          <span className="ml-1 font-semibold">
            {mode === "friendly"
              ? "Friendly"
              : mode === "quick"
                ? "Quick"
                : "Ranked"}
          </span>
          <span className="mx-2 opacity-50">•</span>
          <span className="opacity-80">Status:</span>
          <span className="ml-1 font-semibold capitalize">{status}</span>
        </div>
      </div>

      {/* HUD */}
      <div className="absolute top-4 left-4 text-white z-20 space-y-1">
        <p>Your Score: {selfScore}</p>
        <p>Opponent Score: {opponentScore}</p>
        {oppGone && (
          <p className="text-yellow-300">
            Opponent disconnected
            {oppReconnectSeconds != null
              ? ` — ${oppReconnectSeconds}s to return`
              : ""}
          </p>
        )}
        {status === "dueling" && roundSecondsLeft != null && (
          <p className="text-yellow-300">Round timer: {roundSecondsLeft}s</p>
        )}
      </div>

      {/* ROUND RESULT MODAL */}
      <AnimatePresence>
        {roundModal.open && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden border
                ${roundModal.outcome === "self"
                  ? "bg-gradient-to-b from-amber-600/25 to-amber-400/10 border-amber-300/60 shadow-[0_0_40px_rgba(251,191,36,0.25)]"
                  : roundModal.outcome === "opponent"
                    ? "bg-gradient-to-b from-rose-700/25 to-rose-500/10 border-rose-300/60 shadow-[0_0_40px_rgba(244,63,94,0.25)]"
                    : "bg-gradient-to-b from-slate-600/25 to-slate-400/10 border-slate-300/60 shadow-[0_0_40px_rgba(148,163,184,0.25)]"
                } text-white`}
              initial={{ scale: 0.92, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              <div
                className={`absolute -inset-1 rounded-3xl blur-2xl opacity-25 ${roundModal.outcome === "self"
                    ? "bg-amber-300"
                    : roundModal.outcome === "opponent"
                      ? "bg-rose-300"
                      : "bg-slate-300"
                  }`}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest opacity-80">
                  <span>Round Result</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-80">RPG</span>
                </div>

                <h2 className="mt-2 text-3xl font-extrabold drop-shadow flex items-center justify-center gap-2">
                  {roundModal.outcome === "self" && (
                    <>
                      <span>🗡️</span>
                      <span className="text-amber-300">You Win the Round</span>
                      <span>🛡️</span>
                    </>
                  )}
                  {roundModal.outcome === "opponent" && (
                    <>
                      <span>💀</span>
                      <span className="text-rose-300">
                        Opponent Wins the Round
                      </span>
                      <span>🗡️</span>
                    </>
                  )}
                  {roundModal.outcome === "draw" && (
                    <>
                      <span>⚖️</span>
                      <span className="text-slate-200">Round is a Draw</span>
                      <span>⚖️</span>
                    </>
                  )}
                </h2>

                <p className="mt-2 text-sm opacity-90">
                  {roundModal.outcome === "self"
                    ? "Your tactics were true and your steel was steady."
                    : roundModal.outcome === "opponent"
                      ? "The fates were unkind—steel yourself for the next clash."
                      : "Neither blade found purchase. The duel rages on."}
                </p>

                <div className="mt-5">
                  <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-2 ${roundModal.outcome === "self"
                          ? "bg-amber-300"
                          : roundModal.outcome === "opponent"
                            ? "bg-rose-300"
                            : "bg-slate-300"
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
            className="absolute inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden ${isYouMatchWinner
                  ? "bg-gradient-to-b from-yellow-500/20 to-yellow-300/10"
                  : "bg-gradient-to-b from-red-500/20 to-red-300/10"
                } border ${isYouMatchWinner
                  ? "border-yellow-400/50 shadow-[0_0_40px_rgba(255,215,0,0.25)]"
                  : "border-red-400/50 shadow-[0_0_40px_rgba(255,99,99,0.25)]"
                } text-white`}
              initial={{ scale: 0.92, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: -8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              <div
                className={`absolute -inset-1 rounded-3xl blur-2xl opacity-30 ${isYouMatchWinner ? "bg-yellow-400" : "bg-red-400"
                  }`}
                aria-hidden
              />
              <div className="relative">
                <div className="text-xs tracking-widest uppercase opacity-80">
                  {resultModal.forfeit
                    ? "Match Result · Forfeit"
                    : "Match Result"}
                </div>
                <h2
                  className={`mt-2 text-3xl font-extrabold drop-shadow ${isYouMatchWinner ? "text-yellow-300" : "text-red-300"
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

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase opacity-70">
                      Winner
                    </div>
                    <div className="text-sm font-semibold break-all">
                      {shortPk(resultModal.winner)}
                    </div>
                  </div>
                  <div className="text-xs opacity-80">vs</div>
                  <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-[10px] uppercase opacity-70">
                      Loser
                    </div>
                    <div className="text-sm font-semibold break-all">
                      {shortPk(resultModal.loser)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 h-6">
                  {isYouMatchWinner ? (
                    <div className="text-lg">🎉 🥇 🎊</div>
                  ) : (
                    <div className="text-lg">💔 😵‍💫</div>
                  )}
                </div>

                <div className="mt-5">
                  <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-2 ${isYouMatchWinner ? "bg-yellow-400" : "bg-red-400"
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

                <button
                  onClick={() => setResultModal((m) => ({ ...m, open: false }))}
                  className="mt-4 rpg-button bg-white/10 hover:bg-white/20 border border-white/20"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LayoutGroup>
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center text-white">
          {/* Versus banner (shows during dueling & matchFound) */}
          {(status === "dueling" || status === "matchFound") && (
            <motion.div
              className="mb-4 w-full max-w-3xl mx-auto"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="grid grid-cols-3 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md px-4 py-3 shadow-[0_0_30px_rgba(255,255,255,0.08)]">
                <div className="text-left">
                  <div className="text-[10px] uppercase opacity-70">You</div>
                  <div className="font-semibold text-amber-200 break-all">
                    {shortPk(wallet)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs uppercase opacity-70">Score</div>
                  <div className="text-2xl font-extrabold tracking-wide">
                    {selfScore} : {opponentScore}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase opacity-70">
                    Opponent
                  </div>
                  <div className="font-semibold text-emerald-200 break-all">
                    {shortPk(opponent)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {status === "dueling" ? (
            <>
              {/* OPPONENT DRAW PILE + NAME */}
              <div className="w-full max-w-5xl mx-auto">
                <div className="mx-auto mb-3 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-white/10 border border-white/15">
                  Opponent Draw Pile
                </div>
                <div className="relative mx-auto flex justify-center gap-3 mb-5">
                  {/* Subtle glowing tray behind cards */}
                  <div className="pointer-events-none absolute -inset-x-8 -inset-y-2 rounded-3xl bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.15),transparent_70%)]" />
                  <AnimatePresence initial={false}>
                    {opponentCards.map((card, i) => (
                      <motion.div
                        key={`opp-${i}`}
                        layout
                        {...fadeInUp}
                        className="relative"
                      >
                        <motion.img
                          src={card === "back" ? backImage : imgSrc(card)}
                          className="w-24 h-36 rounded-xl shadow border border-white/10 bg-white/5"
                        />
                        {/* stacked card lip for depth */}
                        <div className="absolute -bottom-1 left-1 right-1 h-1 rounded-full bg-black/40 blur-sm" />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* FIELD BOXES */}
              <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 items-center gap-4 md:gap-8">
                {/* Opponent Field Box */}
                <div className="md:justify-self-end">
                  <div className="relative rounded-2xl p-3 bg-white/7 border border-yellow-300/30 shadow-[inset_0_0_40px_rgba(250,204,21,0.08)] backdrop-blur-md">
                    <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-yellow-500/80 text-black font-bold tracking-widest uppercase">
                      Opponent Field
                    </div>
                    <motion.div
                      layout
                      className="relative w-32 h-44 mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-yellow-900/40 to-yellow-900/10 border-2 border-yellow-400/70 shadow-inner shadow-yellow-500/10"
                    >
                      <AnimatePresence initial={false}>
                        {opponentFieldCard ? (
                          <>
                            <motion.img
                              key={`opp-field-${String(opponentFieldCard)}`}
                              layout
                              src={
                                typeof opponentFieldCard !== "string"
                                  ? imgSrc(opponentFieldCard)
                                  : backImage
                              }
                              className="w-[95%] h-[95%] object-contain rounded-lg"
                              animate={
                                typeof opponentFieldCard !== "string"
                                  ? flipFace
                                  : {}
                              }
                            />
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-yellow-300">
                            <span className="text-xl">⚔️</span>
                            <span className="text-[10px] opacity-80">
                              Place
                            </span>
                          </div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                </div>

                {/* VS badge */}
                <div className="hidden md:flex items-center justify-center">
                  <div className="rounded-full px-4 py-2 border border-white/15 bg-white/10 text-sm tracking-wide">
                    VS
                  </div>
                </div>

                {/* Your Field Box */}
                <div className="md:justify-self-start">
                  <div className="relative rounded-2xl p-3 bg-white/7 border border-red-300/30 shadow-[inset_0_0_40px_rgba(248,113,113,0.08)] backdrop-blur-md">
                    <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-red-500/80 text-white font-bold tracking-widest uppercase">
                      Your Field
                    </div>
                    <motion.div
                      layout
                      className="relative w-32 h-44 mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-red-900/40 to-red-900/10 border-2 border-red-400/70 shadow-inner shadow-red-500/10"
                    >
                      <AnimatePresence initial={false}>
                        {selfFieldCard ? (
                          <>
                            <motion.img
                              key={`self-field-${selfFieldCard.uid}`}
                              src={imgSrc(selfFieldCard.cid)}
                              className="w-[95%] h-[95%] object-contain rounded-lg"
                              onAnimationComplete={() =>
                                selfFieldFx.start(fieldDrop)
                              }
                            />
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-rose-200">
                            <span className="text-xl">⚔️</span>
                            <span className="text-[10px] opacity-80">
                              Place
                            </span>
                          </div>
                        )}
                      </AnimatePresence>
                      {/* subtle dashed hint outline when empty */}
                      {!selfFieldCard && (
                        <div className="absolute inset-1 rounded-lg border-2 border-dashed border-white/15 pointer-events-none" />
                      )}
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* YOUR HAND / DRAW TRAY */}
              <div className="w-full max-w-5xl mx-auto mt-6">
                <div className="mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-white/10 border border-white/15">
                  Your Hand
                </div>
                <div className="relative rounded-3xl px-4 py-5 border border-white/15 bg-gradient-to-t from-black/40 to-white/5 backdrop-blur-md shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                  {/* top glow */}
                  <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-white/20 to-transparent blur-lg" />

                  <div
                    className={`flex flex-wrap justify-center gap-3 ${pendingUid ? "pointer-events-none" : ""
                      }`}
                  >
                    <AnimatePresence initial={false}>
                      {selfCards.map((card, i) => {
                        const isPending = pendingUid === card.uid;
                        return (
                          <motion.div
                            key={card.uid}
                            layout
                            {...fadeInUp}
                            className={`relative w-24 h-36 rounded-2xl ${isPending ? "opacity-70" : ""
                              }`}
                          >
                            {/* decorative frame */}
                            <div className="absolute -inset-[2px] rounded-2xl bg-[conic-gradient(from_180deg_at_50%_50%,rgba(255,255,255,0.18),rgba(255,255,255,0.04),rgba(255,255,255,0.18))] opacity-60" />
                            <motion.img
                              src={imgSrc(card.cid)}
                              className={`relative w-full h-full rounded-2xl cursor-pointer border border-white/15 bg-white/5 ${isPending ? "cursor-wait" : ""
                                }`}
                              whileHover={isPending ? undefined : cardHover}
                              whileTap={isPending ? undefined : cardTap}
                              transition={{
                                type: "spring",
                                stiffness: 280,
                                damping: 20,
                              }}
                              onClick={() => handleCardSelect(card, i)}
                            />
                            {/* shadow */}
                            <div className="absolute -bottom-1 left-2 right-2 h-2 rounded-full bg-black/50 blur-[3px]" />
                            {isPending && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {/* End Turn + timer */}
                  <div className="mt-5 w-full max-w-sm mx-auto">
                    <motion.button
                      onClick={handleEndTurn}
                      disabled={selfEndedTurn}
                      className="rpg-button w-full"
                      whileTap={{ scale: 0.98 }}
                    >
                      {selfEndedTurn
                        ? opponentEndedTurn
                          ? "🔍 Revealing..."
                          : "⏳ Waiting for opponent..."
                        : "🕒 End Turn"}
                    </motion.button>

                    {roundSecondsLeft != null && (
                      <div className="mt-3">
                        <div className="h-2 w-full bg-white/20 rounded overflow-hidden">
                          <motion.div
                            className="h-2 bg-yellow-400"
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
                        <div className="mt-1 text-xs opacity-80">
                          {roundSecondsLeft}s left to choose
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Header */}
              <motion.h1
                className="text-3xl md:text-5xl font-bold mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                ⚔️ Duel Arena
              </motion.h1>

              {/* Mode selector */}
              {status === "idle" && (
                <motion.div
                  className="w-full max-w-xl mx-auto rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-900/20 to-amber-700/10 p-6 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 140, damping: 18 }}
                >
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-widest opacity-80">
                      Choose Your Path
                    </div>
                    <div className="text-2xl font-extrabold text-amber-300 drop-shadow">
                      Seek a Worthy Opponent
                    </div>
                    <p className="mt-1 text-sm opacity-90">
                      Quick Match uses betting, Friendly has no betting. Ranked
                      is coming soon.
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-2 justify-center">
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
                    <ModeChip
                      active={mode === "ranked"}
                      disabled
                      onClick={() => { }}
                    >
                      🏅 Ranked (Soon)
                    </ModeChip>
                  </div>

                  {/* Bet slider only for quick */}
                  {mode === "quick" && (
                    <div className="mt-5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm opacity-90">
                          Default Wager
                        </label>
                        <div className="text-sm font-semibold text-amber-200">
                          {betAmount.toFixed(2)} SOL
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={betAmount}
                        onChange={(e) => setBetAmount(+e.target.value)}
                        className="w-full accent-amber-300 mt-2"
                      />
                      <div className="mt-2 flex flex-wrap gap-2 justify-center">
                        {[0.1, 0.25, 0.5, 1, 2, 5].map((v) => (
                          <button
                            key={v}
                            onClick={() => setBetAmount(v)}
                            className={`px-3 py-1 rounded-lg text-sm border ${betAmount === v
                                ? "bg-amber-500/30 border-amber-300"
                                : "bg-white/5 border-white/10"
                              }`}
                          >
                            {v} SOL
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <motion.button
                    onClick={findMatch}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="rpg-button mt-5 w-full"
                  >
                    🔎 Find Match
                  </motion.button>
                </motion.div>
              )}

              {/* SEARCHING */}
              {status === "searching" && (
                <motion.div
                  className="w-full max-w-md mx-auto rounded-2xl border border-blue-400/30 bg-gradient-to-b from-blue-900/20 to-indigo-700/10 p-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                  <div className="text-xs uppercase tracking-widest opacity-80">
                    Divining Opponents
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-blue-300 drop-shadow">
                    Casting the Matchmaking Rune…
                  </div>

                  {/* orb */}
                  <div className="relative mx-auto mt-6 h-28 w-28">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-blue-300/30"
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 4,
                        ease: "linear",
                      }}
                    />
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-indigo-300/30"
                      animate={{ rotate: -360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 6,
                        ease: "linear",
                      }}
                    />
                    <div className="absolute inset-6 rounded-full bg-blue-300/20 blur" />
                    <div className="absolute inset-8 rounded-full bg-indigo-300/20 blur" />
                    <div className="absolute inset-[38%] rounded-full bg-white/70" />
                  </div>

                  <p className="mt-4 text-sm opacity-90">
                    Searching for a challenger worthy of your blade…
                  </p>

                  <motion.button
                    onClick={cancelFindMatch}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="rpg-button bg-red-700 mt-5 w-full"
                  >
                    ❌ Cancel
                  </motion.button>
                </motion.div>
              )}

              {/* MATCH FOUND */}
              {status === "matchFound" && (
                <motion.div
                  className="w-full max-w-xl mx-auto rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-900/20 to-emerald-700/10 p-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="text-xs uppercase tracking-widest opacity-80">
                        Opponent Found ·{" "}
                        {mode === "friendly" ? "Friendly" : "Quick"}
                      </div>
                      <div className="text-2xl font-extrabold text-emerald-300 drop-shadow">
                        {shortPk(opponent)}
                      </div>
                    </div>
                    <div className="hidden md:block text-3xl">🛡️</div>
                  </div>

                  {/* QUICK → betting flow, FRIENDLY → simple text */}
                  {mode === "quick" ? (
                    isFirst ? (
                      <>
                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <label className="text-sm opacity-90">
                              Set Your Wager
                            </label>
                            <div className="text-sm font-semibold text-emerald-200">
                              {betAmount.toFixed(2)} SOL
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={betAmount}
                            onChange={(e) => setBetAmount(+e.target.value)}
                            className="w-full accent-emerald-300 mt-2"
                            disabled={status === "confirming" || selfConfirmed}
                          />
                          <div className="mt-3 flex flex-wrap gap-2 justify-center">
                            {[0.1, 0.25, 0.5, 1, 2, 5].map((v) => (
                              <button
                                key={v}
                                onClick={() => setBetAmount(v)}
                                className={`px-3 py-1 rounded-lg text-sm border ${betAmount === v
                                    ? "bg-emerald-500/30 border-emerald-300"
                                    : "bg-white/5 border-white/10"
                                  }`}
                                disabled={
                                  status === "confirming" || selfConfirmed
                                }
                              >
                                {v} SOL
                              </button>
                            ))}
                          </div>
                        </div>
                        <motion.button
                          onClick={sendOffer}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          className="rpg-button mt-5 w-full"
                          disabled={status === "confirming" || selfConfirmed}
                        >
                          📜 Send Bet Offer
                        </motion.button>
                      </>
                    ) : (
                      <p className="mt-4 text-sm opacity-90">
                        Awaiting their wager…
                      </p>
                    )
                  ) : (
                    <p className="mt-4 text-sm opacity-90">
                      Friendly match – no betting. Duel will begin automatically
                      when both are ready.
                    </p>
                  )}
                </motion.div>
              )}

              {/* PROPOSING (quick only) */}
              {status === "proposing" && mode === "quick" && (
                <motion.div
                  className="w-full max-w-md mx-auto rounded-2xl border border-white/20 bg-white/10 p-6"
                  initial={{ opacity: 0.8, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-sm opacity-90">
                    ⏳ Waiting for opponent to review your offer…
                  </div>
                </motion.div>
              )}

              {/* NEGOTIATION (quick only) */}
              {status === "negotiation" && negotiation && mode === "quick" && (
                <motion.div
                  className="w-full max-w-xl mx-auto rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-900/20 to-amber-700/10 p-6 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                  <div className="text-xs uppercase tracking-widest opacity-80">
                    Offer Received
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-amber-300 drop-shadow">
                    {shortPk(negotiation.opponentWallet)} offered{" "}
                    {Number(negotiation.bet).toFixed(2)} SOL
                  </div>

                  <div className="mt-5 grid sm:grid-cols-2 gap-3">
                    <motion.button
                      onClick={acceptProposal}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="rpg-button bg-green-600"
                    >
                      ✅ Accept & Confirm
                    </motion.button>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                      <div className="text-xs uppercase opacity-70 mb-1">
                        Counter Offer
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={betAmount}
                        onChange={(e) => setBetAmount(+e.target.value)}
                        className="w-full accent-amber-300"
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-sm font-semibold text-amber-200">
                          {betAmount.toFixed(2)} SOL
                        </div>
                        <motion.button
                          onClick={counterProposal}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="rpg-button px-3 py-1"
                        >
                          ↩ Send Counter
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* CONFIRMING / ESCROW (quick only) */}
              {status === "confirming" && mode === "quick" && (
                <motion.div
                  className="w-full max-w-xl mx-auto rounded-2xl border border-teal-400/30 bg-gradient-to-b from-teal-900/20 to-teal-700/10 p-6 shadow-[0_0_30px_rgba(20,184,166,0.15)]"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="text-xs uppercase tracking-widest opacity-80">
                        Confirmation
                      </div>
                      <div className="text-2xl font-extrabold text-teal-300 drop-shadow">
                        Wager {betAmount.toFixed(2)} SOL
                      </div>
                    </div>
                    <div className="hidden md:block text-3xl">💰</div>
                  </div>

                  {txError && (
                    <div className="mt-3 text-sm text-red-300">
                      ⚠️ {txError}
                    </div>
                  )}

                  <motion.button
                    onClick={confirmMatch}
                    whileHover={{ scale: isSendingTx ? 1 : 1.04 }}
                    whileTap={{ scale: isSendingTx ? 1 : 0.97 }}
                    className={`rpg-button bg-green-600 mt-4 w-full ${isSendingTx ? "opacity-70 cursor-not-allowed" : ""
                      }`}
                    disabled={isSendingTx || selfConfirmed}
                  >
                    {isSendingTx
                      ? "Processing..."
                      : selfConfirmed
                        ? "Awaiting opponent…"
                        : "Confirm & Send SOL"}
                  </motion.button>

                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase opacity-70">
                        Opponent
                      </div>
                      <div className="font-semibold">{shortPk(opponent)}</div>
                      {opponentConfirmed && (
                        <div className="mt-1 text-emerald-300 text-xs">
                          ✅ Opponent confirmed
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <div className="text-[11px] uppercase opacity-70">
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
            </>
          )}

          {/* Bonus modal */}
          <AnimatePresence>
            {bonusModal && (
              <motion.div
                className="absolute inset-0 bg-black/80 text-white z-30 flex flex-col items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.h2
                  className="text-3xl mb-4 font-bold"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                >
                  🌀 Bonus Round Triggered!
                </motion.h2>
                <p className="text-lg">
                  A draw occurred in regulation — fresh hand dealt.
                </p>
                <button
                  onClick={() => setBonusModal(false)}
                  className="mt-6 rpg-button bg-blue-600"
                >
                  Continue Duel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* INFO MODAL */}
          <AnimatePresence>
            {infoModal.open && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setInfoModal((m) => ({ ...m, open: false }))}
                />
                <motion.div
                  className="relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden bg-gradient-to-b from-slate-800/80 to-slate-700/60 border border-white/15 text-white"
                  initial={{ scale: 0.94, y: 8, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.98, y: -6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 18 }}
                >
                  <div className="absolute -inset-1 rounded-3xl blur-2xl opacity-20 bg-white" />
                  <div className="relative">
                    <div className="text-xs uppercase tracking-widest opacity-80">
                      Notice
                    </div>
                    <h3 className="mt-1 text-2xl font-extrabold text-amber-300 drop-shadow">
                      {infoModal.title || "Info"}
                    </h3>
                    <p className="mt-3 text-sm opacity-90 whitespace-pre-wrap">
                      {infoModal.message}
                    </p>
                    <button
                      onClick={() =>
                        setInfoModal((m) => ({ ...m, open: false }))
                      }
                      className="mt-5 rpg-button bg-white/10 hover:bg-white/20 border border-white/20"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {/* ===== BIG VERSUS OVERLAY (HIGH VISIBILITY) ===== */}
      <AnimatePresence>
        {reveal && fighting && (lastReveal.yourCard || lastReveal.oppCard) && (
          <motion.div
            className="fixed inset-0 z-[55] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* dark backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            {/* panel */}
            <motion.div
              className="relative w-[92%] max-w-5xl rounded-3xl border border-white/20 bg-slate-900/80 text-white shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
              initial={{ y: 18, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              {/* outer glows */}
              <div className="pointer-events-none absolute -inset-1 blur-3xl opacity-40 bg-[radial-gradient(circle_at_left,rgba(248,113,113,0.25),transparent_40%),radial-gradient(circle_at_right,rgba(250,204,21,0.25),transparent_40%)]" />

              <div className="relative px-5 sm:px-8 py-6 sm:py-8">
                <div className="text-center text-[10px] sm:text-xs uppercase tracking-[0.2em] opacity-80">
                  Versus Reveal
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-6 sm:gap-8">
                  {/* YOUR CARD */}
                  <motion.div
                    className={`relative flex flex-col items-center`}
                    initial={{ x: -12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    <div className="mb-2 text-[10px] sm:text-xs uppercase tracking-widest text-rose-200/90">
                      You
                    </div>
                    <div className="relative">
                      <motion.img
                        src={imgSrc(lastReveal?.yourCard?.cid)}
                        className={`h-56 sm:h-72 w-auto rounded-2xl border ${isWinnerSelf
                            ? "border-yellow-300 shadow-[0_0_40px_rgba(253,224,71,0.45)]"
                            : "border-white/20"
                          }`}
                        initial={{ rotate: -2, scale: 0.98 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 120,
                          damping: 14,
                        }}
                      />
                      {/* power badge */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-1 rounded-full bg-white/15 border border-white/25 backdrop-blur">
                        Power:{" "}
                        <span className="font-bold">
                          {powerText(lastReveal.yourCard)}
                        </span>
                      </div>
                      {/* winner tag */}
                      {isWinnerSelf && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-[2px] rounded-full bg-yellow-400 text-black font-bold">
                          WINNER
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* VS MEDALLION */}
                  <motion.div
                    className="hidden sm:flex flex-col items-center gap-2"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <div className="rounded-full px-4 py-3 border border-white/30 bg-white/10 backdrop-blur-md text-sm font-bold tracking-widest">
                      VS
                    </div>
                    <div
                      className={`text-[10px] uppercase tracking-widest ${isWinnerSelf
                          ? "text-yellow-300"
                          : isWinnerOpp
                            ? "text-emerald-300"
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
                    className={`relative flex flex-col items-center`}
                    initial={{ x: 12, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                  >
                    <div className="mb-2 text-[10px] sm:text-xs uppercase tracking-widest text-emerald-200/90">
                      Opponent
                    </div>
                    <div className="relative">
                      <motion.img
                        src={imgSrc(lastReveal?.oppCard?.cid)}
                        className={`h-56 sm:h-72 w-auto rounded-2xl border ${isWinnerOpp
                            ? "border-yellow-300 shadow-[0_0_40px_rgba(253,224,71,0.45)]"
                            : "border-white/20"
                          }`}
                        initial={{ rotate: 2, scale: 0.98 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 120,
                          damping: 14,
                        }}
                      />
                      {/* power badge */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-1 rounded-full bg-white/15 border border-white/25 backdrop-blur">
                        Power:{" "}
                        <span className="font-bold">
                          {powerText(lastReveal.oppCard)}
                        </span>
                      </div>
                      {/* winner tag */}
                      {isWinnerOpp && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-[2px] rounded-full bg-yellow-400 text-black font-bold">
                          WINNER
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* bottom caption */}
                <div className="mt-8 text-center text-[11px] sm:text-xs tracking-widest uppercase opacity-90">
                  {isWinnerSelf
                    ? "Your card prevails!"
                    : isWinnerOpp
                      ? "Opponent's card prevails!"
                      : "Stalemate — no winner this round."}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ===== /BIG VERSUS OVERLAY ===== */}
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
