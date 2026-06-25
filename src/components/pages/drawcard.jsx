/* eslint-env browser, es2021 */
import React, { useState, useContext, useEffect, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../navbar/navbar";
import backCard from "../assets/images/back.png";
import drawEffect from "../assets/images/drawbg.gif";
import { WalletContext } from "../../context/WalletConnect";
import { API_BASE_URL } from "../../config/endpoints";
import { nftArt } from "./cardArt";
import { playSfx } from "../../audio";

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
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

/** --------- helpers --------- */
function importAll(r) {
  const images = {};
  r.keys().forEach((item) => {
    const key = item.replace("./", "").replace(/\.(png|webp)$/, "");
    images[key] = r(item);
  });
  return images;
}
// fallback art only — the 5000-card NFT thumbnails come from nftArt() (public/cards5k)
const monsterImages = importAll(
  require.context("../assets/images/cards", false, /\.webp$/)
);

const getRarity = (num) => {
  const n = Number(num);
  if (n >= 36) return "Legendary";
  if (n >= 21) return "Rare";
  return "Common";
};

const rarityGlow = {
  Common: "#a0522d",
  Rare: "#00bfff",
  Legendary: "#8a2be2",
};

/** --------- constants (keep in sync with server) --------- */
const RPC_ENDPOINT =
  (process.env.REACT_APP_SOLANA_RPC || "").trim() ||
  "https://api.mainnet-beta.solana.com";
const TREASURY_ADDRESS = "8yUGx6tMGsCxSdVj2Fk8FyaDkg4doZ32xnkNkzKSwHe5";
const SD_TOKEN_MINT =
  (process.env.REACT_APP_TOKEN_MINT || "").trim() ||
  "DttktP1JiM63zGLSALiKs788mMYCunzRoZfCiwRFpump";
const DRAW_PRICE_SD = 5000; // whole CYBERIO tokens per draw — MUST match server DRAW_PRICE_CYBERIO
const DRAW_COUNTS = [1, 5, 10]; // multi-draw options
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

export default function DrawCard({ embedded = false }) {
  const { wallet: walletAddress, walletProvider } = useContext(WalletContext);

  const [drawnCard, setDrawnCard] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [rarity, setRarity] = useState("");
  const [drawCount, setDrawCount] = useState(1);   // 1 / 5 / 10 draws per pull
  const [multiDraws, setMultiDraws] = useState(null); // [{id, image, rarity, name, power}] for a multi-pull
  const [loading, setLoading] = useState(false); // primary CTA disable
  const [message, setMessage] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  useEffect(() => { if (showOverlay) playSfx("mint"); }, [showOverlay]); // card-reveal / mint sound
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
            `${API_BASE_URL}/api/user/${walletAddress}`
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
        `${API_BASE_URL}/api/draw-card/pending`,
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
            `${API_BASE_URL}/api/draw-card/intent`,
            { walletAddress, count: drawCount }
          );

          if (!intentRes.data.free) {
            const memo = intentRes.data.memo;
            setActiveMemo(memo);
            setJustCreatedMemo(true);

            const connection = new Connection(RPC_ENDPOINT, "confirmed");
            // use the wallet the user actually connected with (not just window.solana)
            const provider = walletProvider || window.solana;
            if (!provider || typeof provider.signTransaction !== "function") {
              throw new Error("Connected wallet can't sign here — reconnect your wallet.");
            }
            // make sure the wallet is unlocked/connected before signing — if Phantom is
            // locked this pops the unlock prompt; it's a no-op when already connected.
            try {
              if (typeof provider.connect === "function") await provider.connect();
            } catch (e) {
              throw new Error("Unlock and connect your wallet, then try again.");
            }

            // 2) Send CYBERIO transfer with memo to treasury
            const mintPk = new PublicKey(SD_TOKEN_MINT);
            const sender = new PublicKey(walletAddress);
            const treasury = new PublicKey(TREASURY_ADDRESS);

            // detect whether this mint is classic SPL Token or Token-2022 (this token is Token-2022)
            const mintAcc = await connection.getAccountInfo(mintPk);
            if (!mintAcc) throw new Error("Token mint not found on this RPC.");
            const tokenProgramId = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID)
              ? TOKEN_2022_PROGRAM_ID
              : TOKEN_PROGRAM_ID;

            const senderAta = await getAssociatedTokenAddress(mintPk, sender, false, tokenProgramId);
            const treasuryAta = await getAssociatedTokenAddress(mintPk, treasury, false, tokenProgramId);

            // make sure the buyer actually holds the token (clear error instead of a cryptic send failure)
            const senderAtaInfo = await connection.getAccountInfo(senderAta);
            if (!senderAtaInfo) {
              throw new Error("You don't hold any CYBERIO in this wallet.");
            }

            setBusyText("Preparing transaction…");
            const mintInfo = await getMint(connection, mintPk, "confirmed", tokenProgramId);
            // total the server expects = count × per-draw price (server returns it in the intent)
            const totalPrice = Number(intentRes.data.priceSD) || DRAW_PRICE_SD * drawCount;
            const amount = Math.trunc(
              totalPrice * 10 ** (mintInfo.decimals || 6)
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
                  mintPk, // mint
                  tokenProgramId
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
                mintInfo.decimals,
                [],
                tokenProgramId
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
              `${API_BASE_URL}/api/draw-card/finalize`,
              { walletAddress, txSignature: sig, memo }
            );

            setBusyText("Revealing your cards…");
            const cards = finalizeRes.data.drawnCards || [{
              cardId: finalizeRes.data.drawnCard, name: finalizeRes.data.name,
              power: finalizeRes.data.power, rarity: finalizeRes.data.rarity,
            }];
            if (cards.length > 1) {
              // multi-pull → reveal the whole batch in a grid
              setMultiDraws(cards.map((c) => ({
                id: c.cardId,
                image: nftArt(c.cardId) || monsterImages[String(c.cardId)],
                rarity: c.rarity || getRarity(Number(c.cardId)),
                name: c.name, power: c.power,
              })));
              setShowOverlay(true);
            } else {
              const cardNumber = cards[0].cardId;
              const image = nftArt(cardNumber) || monsterImages[String(cardNumber)];
              if (!image) {
                setMessage("Card image not found.");
                setImageSrc(null);
              } else {
                setMultiDraws(null);
                setImageSrc(image);
                setDrawnCard(cardNumber);
                setRarity(cards[0].rarity || getRarity(Number(cardNumber)));
                setShowOverlay(true);
              }
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
          `${API_BASE_URL}/api/draw-card/free`,
          { walletAddress }
        );
        const freeCardNumber = freeRes.data.drawnCard;
        const freeImage =
          nftArt(freeCardNumber) || monsterImages[String(freeCardNumber)];
        if (!freeImage) {
          setMessage("Card image not found.");
          setImageSrc(null);
        } else {
          setImageSrc(freeImage);
          setDrawnCard(freeCardNumber);
          setRarity(freeRes.data.rarity || getRarity(Number(freeCardNumber)));
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
            await axios.post(`${API_BASE_URL}/api/draw-card/cancel`, {
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
            err?.response?.data?.error || msg || "Transaction failed or cancelled."
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
        `${API_BASE_URL}/api/draw-card/finalize`,
        {
          walletAddress,
          txSignature,
          memo,
        }
      );
      const cards = res.data.drawnCards || [{
        cardId: res.data.drawnCard, name: res.data.name, power: res.data.power, rarity: res.data.rarity,
      }];
      if (cards.length > 1) {
        setMultiDraws(cards.map((c) => ({
          id: c.cardId,
          image: nftArt(c.cardId) || monsterImages[String(c.cardId)],
          rarity: c.rarity || getRarity(Number(c.cardId)),
          name: c.name, power: c.power,
        })));
        setShowOverlay(true);
      } else {
      const cardNumber = cards[0].cardId;
      const image = nftArt(cardNumber) || monsterImages[String(cardNumber)];
      if (!image) {
        setMessage("Card image not found.");
        setImageSrc(null);
      } else {
        setMultiDraws(null);
        setImageSrc(image);
        setDrawnCard(cardNumber);
        setRarity(cards[0].rarity || getRarity(Number(cardNumber)));
        setShowOverlay(true);
      }
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
      await axios.post(`${API_BASE_URL}/api/draw-card/cancel`, {
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
    setMultiDraws(null);
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
      {/* background — cyberpunk card vault */}
      <div
        className="absolute inset-0 z-[-3]"
        style={{
          background:
            "radial-gradient(120% 85% at 50% 0%, rgba(255,210,74,0.12), transparent 55%)," +
            "radial-gradient(110% 90% at 85% 100%, rgba(150,40,255,0.18), transparent 62%)," +
            "linear-gradient(180deg, #0b0b16 0%, #0c0810 55%, #06060c 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-[-2] opacity-[0.16] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,210,74,0.55) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,210,74,0.55) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          WebkitMaskImage:
            "radial-gradient(120% 100% at 50% 0%, #000 28%, transparent 74%)",
          maskImage:
            "radial-gradient(120% 100% at 50% 0%, #000 28%, transparent 74%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/80 z-[-1]" />

      {/* navbar */}
      {!embedded && (
        <div className="relative z-30">
          <Navbar />
        </div>
      )}

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
          {!embedded && (
            <div className="flex items-center">
              <button
                onClick={goBack}
                className="px-3 py-1.5 rounded-lg bg-white/90 text-black font-semibold shadow hover:bg-white transition"
                title="Back"
              >
                ← Back
              </button>
            </div>
          )}

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

            <div className="hidden md:flex items-center gap-5">
              {!(userData?.newPlayer && userData?.freeCard > 0) && (
                <div className="flex flex-col items-center gap-1" title="Cards per draw">
                  <span className="text-[9px] tracking-[.24em] text-white/50 uppercase">Draws</span>
                  <div className="flex gap-2">
                    {DRAW_COUNTS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setDrawCount(n)}
                        disabled={loading || busy}
                        className={`px-4 py-2.5 rounded-xl text-lg font-black tracking-wider transition border-2
                          ${drawCount === n
                            ? "bg-yellow-400 text-black border-yellow-200 scale-110 shadow-[0_0_18px_rgba(255,210,60,0.75)]"
                            : "bg-white/10 text-white/60 border-white/15 hover:bg-white/20 hover:text-white"}`}
                      >
                        {n}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-white/60 text-xs tracking-wider">PRICE</div>
                <div className="text-yellow-300 text-2xl font-extrabold tracking-widest">
                  {userData?.newPlayer && userData?.freeCard > 0
                    ? "FREE"
                    : `${(DRAW_PRICE_SD * drawCount).toLocaleString()} $CYBERIO`}
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
                    : `Draw ${drawCount}× for ${(DRAW_PRICE_SD * drawCount).toLocaleString()}`}
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
                {!(userData?.newPlayer && userData?.freeCard > 0) && (
                  <>
                    <div className="text-[9px] tracking-[.24em] text-white/50 uppercase text-center mb-1">Draws</div>
                    <div className="flex gap-2 mb-3 justify-center">
                      {DRAW_COUNTS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setDrawCount(n)}
                          disabled={loading || busy}
                          className={`flex-1 py-2.5 rounded-xl text-lg font-black tracking-wider transition border-2
                            ${drawCount === n
                              ? "bg-yellow-400 text-black border-yellow-200 shadow-[0_0_16px_rgba(255,210,60,0.7)]"
                              : "bg-white/10 text-white/60 border-white/15"}`}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
                      : `Draw ${drawCount}× for ${(DRAW_PRICE_SD * drawCount).toLocaleString()}`}
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
                  label="Send CYBERIO with that MEMO to the Treasury."
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
                          $CYBERIO
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
            {multiDraws ? (
              <>
                <p className="text-yellow-300 text-2xl mb-6">
                  You drew {multiDraws.length} cards!
                </p>
                <div className="relative mb-10 z-40 flex flex-wrap justify-center gap-3 max-w-[780px] max-h-[58vh] overflow-y-auto px-2">
                  {multiDraws.map((c, i) => (
                    <motion.div
                      key={`${c.id}-${i}`}
                      className="flex flex-col items-center"
                      initial={{ scale: 0, rotate: -8 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
                    >
                      <img
                        src={c.image}
                        alt={c.name || "Card"}
                        className="w-28 h-auto rounded-lg"
                        style={{ boxShadow: `0 0 16px ${rarityGlow[c.rarity] || "#88aaff"}` }}
                      />
                      <span className="text-[10px] uppercase tracking-wider mt-1"
                        style={{ color: rarityGlow[c.rarity] || "#88aaff" }}>{c.rarity}</span>
                    </motion.div>
                  ))}
                </div>
              </>
            ) : (
              <>
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
              </>
            )}

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
