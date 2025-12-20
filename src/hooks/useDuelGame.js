// src/hooks/useDuelGame.js
import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import bs58 from "bs58";
import {
  MATCH_RESULT_MS,
  ROUND_RESULT_MS,
} from "../components/play/shared";


const SOCKET_URL =
  (process.env.REACT_APP_SOCKET_URL || "").trim() ||
  (process.env.REACT_APP_API_URL || "").trim() ||
  (process.env.REACT_APP_API_BASE || "").trim() ||
  "http://localhost:3001";

// SOCKET (single instance)
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

const TREASURY = "FtjTzPvSRVCaaM3u5BXKMKjkM8TACsyyuHPgv5YSQLGN";
const RPC_ENDPOINT = "https://api.devnet.solana.com";

export function useDuelGame(wallet) {
  const ignoreDisconnectRef = useRef(false);

  // connection banner
  const [netDown, setNetDown] = useState(false);

  // mode + high-level status
  const [mode, setMode] = useState("quick"); // quick | friendly | ranked
  const [status, setStatus] = useState("idle"); // idle/searching/matchFound/dueling/...

  // matchmaking / betting
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

  // scoring + overlay
  const [selfScore, setSelfScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [roundWinner, setRoundWinner] = useState(null);
  const [bonusModal, setBonusModal] = useState(false);
  const [matchOver, setMatchOver] = useState(false);

  // reconnect UX
  const [oppGone, setOppGone] = useState(false);
  const [oppReconnectSeconds, setOppReconnectSeconds] = useState(null);

  // timers
  const [roundSecondsLeft, setRoundSecondsLeft] = useState(null);

  // escrow / tx UX
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [txError, setTxError] = useState("");
  const [lastEscrowId, setLastEscrowId] = useState(null);

  // modals
  const [infoModal, setInfoModal] = useState({
    open: false,
    title: "",
    message: "",
  });
  const [resultModal, setResultModal] = useState({
    open: false,
    winner: "",
    loser: "",
    forfeit: false,
  });
  const [resultPct, setResultPct] = useState(100);
  const [roundModal, setRoundModal] = useState({
    open: false,
    outcome: "draw",
  });
  const [roundPct, setRoundPct] = useState(100);

  // reveal overlay
  const [reveal, setReveal] = useState(false);
  const [fighting, setFighting] = useState(false);
  const [lastReveal, setLastReveal] = useState({
    yourCard: null,
    oppCard: null,
    winner: null,
  });

  // pending ack of played card
  const [pendingUid, setPendingUid] = useState(null);
  const [pendingCid, setPendingCid] = useState(null);

  const resultTickerRef = useRef(null);
  const roundTickerRef = useRef(null);

  const openInfo = (title, message) =>
    setInfoModal({ open: true, title, message });

  useEffect(() => {
    if (wallet) socket.emit("hello", { wallet });
  }, [wallet]);

  // socket listeners
  useEffect(() => {
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

    // --- deck too small ---
    socket.on("insufficientDeck", ({ you, need }) => {
      openInfo(
        "Deck Too Small",
        `You need at least ${need} cards to duel. You currently have ${you}.`
      );
      setStatus("idle");
    });

    // --- match found ---
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

    // --- betting signals ---
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
      openInfo("Payment Error", reason);
      resetToIdle();
    });

    socket.on("refundProcessed", ({ lamports }) => {
      openInfo(
        "Refunded",
        `Opponent didn't confirm. Refunded ${(lamports / 1e9).toFixed(2)} SOL.`
      );
      resetToIdle();
    });

    // --- duel start ---
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
      setPendingUid(null);
      setPendingCid(null);

      if (bonusRound) setBonusModal(true);
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // --- resume ---
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
      setRoundModal((m2) => ({ ...m2, open: false }));
      setLastReveal({ yourCard: null, oppCard: null, winner: null });
    });

    // timers
    socket.on("roundTimerTick", ({ secondsLeft }) =>
      setRoundSecondsLeft(secondsLeft)
    );

    // ACK for playCard
    socket.on("ackPlayed", ({ uid, cid }) => {
      setSelfFieldCard({ uid, cid });
      setSelfCards((prev) => prev.filter((c) => c.uid !== uid));
      setPendingUid(null);
      setPendingCid(null);
    });
    socket.on("rejectPlayed", () => {
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

    // round resolved
    socket.on("roundResolved", ({ yourCard, oppCard, winner }) => {
      setReveal(true);
      setFighting(true);
      if (yourCard) setSelfFieldCard(yourCard);
      if (oppCard) setOpponentFieldCard(oppCard.cid || "back");
      setRoundWinner(winner);

      setLastReveal({
        yourCard: yourCard || null,
        oppCard: oppCard || null,
        winner: winner || null,
      });

      const outcome =
        winner === "self"
          ? "self"
          : winner === "opponent"
          ? "opponent"
          : "draw";
      showRoundModal(outcome);

      // clean up view after animation window
      setTimeout(() => {
        setFighting(false);
        setReveal(false);
        setRoundWinner(null);
        setSelfEndedTurn(false);
        setOpponentEndedTurn(false);
        setSelfFieldCard(null);
        setOpponentFieldCard(null);
      }, ROUND_RESULT_MS + 600);
    });

    socket.on("scoreUpdate", ({ selfScore, opponentScore }) => {
      setSelfScore(selfScore);
      setOpponentScore(opponentScore);
    });

    // disconnect/reconnect
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
      if (resultTickerRef.current)
        cancelAnimationFrame(resultTickerRef.current);
      if (roundTickerRef.current)
        cancelAnimationFrame(roundTickerRef.current);
      socket.off("searchCanceled", onCanceled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  function resetToIdle() {
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
  }

  // --- UI animations for modals ---
  function animateMatchResult() {
    setResultPct(100);
    if (resultTickerRef.current)
      cancelAnimationFrame(resultTickerRef.current);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / MATCH_RESULT_MS) * 100);
      setResultPct(pct);
      if (elapsed < MATCH_RESULT_MS) {
        resultTickerRef.current = requestAnimationFrame(tick);
      } else {
        setResultModal((m) => ({ ...m, open: false }));
        resultTickerRef.current = null;
      }
    };
    resultTickerRef.current = requestAnimationFrame(tick);
  }

  function showRoundModal(outcome) {
    setRoundModal({ open: true, outcome });
    setRoundPct(100);
    if (roundTickerRef.current)
      cancelAnimationFrame(roundTickerRef.current);
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / ROUND_RESULT_MS) * 100);
      setRoundPct(pct);
      if (elapsed < ROUND_RESULT_MS) {
        roundTickerRef.current = requestAnimationFrame(tick);
      } else {
        setRoundModal((m) => ({ ...m, open: false }));
        roundTickerRef.current = null;
      }
    };
    roundTickerRef.current = requestAnimationFrame(tick);
  }

  // --- actions ----
  const findMatch = () => {
    if (!wallet) {
      openInfo("Wallet Required", "Connect your wallet first.");
      return;
    }
    socket.emit("findMatch", { wallet, mode, bet: betAmount });
    setStatus("searching");
  };

  const cancelFindMatch = () => {
    ignoreDisconnectRef.current = true;
    socket.emit("cancelFindMatch");
    setTimeout(() => (ignoreDisconnectRef.current = false), 200);
    setStatus("idle");
  };

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
        setTxError("Wallet address is missing.");
        setIsSendingTx(false);
        return;
      }

      const escrowId =
        lastEscrowId ||
        (crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const lamports = Math.round(betAmount * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet),
          toPubkey: new PublicKey(TREASURY),
          lamports,
        }),
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
      setLastEscrowId(escrowId);

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
        "Transaction failed. You can try again; escrowId is reused so you will not be double-charged.";
      if (err?.message) msg = err.message;
      setTxError(msg);
      setSelfConfirmed(false);
      setIsSendingTx(false);
      if (status !== "confirming") setStatus("confirming");
    }
  };

  const handleCardSelect = (card) => {
    if (matchOver || reveal || fighting) return;
    if (selfFieldCard) return;
    if (pendingUid) return;
    if (status !== "dueling") return;

    setPendingUid(card.uid);
    setPendingCid(card.cid);
    socket.emit("playCard", { uid: card.uid, cid: card.cid });
  };

  const handleEndTurn = () => {
    if (matchOver) return;
    if (!selfFieldCard) {
      openInfo("Play a Card", "Select a card to play first.");
      return;
    }
    socket.emit("endTurn", {
      uid: selfFieldCard.uid,
      cid: selfFieldCard.cid,
    });
    setSelfEndedTurn(true);
  };

  const timerPct = useMemo(() => {
    if (roundSecondsLeft == null) return 0;
    const pct = (roundSecondsLeft / 30) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [roundSecondsLeft]);

  const isYouMatchWinner =
    resultModal.open && resultModal.winner === wallet;

  return {
    // basic
    netDown,
    mode,
    setMode,
    status,
    betAmount,
    setBetAmount,
    opponent,
    isFirst,

    // negotiation
    negotiation,
    selfConfirmed,
    opponentConfirmed,
    oppCountdown,

    // duel
    selfCards,
    opponentCards,
    selfFieldCard,
    opponentFieldCard,
    selfEndedTurn,
    opponentEndedTurn,
    selfScore,
    opponentScore,
    roundWinner,
    bonusModal,
    setBonusModal,
    matchOver,
    oppGone,
    oppReconnectSeconds,
    roundSecondsLeft,
    timerPct,

    // tx UX
    isSendingTx,
    txError,

    // modals
    infoModal,
    setInfoModal,
    resultModal,
    resultPct,
    roundModal,
    roundPct,

    // reveal
    reveal,
    fighting,
    lastReveal,

    // pending
    pendingUid,
    pendingCid,

    // booleans
    isYouMatchWinner,

    // actions
    findMatch,
    cancelFindMatch,
    sendOffer,
    acceptProposal,
    counterProposal,
    confirmMatch,
    handleCardSelect,
    handleEndTurn,
  };
}
