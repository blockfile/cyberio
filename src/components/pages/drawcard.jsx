/* eslint-env browser, es2021 */
import React, { useState, useContext, useEffect, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../navbar/navbar";
import playBg from "../assets/video/playbg.mp4";
import backCard from "../assets/images/back.png";
import drawEffect from "../assets/images/drawbg.gif";
import bg2 from "../assets/images/bg2.jpg";
import { WalletContext } from "../../context/WalletConnect";

import {
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getMint,
  createTransferCheckedInstruction,
  // ✅ NEW: import ATA creation helper
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

/** --------- helpers --------- */
function importAll(r) {
  const images = {};
  r.keys().forEach((item) => {
    const key = item.replace("./", "").replace(".png", "");
    images[key] = r(item);
  });
  return images;
}
const monsterImages = importAll(
  require.context("../assets/images/monsters", false, /\.(png)$/)
);

const getRarity = (num) => {
  const n = Number(num);
  if (n >= 36) return "Mythical";
  if (n >= 21) return "Rare";
  return "Common";
};

const rarityGlow = {
  Common: "#a0522d",
  Rare: "#00bfff",
  Mythical: "#8a2be2",
};

/** --------- constants (keep in sync with server) --------- */
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const TREASURY_ADDRESS = "FtjTzPvSRVCaaM3u5BXKMKjkM8TACsyyuHPgv5YSQLGN";
const SD_TOKEN_MINT = "DrDzsdounCCy7wpjWKgpKUcmYB4xDzwkSPGw6jX52SoY";
const DRAW_PRICE_SD = 20000; // same as server DRAW_PRICE_SD
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

/** tiny util */
const ellipsize = (s, left = 6, right = 6) =>
  !s
    ? ""
    : s.length <= left + right + 3
      ? s
      : `${s.slice(0, left)}…${s.slice(-right)}`;

/** Small spinner */
function Spinner({ className = "w-10 h-10" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function DrawCard() {
  const { wallet: walletAddress } = useContext(WalletContext);

  const [drawnCard, setDrawnCard] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [rarity, setRarity] = useState("");
  const [loading, setLoading] = useState(false); // primary CTA disable
  const [message, setMessage] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  const [shake, setShake] = useState(false);
  const [liveEffects, setLiveEffects] = useState([]);
  const [userData, setUserData] = useState(null);
  const effectIntervalRef = useRef(null);

  // global, uniform loader (like Market.jsx)
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");

  // active memo (paid draw in progress)
  const [activeMemo, setActiveMemo] = useState("");
  const [justCreatedMemo, setJustCreatedMemo] = useState(false);

  // pending draws panel
  const [pendingDraws, setPendingDraws] = useState([]);
  const [sigInput, setSigInput] = useState({}); // memo -> sig

  // toast
  const [toast, setToast] = useState("");
  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2400);
  };

  /** load user + pending draws */
  useEffect(() => {
    (async () => {
      if (walletAddress) {
        try {
          setBusy(true);
          setBusyText("Loading your profile…");
          const res = await axios.get(
            `http://localhost:3001/api/user/${walletAddress}`
          );
          setUserData(res.data);
        } catch (err) {
          console.error("User fetch failed:", err);
        } finally {
          setBusy(false);
          setBusyText("");
        }
        await refreshPendingDraws(true);
      } else {
        setPendingDraws([]);
        setActiveMemo("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const refreshPendingDraws = async (withOverlay = false) => {
    if (!walletAddress) return setPendingDraws([]);
    try {
      if (withOverlay) {
        setBusy(true);
        setBusyText("Loading pending draws…");
      }
      const { data } = await axios.get(
        "http://localhost:3001/api/draw-card/pending",
        { params: { wallet: walletAddress } }
      );
      setPendingDraws(data.pending || []);
      // Surface first pending memo if none active
      if ((data.pending || []).length && !activeMemo) {
        setActiveMemo(data.pending[0].memo);
        setJustCreatedMemo(false);
      }
    } catch {
      setPendingDraws([]);
    } finally {
      if (withOverlay) {
        setBusy(false);
        setBusyText("");
      }
    }
  };

  /** main draw handler (block if you already have a pending draw) */
  const drawCard = async () => {
    if (!walletAddress) {
      setMessage("Connect your wallet first.");
      return;
    }
    setMessage("");
    setShake(true);

    setTimeout(async () => {
      setLoading(true); // disables CTA
      setBusy(true);
      setBusyText("Starting your draw…");

      try {
        const isFreeDraw = userData?.newPlayer && userData?.freeCard > 0;

        // If any pending lock exists, ask the user to finalize or cancel first
        if (!isFreeDraw) {
          await refreshPendingDraws(); // no overlay here, we already have one
          if (pendingDraws.length > 0) {
            const existing = pendingDraws[0];
            setActiveMemo(existing.memo);
            setJustCreatedMemo(false);
            showToast(
              "Active draw found — finalize or cancel before starting a new one."
            );
            return;
          }
        }

        if (!isFreeDraw) {
          // 1) Request an intent (server creates a new locked memo)
          setBusyText("Creating intent…");
          const intentRes = await axios.post(
            "http://localhost:3001/api/draw-card/intent",
            { walletAddress }
          );

          if (!intentRes.data.free) {
            const memo = intentRes.data.memo;
            setActiveMemo(memo);
            setJustCreatedMemo(true);

            const connection = new Connection(RPC_ENDPOINT, "confirmed");
            const provider = window.solana;
            if (!provider) throw new Error("Wallet not found.");

            // 2) Send SD transfer with memo to treasury
            const mintPk = new PublicKey(SD_TOKEN_MINT);
            const sender = new PublicKey(walletAddress);
            const treasury = new PublicKey(TREASURY_ADDRESS);

            setBusyText("Preparing transaction…");
            const senderAta = await getAssociatedTokenAddress(mintPk, sender);
            const treasuryAta = await getAssociatedTokenAddress(
              mintPk,
              treasury
            );
            const mintInfo = await getMint(connection, mintPk);
            const amount = Math.trunc(
              DRAW_PRICE_SD * 10 ** (mintInfo.decimals || 6)
            );

            // ✅ Ensure treasury ATA exists; create it if not
            const tx = new Transaction();
            const treasuryAtaInfo = await connection.getAccountInfo(
              treasuryAta
            );
            if (!treasuryAtaInfo) {
              tx.add(
                createAssociatedTokenAccountInstruction(
                  sender, // payer (user)
                  treasuryAta, // ata to create
                  treasury, // owner of ATA
                  mintPk // mint
                )
              );
            }

            tx.add(
              createTransferCheckedInstruction(
                senderAta,
                mintPk,
                treasuryAta,
                sender, // owner
                amount,
                mintInfo.decimals
              ),
              new TransactionInstruction({
                keys: [],
                programId: MEMO_PROGRAM_ID,
                data: new TextEncoder().encode(memo),
              })
            );

            tx.feePayer = sender;
            tx.recentBlockhash = (
              await connection.getLatestBlockhash()
            ).blockhash;

            setBusyText("Waiting for wallet approval…");
            const signed = await provider.signTransaction(tx);

            setBusyText("Sending transaction…");
            const sig = await connection.sendRawTransaction(signed.serialize());

            setBusyText("Confirming on-chain…");
            try {
              await connection.confirmTransaction(sig, "confirmed");
            } catch {
              // allow finalize to verify regardless
            }

            // 3) Finalize (server verifies: memo + amount + destination)
            setBusyText("Verifying purchase…");
            const finalizeRes = await axios.post(
              "http://localhost:3001/api/draw-card/finalize",
              { walletAddress, txSignature: sig, memo }
            );

            setBusyText("Revealing your card…");
            const cardNumber = finalizeRes.data.drawnCard;
            const image = monsterImages[String(cardNumber)];
            if (!image) {
              setMessage("Card image not found.");
              setImageSrc(null);
            } else {
              setImageSrc(image);
              setDrawnCard(cardNumber);
              setRarity(getRarity(Number(cardNumber)));
              setShowOverlay(true);
            }
            if (finalizeRes.data.updatedUser) {
              setUserData(finalizeRes.data.updatedUser);
            }
            setJustCreatedMemo(false);
            setActiveMemo("");
            await refreshPendingDraws();
            return; // done
          }
        }

        // FREE PATH
        setBusyText("Drawing your free card…");
        const freeRes = await axios.post(
          "http://localhost:3001/api/draw-card/free",
          { walletAddress }
        );
        const freeCardNumber = freeRes.data.drawnCard;
        const freeImage = monsterImages[String(freeCardNumber)];
        if (!freeImage) {
          setMessage("Card image not found.");
          setImageSrc(null);
        } else {
          setImageSrc(freeImage);
          setDrawnCard(freeCardNumber);
          setRarity(getRarity(Number(freeCardNumber)));
          setShowOverlay(true);
        }
        if (freeRes.data.updatedUser) {
          setUserData(freeRes.data.updatedUser);
        }
        await refreshPendingDraws();
      } catch (err) {
        console.error("Draw card error:", err);
        const msg = err?.message || err?.toString?.() || "";
        const rejected =
          /User rejected|User denied|Declined|rejected the request/i.test(msg);

        // If user rejected right after we created a memo, auto-cancel it
        if (justCreatedMemo && activeMemo && rejected) {
          try {
            setBusyText("Unlocking pending draw…");
            await axios.post("http://localhost:3001/api/draw-card/cancel", {
              walletAddress,
              memo: activeMemo,
            });
            setActiveMemo("");
            setJustCreatedMemo(false);
            await refreshPendingDraws();
            showToast("Cancelled. Draw unlocked.");
          } catch { }
        } else {
          setMessage(
            err?.response?.data?.error || "Transaction failed or cancelled."
          );
        }
      } finally {
        setLoading(false);
        setShake(false);
        setBusy(false);
        setBusyText("");
      }
    }, 800);
  };

  /** manual finalize for pending draw (paste tx sig) */
  const finalizePendingDraw = async (memo) => {
    const txSignature = (sigInput[memo] || "").trim();
    if (!txSignature) {
      setMessage("Paste the transaction signature first.");
      return;
    }
    setLoading(true);
    setBusy(true);
    setBusyText("Verifying purchase…");
    setMessage("");
    try {
      const res = await axios.post(
        "http://localhost:3001/api/draw-card/finalize",
        {
          walletAddress,
          txSignature,
          memo,
        }
      );
      const cardNumber = res.data.drawnCard;
      const image = monsterImages[String(cardNumber)];
      if (!image) {
        setMessage("Card image not found.");
        setImageSrc(null);
      } else {
        setImageSrc(image);
        setDrawnCard(cardNumber);
        setRarity(getRarity(Number(cardNumber)));
        setShowOverlay(true);
      }
      if (res.data.updatedUser) setUserData(res.data.updatedUser);
      setSigInput((m) => ({ ...m, [memo]: "" }));
      await refreshPendingDraws();
      showToast("Draw finalized.");
    } catch (e) {
      setMessage(e?.response?.data?.error || "Finalize failed");
    } finally {
      setLoading(false);
      setBusy(false);
      setBusyText("");
    }
  };

  /** cancel a locked (unpaid) memo so you can draw again */
  const cancelPendingDraw = async (memo) => {
    if (!walletAddress || !memo) return;
    setLoading(true);
    setBusy(true);
    setBusyText("Cancelling pending draw…");
    try {
      await axios.post("http://localhost:3001/api/draw-card/cancel", {
        walletAddress,
        memo,
      });
      showToast("Pending draw cancelled.");
      if (activeMemo === memo) {
        setActiveMemo("");
        setJustCreatedMemo(false);
      }
      await refreshPendingDraws();
    } catch (e) {
      setMessage(e?.response?.data?.error || "Cancel failed");
    } finally {
      setLoading(false);
      setBusy(false);
      setBusyText("");
    }
  };

  /** overlay close */
  const closeOverlay = () => {
    setShowOverlay(false);
    setLiveEffects([]);
    clearInterval(effectIntervalRef.current);
  };

  /** celebratory live effects */
  useEffect(() => {
    if (showOverlay) {
      effectIntervalRef.current = setInterval(() => {
        const newEffect = {
          id: Date.now() + Math.random(),
          top: `${Math.random() * 80 + 5}%`,
          left: `${Math.random() * 80 + 5}%`,
          rotate: `${Math.floor(Math.random() * 360)}deg`,
        };
        setLiveEffects((prev) => [...prev.slice(-10), newEffect]);
      }, 900);
    }
    return () => clearInterval(effectIntervalRef.current);
  }, [showOverlay]);

  /** back navigation */
  const goBack = () => {
    if (window.history && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/dapp"; // adjust if your route differs
    }
  };

  /** --- Visual --- */
  const Step = ({ n, label, active }) => (
    <div className="flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center border font-bold ${active
          ? "bg-yellow-400 text-black border-yellow-300"
          : "bg-white/10 text-white border-white/20"
          }`}
      >
        {n}
      </div>
      <div
        className={`font-play tracking-wide ${active ? "text-yellow-300" : "text-white/80"
          }`}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden font-silkscreen">
      {/* background */}
      <img
        src={bg2}
        alt="Background"
        className="absolute top-0 left-0 w-full h-full object-cover z-[-2]"
      />
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover z-[-3] opacity-30"
      >
        <source src={playBg} type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90 z-[-1]" />

      {/* navbar */}
      <div className="relative z-30">
        <Navbar />
      </div>

      {/* Active memo banner */}
      {!!activeMemo && (
        <motion.div
          initial={{ y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-40 backdrop-blur bg-yellow-400/90 border-b border-black/10"
        >
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-black font-bold tracking-wide">
              Active Draw Memo:
              <span className="ml-2 px-2 py-1 rounded bg-black/10 text-black font-mono text-[13px]">
                {activeMemo}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(activeMemo);
                  showToast("Memo copied");
                }}
                className="text-xs px-3 py-1.5 rounded bg-black/20 border border-black/20 hover:bg-black/30 font-bold"
              >
                Copy
              </button>
              <button
                onClick={() => cancelPendingDraw(activeMemo)}
                disabled={loading || busy}
                className="text-xs px-3 py-1.5 rounded bg-black text-yellow-300 border border-black/20 hover:bg-black/90 font-bold disabled:opacity-60"
                title="Cancel this pending draw"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* main content */}
      <div className="relative z-20 max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Back button under navbar, aligned with content */}
          <div className="flex items-center">
            <button
              onClick={goBack}
              className="px-3 py-1.5 rounded-lg bg-white/90 text-black font-semibold shadow hover:bg-white transition"
              title="Back to Dapp"
            >
              ← Back
            </button>
          </div>

          {/* Title + price/CTA row */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-black tracking-widest text-white drop-shadow">
                DRAW YOUR CARD
              </h2>
              <p className="text-white/70 mt-2 tracking-wider">
                {walletAddress ? (
                  <>
                    Wallet:{" "}
                    <span className="font-mono text-yellow-300">
                      {ellipsize(walletAddress, 6, 6)}
                    </span>
                  </>
                ) : (
                  "Connect wallet to begin."
                )}
              </p>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <div className="text-white/60 text-xs tracking-wider">
                  PRICE
                </div>
                <div className="text-yellow-300 text-2xl font-extrabold tracking-widest">
                  {DRAW_PRICE_SD} $SD
                </div>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <button
                onClick={drawCard}
                className={`px-6 py-3 rounded-xl font-extrabold tracking-wider shadow-lg transition
                  ${loading || busy
                    ? "bg-white/40 text-white/80"
                    : "bg-yellow-400 hover:bg-yellow-300 text-black"
                  }
                `}
                disabled={loading || busy}
              >
                {loading || busy
                  ? "Processing..."
                  : userData?.newPlayer && userData?.freeCard > 0
                    ? `Draw Free (${userData.freeCard} left)`
                    : `Draw for ${DRAW_PRICE_SD} $SD`}
              </button>
            </div>
          </div>
        </div>

        {/* Layout: Left (card) / Right (steps + pending) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Card + button (mobile) */}
          <div className="relative">
            <motion.div
              className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg p-6 shadow-2xl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-full aspect-[3/4] rounded-2xl bg-black/30 border border-white/10 flex items-center justify-center">
                <img
                  src={backCard}
                  alt="Card Back"
                  className={`w-[72%] h-auto drop-shadow-2xl transition-transform ${shake ? "animate-shake" : ""
                    }`}
                />
              </div>

              {/* Mobile CTA */}
              <div className="md:hidden mt-5">
                <button
                  onClick={drawCard}
                  className={`w-full py-3 rounded-xl font-extrabold tracking-wider shadow-lg transition
                    ${loading || busy
                      ? "bg-white/40 text-white/80"
                      : "bg-yellow-400 hover:bg-yellow-300 text-black"
                    }
                  `}
                  disabled={loading || busy}
                >
                  {loading || busy
                    ? "Processing..."
                    : userData?.newPlayer && userData?.freeCard > 0
                      ? `Draw Free (${userData.freeCard} left)`
                      : `Draw for ${DRAW_PRICE_SD} $SD`}
                </button>
              </div>

              {/* Error / message */}
              {message && (
                <div className="mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                  {message}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right: Steps + Pending */}
          <div className="space-y-6">
            {/* Steps */}
            <motion.div
              className="rounded-3xl border  border-white/10 bg-white/5 backdrop-blur-lg p-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <h3 className="text-xl font-extrabold tracking-widest text-white mb-4">
                How it works
              </h3>
              <div className="flex flex-col gap-4 font-silkscreen">
                <Step
                  n={1}
                  label="Get an intent — we create your unique MEMO."
                  active
                />
                <Step
                  n={2}
                  label="Send SD with that MEMO to the Treasury."
                  active={!!activeMemo}
                />
                <Step
                  n={3}
                  label="We verify & reveal your card."
                  active={false}
                />
              </div>

              {!!activeMemo && (
                <div className="mt-5">
                  <div className="text-xs text-white/70 mb-1">Current MEMO</div>
                  <div className="rounded-lg bg-black/40 border border-white/10 p-3 font-mono text-yellow-200 break-all">
                    {activeMemo}
                  </div>
                  <div className="text-xs text-white/50 mt-2 flex items-center gap-3">
                    Keep this safe. It’s bound to your wallet for this draw.
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(activeMemo);
                        showToast("Memo copied");
                      }}
                      className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white/80 text-xs hover:bg-white/15"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => cancelPendingDraw(activeMemo)}
                      disabled={loading || busy}
                      className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white text-xs disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Pending Draws Panel */}
            <motion.div
              className="rounded-3xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-lg p-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold tracking-widest text-yellow-300">
                  Pending Draws
                </h3>
                <button
                  onClick={() => refreshPendingDraws(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-yellow-300 text-black font-bold hover:bg-yellow-200 disabled:opacity-60 flex items-center gap-2"
                  disabled={busy}
                >
                  {busy ? <Spinner className="w-4 h-4" /> : null}
                  Refresh
                </button>
              </div>

              {pendingDraws.length === 0 ? (
                <p className="text-sm text-white/60 mt-3">
                  You have no pending draws.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {pendingDraws.map((it) => (
                    <div
                      key={it.memo}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="text-xs text-white/60">Memo</div>
                      <div className="font-mono text-[13px] text-yellow-200 break-all">
                        {it.memo}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="px-2 py-1 rounded bg-white/10 text-white/80 border border-white/10">
                          Price:{" "}
                          <span className="font-bold text-yellow-300">
                            {it.priceSD}
                          </span>{" "}
                          $SD
                        </span>
                        <span className="px-2 py-1 rounded bg-white/10 text-white/80 border border-white/10">
                          Locked:{" "}
                          <span className="font-mono">
                            {new Date(it.lockedAt).toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 items-center">
                        <input
                          className="flex-1 min-w-[220px] bg-black/40 text-white border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-white/40 outline-none focus:ring-2 focus:ring-yellow-300/40"
                          placeholder="Paste tx signature"
                          value={sigInput[it.memo] || ""}
                          onChange={(e) =>
                            setSigInput((m) => ({
                              ...m,
                              [it.memo]: e.target.value,
                            }))
                          }
                        />
                        <button
                          onClick={() => finalizePendingDraw(it.memo)}
                          disabled={loading || busy}
                          className="px-4 py-2 rounded-lg bg-emerald-400 text-black font-extrabold tracking-wide hover:bg-emerald-300 disabled:opacity-60"
                        >
                          Finalize
                        </button>
                        <button
                          onClick={() => cancelPendingDraw(it.memo)}
                          disabled={loading || busy}
                          className="px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white font-semibold disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Congrats overlay */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center text-center px-4 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {liveEffects.map((effect) => (
              <motion.img
                key={effect.id}
                src={drawEffect}
                alt="Sparkle"
                className="absolute w-[150px] h-[150px] opacity-80 pointer-events-none z-30"
                style={{
                  top: effect.top,
                  left: effect.left,
                  transform: `rotate(${effect.rotate})`,
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              />
            ))}

            <motion.h3
              className="text-white text-3xl md:text-4xl font-extrabold mb-3 tracking-widest"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 220 }}
            >
              🎉 CONGRATULATIONS!
            </motion.h3>
            <p className="text-yellow-300 text-2xl mb-6">
              You drew a <span className="capitalize">{rarity}</span> card
            </p>

            <div className="relative mb-10 z-40">
              {imageSrc && (
                <motion.img
                  src={imageSrc}
                  alt="Drawn Card"
                  className="w-72 h-auto drop-shadow-2xl animate-flicker rounded-xl"
                  style={{ boxShadow: `0 0 30px ${rarityGlow[rarity]}` }}
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.25, duration: 0.55 }}
                />
              )}
            </div>

            <motion.button
              onClick={() => {
                closeOverlay();
                refreshPendingDraws();
              }}
              className="px-6 py-2 bg-yellow-400 text-black font-extrabold rounded-full hover:bg-yellow-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Done
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/90 text-black px-4 py-2 rounded shadow font-semibold z-50"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL LOADING OVERLAY — uniform with Market.jsx */}
      <AnimatePresence>
        {busy && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70 flex font-silkscreen text-white flex-col items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Spinner />
            <div className="text-sm opacity-90">{busyText || "Working…"}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
