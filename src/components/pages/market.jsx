/* eslint-env browser, es2021 */
/* global BigInt */
import React, { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Navbar from "../navbar/navbar";
import { WalletContext } from "../../context/WalletConnect";
import { motion, AnimatePresence } from "framer-motion";
import bg from "../assets/images/market-bg.jpg";
import { useNavigate } from "react-router-dom"; // ⬅️ add this

// Buffer polyfill (browser)
import { Buffer as BufferPolyfill } from "buffer";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getMint,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";

if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = BufferPolyfill;
}
const Buf = typeof window !== "undefined" ? window.Buffer : BufferPolyfill;

// -------- assets helper (import every monster image by cardId) --------
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
const imgSrc = (cid) => monsterImages[String(cid)];

// -------- constants --------
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const SD_TOKEN_MINT = "GapARTbbWqvzqzHRTPEKccKqDCru7YfL1usqb4M4pump";
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// rarity by ID (same rule as Inventory)
const rarityById = (id) => {
  const n = Number(id);
  if (n >= 36) return "Mythical";
  if (n >= 21) return "Rare";
  return "Common";
};

const rarityTheme = {
  Common: {
    badge: "bg-amber-600/20 text-amber-300 border border-amber-500/30",
    card: "bg-gradient-to-br from-amber-900/30 to-amber-700/10 border-amber-600/30 shadow-[0_0_12px_rgba(255,193,7,0.25)]",
    glow: "#a0522d",
  },
  Rare: {
    badge: "bg-sky-600/20 text-sky-200 border border-sky-500/30",
    card: "bg-gradient-to-br from-sky-900/30 to-sky-700/10 border-sky-600/30 shadow-[0_0_12px_rgba(56,189,248,0.25)]",
    glow: "#00bfff",
  },
  Mythical: {
    badge: "bg-violet-600/20 text-violet-200 border border-violet-500/30",
    card: "bg-gradient-to-br from-violet-900/30 to-violet-700/10 border-violet-600/30 shadow-[0_0_14px_rgba(167,139,250,0.35)]",
    glow: "#8a2be2",
  },
};

// price → base units
const toBaseUnits = (priceSD, decimals, qty) => {
  let base = BigInt(Math.round(Number(priceSD) * 1_000_000));
  if (decimals >= 6) base *= BigInt(10) ** BigInt(decimals - 6);
  else base /= BigInt(10) ** BigInt(6 - decimals);
  return base * BigInt(qty);
};

// Small spinner SVG
function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

// ------------------------------------------------------------------
// Responsive Card tile — NO fixed pixel h/w.
// ------------------------------------------------------------------
function CardTile({
  kind, // "list-modal" | "mine" | "market"
  card,
  busy,
  onPrimary,
  qtyValue,
  onQtyChange,
  priceValue,
  onPriceChange,
}) {
  const rarity = rarityById(card.cardId);
  const theme = rarityTheme[rarity];

  return (
    <div className={`rounded-xl border p-3 ${theme.card} h-full`}>
      <div className="flex gap-3 items-stretch h-full">
        {/* image rail */}
        <div className="shrink-0 min-w-[80px] max-w-[120px] w-[22%]">
          <div className="w-full aspect-[3/4] rounded overflow-hidden">
            <img
              src={imgSrc(card.cardId)}
              alt=""
              className="w-full h-full object-contain"
              style={{ boxShadow: `0 0 14px ${theme.glow}55` }}
            />
          </div>
        </div>

        {/* content column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* title */}
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">
              #{card.cardId} · {card.name}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${theme.badge}`}
            >
              {rarity}
            </span>
          </div>

          {/* stats */}
          <div className="text-xs opacity-80 mt-0.5">Power {card.power}</div>

          {/* detail line */}
          <div className="text-xs mt-0.5 break-words">
            {kind === "list-modal" && (
              <>
                Owned: <span className="font-mono">{card.count}</span>
              </>
            )}
            {kind === "mine" && (
              <>
                Qty: <span className="font-mono">{card.quantity}</span>
                <span className="ml-2">
                  $SD{" "}
                  <span className="font-mono">
                    {Number(card.priceSD).toFixed(2)}
                  </span>{" "}
                  each
                </span>
              </>
            )}
            {kind === "market" && (
              <>
                Qty: <span className="font-mono">{card.quantity}</span>
                <span className="ml-2">
                  $SD{" "}
                  <span className="font-mono">
                    {Number(card.priceSD).toFixed(2)}
                  </span>{" "}
                  each
                </span>
                <div className="text-[11px] opacity-80 mt-1 break-all">
                  Seller: {card.sellerWallet?.slice(0, 4)}…
                  {card.sellerWallet?.slice(-4)}
                </div>
              </>
            )}
          </div>

          {/* inputs for listing */}
          {kind === "list-modal" ? (
            <div className="grid grid-cols-2 gap-2 text-sm mt-2">
              <input
                type="number"
                min="1"
                max={card.count}
                value={qtyValue ?? 1}
                onChange={(e) => onQtyChange?.(Number(e.target.value))}
                className="h-10 bg-black/40 border border-white/10 rounded px-3 w-full"
                placeholder="Qty"
                title="Quantity"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceValue ?? ""}
                onChange={(e) => onPriceChange?.(e.target.value)}
                className="h-10 bg-black/40 border border-white/10 rounded px-3 w-full"
                placeholder="Price in $SD"
                title="Price in SD"
              />
            </div>
          ) : (
            <div className="mt-2" />
          )}

          {/* button pinned to bottom */}
          <div className="mt-auto pt-2">
            <button
              onClick={onPrimary}
              disabled={busy}
              className={`w-full rounded font-semibold py-2 disabled:opacity-60 flex items-center justify-center gap-2 ${kind === "market"
                ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                : kind === "mine"
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-yellow-400 hover:bg-yellow-300 text-black"
                }`}
            >
              {busy && <Spinner />}
              {kind === "market" ? "Buy" : kind === "mine" ? "Cancel" : "List"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Market() {
  const navigate = useNavigate(); // ⬅️ add this
  const { wallet, userData } = useContext(WalletContext);
  const [me, setMe] = useState(userData);
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);

  // inputs for listing
  const [priceMap, setPriceMap] = useState({});
  const [qtyMap, setQtyMap] = useState({});

  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [toast, setToast] = useState("");

  // UI controls
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRarity, setFilterRarity] = useState("all"); // all/common/rare/mythical
  const [sortKey, setSortKey] = useState("recent");

  // list modal toggle
  const [showListModal, setShowListModal] = useState(false);

  // pending (finalize) panel
  const [pending, setPending] = useState([]);
  const [sigMap, setSigMap] = useState({});

  const conn = useMemo(() => new Connection(RPC_ENDPOINT, "confirmed"), []);

  useEffect(() => {
    (async () => {
      if (wallet) {
        const meRes = await axios.get(
          `http://localhost:3001/api/user/${wallet}`
        );
        setMe(meRes.data);
      }
      await refreshListings();
      await loadPending();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  async function refreshListings() {
    const { data } = await axios.get(
      "http://localhost:3001/api/market/listings",
      { params: { exclude: wallet || "" } }
    );
    setListings(data.others || []);
    setMyListings(data.mine || []);
  }

  async function loadPending() {
    if (!wallet) return setPending([]);
    try {
      const { data } = await axios.get(
        "http://localhost:3001/api/market/pending",
        { params: { wallet } }
      );
      setPending(data.pending || []);
    } catch {
      setPending([]);
    }
  }

  const tradableCards = useMemo(() => {
    if (!me?.cards) return [];
    return me.cards
      .filter((c) => !c.isFree && c.count > 0)
      .map((c) => ({ ...c, rarity: rarityById(c.cardId) }))
      .sort((a, b) => Number(a.cardId) - Number(b.cardId));
  }, [me]);

  function setToastMsg(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  // ----- list/cancel/buy/finalize -----
  async function handleList(card) {
    if (!wallet) return setToastMsg("Connect your wallet.");
    const priceSD = Number(priceMap[card.cardId] || "0");
    const qty = Number(qtyMap[card.cardId] || 1);
    if (!priceSD || priceSD <= 0) return setToastMsg("Enter a valid price.");
    if (!qty || qty < 1) return setToastMsg("Enter a valid quantity.");
    if (qty > card.count) return setToastMsg("Insufficient card quantity.");

    setBusy(true);
    setBusyText(qty > 1 ? "Creating listings…" : "Listing card…");
    try {
      await axios.post("http://localhost:3001/api/market/list", {
        walletAddress: wallet,
        cardId: card.cardId,
        quantity: qty,
        priceSD,
      });
      setToastMsg(qty > 1 ? `Created ${qty} listings` : "Listed!");
      const meRes = await axios.get(`http://localhost:3001/api/user/${wallet}`);
      setMe(meRes.data);
      await refreshListings();
      setQtyMap((m) => ({ ...m, [card.cardId]: 1 }));
      setPriceMap((m) => ({ ...m, [card.cardId]: "" }));
      setShowListModal(false);
    } catch (e) {
      setToastMsg(e?.response?.data?.error || "List failed");
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  async function handleCancel(listingId) {
    if (!wallet) return;
    setBusy(true);
    setBusyText("Cancelling listing…");
    try {
      await axios.post("http://localhost:3001/api/market/cancel", {
        walletAddress: wallet,
        listingId,
      });
      setToastMsg("Listing cancelled");
      const meRes = await axios.get(`http://localhost:3001/api/user/${wallet}`);
      setMe(meRes.data);
      await refreshListings();
    } catch (e) {
      setToastMsg(e?.response?.data?.error || "Cancel failed");
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  // Buy; if user rejects Phantom, unlock immediately via /intent-cancel.
  async function handleBuy(listing) {
    if (!wallet) return setToastMsg("Connect your wallet.");
    setBusy(true);
    setBusyText("Preparing purchase…");

    const provider = window.solana;
    if (!provider) {
      setBusy(false);
      setBusyText("");
      return setToastMsg("Wallet not found");
    }

    let sig = null;
    let memo = null;

    try {
      // 1) Lock intent & get memo
      const intent = await axios.post(
        "http://localhost:3001/api/market/intent",
        {
          buyerWallet: wallet,
          listingId: listing._id,
        }
      );
      memo = intent.data.memo;

      const buyer = new PublicKey(wallet);
      const seller = new PublicKey(listing.sellerWallet);
      const mint = new PublicKey(SD_TOKEN_MINT);

      const buyerAta = await getAssociatedTokenAddress(mint, buyer);
      const sellerAta = await getAssociatedTokenAddress(mint, seller);

      const ixs = [];
      const sellerAtaAcc = await conn.getAccountInfo(sellerAta);
      if (!sellerAtaAcc) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            buyer,
            sellerAta,
            seller,
            mint
          )
        );
      }

      let decimals = 6;
      try {
        const mintInfo = await getMint(conn, mint);
        decimals = mintInfo.decimals ?? 6;
      } catch { }

      const amount = toBaseUnits(listing.priceSD, decimals, listing.quantity);

      ixs.push(
        createTransferCheckedInstruction(
          buyerAta,
          mint,
          sellerAta,
          buyer,
          amount,
          decimals
        )
      );

      ixs.push(
        new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM_ID,
          data: Buf.from(memo, "utf8"),
        })
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = buyer;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      setBusyText("Waiting for wallet approval…");
      const signed = await provider.signTransaction(tx);
      setBusyText("Sending transaction…");
      const serialized = signed.serialize();
      sig = await conn.sendRawTransaction(serialized);

      // 3) Try to confirm (ok if timeout)
      setBusyText("Confirming on-chain…");
      try {
        await conn.confirmTransaction(sig, "confirmed");
      } catch (e) {
        console.warn("confirm timeout; finalizing anyway:", e?.message || e);
      }
    } catch (e) {
      console.error(e);

      const msg = (e && (e.message || e.toString())) || "";
      const code = e && (e.code || e.error?.code);
      const userRejected =
        code === 4001 ||
        /User rejected|User denied|Declined|rejected the request/i.test(msg);

      // If no tx signature was produced and user explicitly rejected, unlock.
      if (!sig && memo && userRejected) {
        try {
          setBusyText("Unlocking listing…");
          await axios.post("http://localhost:3001/api/market/intent-cancel", {
            buyerWallet: wallet,
            listingId: listing._id,
            memo,
          });
          setToastMsg("Cancelled. Listing unlocked.");
          await refreshListings();
          await loadPending();
        } catch {
          // ignore
        }
      } else {
        // Other errors: keep lock (user might have sent, or network hiccup)
        setToastMsg(msg || "Buy failed during send");
      }
    } finally {
      try {
        // If we have a tx signature, finalize like before.
        if (sig) {
          setBusyText("Verifying purchase…");
          await axios.post("http://localhost:3001/api/market/buy", {
            buyerWallet: wallet,
            listingId: listing._id,
            txSignature: sig,
          });
          setToastMsg("Purchased!");
          const meRes = await axios.get(
            `http://localhost:3001/api/user/${wallet}`
          );
          setMe(meRes.data);
          await refreshListings();
          await loadPending();
        }
      } catch (e) {
        setToastMsg(e?.response?.data?.error || "Finalize failed");
        await loadPending();
      } finally {
        setBusy(false);
        setBusyText("");
      }
    }
  }

  // Manual finalize for stuck/locked listing (buyer pastes tx sig)
  async function finalizePending(it) {
    const txSignature = (sigMap[it._id] || "").trim();
    if (!txSignature)
      return setToastMsg("Paste the transaction signature first.");
    setBusy(true);
    setBusyText("Verifying purchase…");
    try {
      await axios.post("http://localhost:3001/api/market/buy", {
        buyerWallet: wallet,
        listingId: it._id,
        txSignature,
      });
      setToastMsg("Delivered!");
      const meRes = await axios.get(`http://localhost:3001/api/user/${wallet}`);
      setMe(meRes.data);
      await refreshListings();
      await loadPending();
      setSigMap((m) => ({ ...m, [it._id]: "" }));
    } catch (e) {
      setToastMsg(e?.response?.data?.error || "Finalize failed");
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  // ----- search/filter/sort -----
  const visibleListings = useMemo(() => {
    const rarityRank = { Common: 1, Rare: 2, Mythical: 3 };
    const needle = searchQuery.trim().toLowerCase();

    let arr = listings.map((l) => {
      const rarity = rarityById(l.cardId);
      return {
        ...l,
        rarity,
        rarityKey: rarity.toLowerCase(),
        idNum: Number(l.cardId),
        priceNum: Number(l.priceSD || 0),
        createdAtNum: l.createdAt ? +new Date(l.createdAt) : 0,
      };
    });

    if (filterRarity !== "all") {
      arr = arr.filter((x) => x.rarityKey === filterRarity);
    }

    if (needle) {
      arr = arr.filter(
        (x) =>
          String(x.cardId).includes(needle) ||
          (x.name || "").toLowerCase().includes(needle) ||
          (x.sellerWallet || "").toLowerCase().includes(needle)
      );
    }

    switch (sortKey) {
      case "rarityAsc":
        arr.sort(
          (a, b) =>
            rarityRank[a.rarity] - rarityRank[b.rarity] || a.idNum - b.idNum
        );
        break;
      case "rarityDesc":
        arr.sort(
          (a, b) =>
            rarityRank[b.rarity] - rarityRank[a.rarity] || a.idNum - b.idNum
        );
        break;
      case "priceAsc":
        arr.sort((a, b) => a.priceNum - b.priceNum || a.idNum - b.idNum);
        break;
      case "priceDesc":
        arr.sort((a, b) => b.priceNum - a.priceNum || a.idNum - b.idNum);
        break;
      case "powerDesc":
        arr.sort(
          (a, b) => (b.power || 0) - (a.power || 0) || a.idNum - b.idNum
        );
        break;
      case "qtyDesc":
        arr.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
        break;
      case "idAsc":
        arr.sort((a, b) => a.idNum - b.idNum);
        break;
      case "idDesc":
        arr.sort((a, b) => b.idNum - a.idNum);
        break;
      case "recent":
      default:
        arr.sort(
          (a, b) => b.createdAtNum - a.createdAtNum || b.idNum - a.idNum
        );
    }
    return arr;
  }, [listings, searchQuery, filterRarity, sortKey]);

  return (
    <div className="relative min-h-screen text-white font-silkscreen overflow-hidden">
      <img
        src={bg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover -z-10"
      />
      <div className="absolute inset-0 bg-black/90 -z-10" />

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* header row with Back + Title + Refresh */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dapp")} // ⬅️ go back to dapp.jsx route
                disabled={busy}
                className="px-3 py-2 rounded border border-white/20 text-white hover:bg-white/10 disabled:opacity-60 flex items-center gap-2"
                aria-label="Back to DApp"
                title="Back"
              >
                {/* simple arrow */}
                <span className="text-lg">←</span>
                <span className="font-semibold">Back</span>
              </button>
              <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-wider">
                Marketplace
              </h1>
            </div>

            <button
              onClick={async () => {
                setBusy(true);
                setBusyText("Refreshing…");
                await refreshListings();
                await loadPending();
                setBusy(false);
                setBusyText("");
              }}
              className="px-4 py-2 rounded bg-white/90 text-black font-bold hover:bg-white transition flex items-center gap-2"
              disabled={busy}
            >
              {busy ? <Spinner /> : null}
              Refresh
            </button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600"
            >
              <option value="recent">🔽 Sort by… (Newest)</option>
              <option value="rarityAsc">⬆️ Rarity Asc</option>
              <option value="rarityDesc">⬇️ Rarity Desc</option>
              <option value="priceAsc">💲 Price Asc</option>
              <option value="priceDesc">💲 Price Desc</option>
              <option value="powerDesc">⚡ Power Desc</option>
              <option value="qtyDesc">📦 Quantity Desc</option>
              <option value="idAsc"># ID Asc</option>
              <option value="idDesc"># ID Desc</option>
            </select>

            <input
              type="text"
              placeholder="🔎 Search by ID, Name, or Seller"
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 min-w-[260px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value)}
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600"
            >
              <option value="all">🔀 Show All</option>
              <option value="common">🟠 Common</option>
              <option value="rare">🔵 Rare</option>
              <option value="mythical">🟣 Mythical</option>
            </select>
          </div>

          {/* Finalize purchases panel */}
          {pending.length > 0 && (
            <div className="mb-8 rounded-lg border border-yellow-500/30 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Pending purchase(s)</h3>
                <button
                  onClick={async () => {
                    setBusy(true);
                    setBusyText("Refreshing…");
                    await loadPending();
                    setBusy(false);
                    setBusyText("");
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/90 text-black font-semibold hover:bg-white flex items-center gap-2"
                  disabled={busy}
                >
                  {busy ? <Spinner className="w-3 h-3" /> : null}
                  Refresh
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {pending.map((it) => (
                  <div
                    key={it._id}
                    className="flex flex-col md:flex-row gap-2 md:items-center md:gap-4 py-2 border-t border-white/10 first:border-t-0"
                  >
                    <div className="text-sm flex-1">
                      #{it.cardId} · {it.name} — Qty {it.quantity} — $SD{" "}
                      {Number(it.priceSD).toFixed(2)} each
                    </div>
                    <input
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm w-full md:w-80"
                      placeholder="Paste tx signature"
                      value={sigMap[it._id] || ""}
                      onChange={(e) =>
                        setSigMap((m) => ({ ...m, [it._id]: e.target.value }))
                      }
                    />
                    <button
                      onClick={() => finalizePending(it)}
                      disabled={busy}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded disabled:opacity-60 flex items-center gap-2"
                    >
                      {busy ? <Spinner /> : null}
                      Finalize
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA instead of inline cards */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Your Cards (tradable)</h2>
              <button
                onClick={() => setShowListModal(true)}
                className="px-3 py-2 rounded bg-yellow-400 text-black font-bold hover:bg-yellow-300"
              >
                List a card
              </button>
            </div>
            <p className="text-sm opacity-80">
              Tip: setting Quantity &gt; 1 creates separate listings (1 each).
            </p>
          </section>

          {/* Your active listings */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3">Your Listings</h2>
            {myListings.length === 0 ? (
              <div className="text-sm opacity-80">No active listings.</div>
            ) : (
              <div className="grid [grid-auto-rows:1fr] items-stretch sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {myListings.map((l) => (
                  <CardTile
                    key={l._id}
                    kind="mine"
                    card={l}
                    busy={busy}
                    onPrimary={() => handleCancel(l._id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Other players' listings */}
          <section className="mb-16">
            <h2 className="text-xl font-semibold mb-3">
              Listings from Players
            </h2>
            {visibleListings.length === 0 ? (
              <div className="text-sm opacity-80">No listings match.</div>
            ) : (
              <div className="grid [grid-auto-rows:1fr] items-stretch sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleListings.map((l) => (
                  <CardTile
                    key={l._id}
                    kind="market"
                    card={l}
                    busy={busy}
                    onPrimary={() => handleBuy(l)}
                  />
                ))}
              </div>
            )}
          </section>

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
        </div>
      </div>

      {/* LIST MODAL */}
      <AnimatePresence>
        {showListModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowListModal(false)}
          >
            <motion.div
              className="max-w-6xl w-[94vw] max-h-[88vh] overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/90 p-5"
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold">List a card</h3>
                <button
                  className="px-3 py-1.5 rounded bg-white/90 text-black font-semibold hover:bg-white"
                  onClick={() => setShowListModal(false)}
                >
                  Close
                </button>
              </div>

              {tradableCards.length === 0 ? (
                <div className="text-sm opacity-80">
                  You don’t have any tradable cards.
                </div>
              ) : (
                <div className="grid [grid-auto-rows:1fr] items-stretch grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tradableCards.map((c) => (
                    <CardTile
                      key={`modal-${c.cardId}`}
                      kind="list-modal"
                      card={c}
                      busy={busy}
                      qtyValue={qtyMap[c.cardId] ?? 1}
                      onQtyChange={(v) =>
                        setQtyMap((m) => ({ ...m, [c.cardId]: v }))
                      }
                      priceValue={priceMap[c.cardId] ?? ""}
                      onPriceChange={(v) =>
                        setPriceMap((m) => ({ ...m, [c.cardId]: v }))
                      }
                      onPrimary={() => handleList(c)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL LOADING OVERLAY */}
      <AnimatePresence>
        {busy && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70 flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Spinner className="w-10 h-10" />
            <div className="text-sm opacity-90">{busyText || "Working…"}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
