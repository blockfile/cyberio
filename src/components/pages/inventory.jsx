// src/pages/Inventory.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import axios from "axios";
import Navbar from "../navbar/navbar";
import { WalletContext } from "../../context/WalletConnect";
import { motion, AnimatePresence } from "framer-motion";
import bg2 from "../assets/images/bg2.jpg";

const getRarity = (id) => {
  const num = parseInt(id);
  if (Number.isNaN(num)) return "Common";
  if (num >= 36) return "Mythical";
  if (num >= 21) return "Rare";
  return "Common";
};

// ✅ Cyberpunk pink/violet palette
const rarityGlow = {
  Common: "shadow-[0_0_24px_rgba(255,43,214,0.18)]",
  Rare: "shadow-[0_0_28px_rgba(140,0,255,0.22)]",
  Mythical: "shadow-[0_0_36px_rgba(255,105,210,0.26)]",
};

const rarityPill = {
  Common: "bg-[rgba(255,43,214,0.14)] border-[rgba(255,43,214,0.35)] text-[rgba(255,180,235,0.95)]",
  Rare: "bg-[rgba(140,0,255,0.14)] border-[rgba(140,0,255,0.35)] text-[rgba(210,180,255,0.95)]",
  Mythical:
    "bg-[rgba(255,105,210,0.14)] border-[rgba(255,105,210,0.35)] text-[rgba(255,220,245,0.98)]",
};

const rarityBadgeFill = {
  Common: "bg-[rgba(255,43,214,0.75)]",
  Rare: "bg-[rgba(140,0,255,0.75)]",
  Mythical: "bg-[rgba(255,105,210,0.80)]",
};

const rarityOrder = (rarity) => {
  if (rarity === "Mythical") return 3;
  if (rarity === "Rare") return 2;
  return 1;
};
const API_BASE =
  (process.env.REACT_APP_API_URL || "").trim() ||
  (process.env.REACT_APP_API_BASE || "").trim() ||
  "http://localhost:3001";

export default function Inventory() {
  const { wallet } = useContext(WalletContext);
  const [cards, setCards] = useState([]);
  const [modalImage, setModalImage] = useState(null);
  const [modalRarity, setModalRarity] = useState("");
  const [modalName, setModalName] = useState("");
  const [modalMeta, setModalMeta] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState("All");
  const [sortRarity, setSortRarity] = useState("None");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const cardsPerPage = 40;

  useEffect(() => {
    if (!wallet) return;

    setLoading(true);

    axios
      .get(`${API_BASE}/api/inventory/${wallet}`)
      .then(({ data }) => {
        setCards(data.cards || []);
        setCurrentPage(1);
      })
      .catch((err) => console.error("Error fetching inventory:", err))
      .finally(() => setLoading(false));
  }, [wallet]);


  const openModal = (card) => {
    const effectiveRarity = card.rarity || getRarity(card.cardId);
    setModalImage(card.image || null);
    setModalRarity(effectiveRarity);
    setModalName(card.name || `NFT #${card.cardId}`);
    setModalMeta({
      cardId: card.cardId,
      mint: card.mint,
      isFree: !!card.isFree,
      count: card.count || 1,
      rarity: effectiveRarity,
    });
  };

  const closeModal = () => {
    setModalImage(null);
    setModalRarity("");
    setModalName("");
    setModalMeta(null);
  };

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return cards
      .filter((card) => {
        if (filterType === "Free") return card.isFree;
        if (filterType === "Paid") return !card.isFree;
        return true;
      })
      .filter((card) => {
        if (!q) return true;
        return (
          card.cardId?.toString().includes(q) ||
          (card.name || "").toLowerCase().includes(q) ||
          (card.mint || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ra = a.rarity || getRarity(a.cardId);
        const rb = b.rarity || getRarity(b.cardId);

        if (sortRarity === "Asc") return rarityOrder(ra) - rarityOrder(rb);
        if (sortRarity === "Desc") return rarityOrder(rb) - rarityOrder(ra);
        return 0;
      });
  }, [cards, filterType, searchQuery, sortRarity]);

  const totalPages = Math.ceil(filteredCards.length / cardsPerPage) || 1;
  const startIndex = (currentPage - 1) * cardsPerPage;
  const paginatedCards = filteredCards.slice(startIndex, startIndex + cardsPerPage);
  const totalCardCount = cards.reduce((sum, c) => sum + (c.count || 1), 0);

  const countsByRarity = useMemo(() => {
    const acc = { Common: 0, Rare: 0, Mythical: 0 };
    for (const c of cards) {
      const r = c.rarity || getRarity(c.cardId);
      acc[r] += c.count || 1;
    }
    return acc;
  }, [cards]);

  const isEmpty = !loading && filteredCards.length === 0;

  return (
    <div className="relative min-h-screen text-white font-silkscreen overflow-hidden">
      {/* Background */}
      <img src={bg2} alt="background" className="absolute inset-0 w-full h-full object-cover z-0" />
      <div className="absolute inset-0 bg-black/85 z-10" />

      {/* Cyberpunk FX overlays (pink/violet) */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 16% 18%, rgba(255,43,214,.22), transparent 40%)," +
            "radial-gradient(circle at 84% 62%, rgba(140,0,255,.18), transparent 52%)," +
            "linear-gradient(to bottom, rgba(0,0,0,.35), rgba(0,0,0,.85))",
        }}
      />
      <div
        className="absolute inset-0 z-10 pointer-events-none opacity-[0.20]"
        style={{
          background:
            "linear-gradient(transparent 0 92%, rgba(255,43,214,.16) 92% 93%, transparent 93%)," +
            "linear-gradient(90deg, transparent 0 92%, rgba(140,0,255,.14) 92% 93%, transparent 93%)",
          backgroundSize: "64px 64px",
          mixBlendMode: "screen",
        }}
      />
      <div
        className="absolute inset-0 z-10 pointer-events-none opacity-[0.12]"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, rgba(0,0,0,0) 7px, rgba(0,0,0,0) 12px)",
        }}
      />

      <div className="relative z-20">
        <Navbar />

        {/* Frame */}
        <div className="p-4 md:p-8">
          {/* Back */}
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                       bg-white/5 hover:bg-white/10 border border-white/15
                       text-white/90 text-xs md:text-sm
                       backdrop-blur-md shadow-[0_0_0_1px_rgba(255,43,214,0.06)_inset]"
          >
            <span className="opacity-90">←</span> Back
          </button>

          {/* Header block */}
          <div className="mt-4 mb-6 md:mb-8 rounded-2xl border border-white/15 bg-black/35 backdrop-blur-xl overflow-hidden
                          shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,43,214,0.08)_inset]">
            <div className="px-4 md:px-6 py-4 md:py-5 border-b border-white/10 bg-gradient-to-b from-black/55 to-black/20">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-[11px] tracking-[.30em] uppercase text-white/60">
                    Cyberio DApp / Inventory
                  </div>
                  <h1
                    className="mt-2 text-3xl md:text-5xl font-black uppercase tracking-[.22em]
                               text-[rgba(255,105,210,.98)]
                               drop-shadow-[0_0_18px_rgba(255,43,214,.22)]"
                  >
                    NFT Inventory
                  </h1>
                  <div className="mt-2 text-xs md:text-sm text-white/70 tracking-[.14em] uppercase">
                    Total NFTs Owned:{" "}
                    <span className="text-white/95 font-black tracking-[.20em]">{totalCardCount}</span>
                  </div>
                </div>

                {/* Telemetry pills */}
                <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                  <div className="px-3 py-2 rounded-xl border border-white/12 bg-white/5 backdrop-blur-md text-xs">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Common</div>
                    <div className="mt-1 font-black tracking-[.18em] text-white/90">
                      {countsByRarity.Common}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl border border-white/12 bg-white/5 backdrop-blur-md text-xs">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Rare</div>
                    <div className="mt-1 font-black tracking-[.18em] text-white/90">
                      {countsByRarity.Rare}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl border border-white/12 bg-white/5 backdrop-blur-md text-xs">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Mythical</div>
                    <div className="mt-1 font-black tracking-[.18em] text-white/90">
                      {countsByRarity.Mythical}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl border border-white/12 bg-white/5 backdrop-blur-md text-xs">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Wallet</div>
                    <div className="mt-1 font-black tracking-[.12em] text-white/90">
                      {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 md:px-6 py-4">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Sort</div>
                    <select
                      value={sortRarity}
                      onChange={(e) => setSortRarity(e.target.value)}
                      className="bg-black/45 text-white/90 px-3 py-2 rounded-xl border border-white/15
                                 focus:outline-none focus:ring-2 focus:ring-[rgba(255,43,214,0.25)]
                                 backdrop-blur-md"
                    >
                      <option value="None">Rarity (None)</option>
                      <option value="Asc">Rarity (Ascending)</option>
                      <option value="Desc">Rarity (Descending)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Filter</div>
                    <select
                      value={filterType}
                      onChange={(e) => {
                        setFilterType(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="bg-black/45 text-white/90 px-3 py-2 rounded-xl border border-white/15
                                 focus:outline-none focus:ring-2 focus:ring-[rgba(140,0,255,0.20)]
                                 backdrop-blur-md"
                    >
                      <option value="All">All</option>
                      <option value="Free">Free (Not Tradable)</option>
                      <option value="Paid">Paid (Tradable)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[260px]">
                    <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Search</div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by ID, Name, or Mint…"
                        className="w-full bg-black/45 text-white/90 px-3 py-2 pl-9 rounded-xl border border-white/15
                                   focus:outline-none focus:ring-2 focus:ring-[rgba(255,105,210,0.20)]
                                   backdrop-blur-md"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55 text-sm">
                        ⌕
                      </div>
                    </div>
                  </div>
                </div>

                {/* status */}
                <div className="flex items-center gap-3">
                  {loading && (
                    <div className="text-xs text-white/70 tracking-[.16em] uppercase">
                      Loading inventory…
                    </div>
                  )}
                  <div className="text-xs text-white/60 tracking-[.16em] uppercase">
                    Showing{" "}
                    <span className="text-white/90 font-black">
                      {paginatedCards.length}
                    </span>{" "}
                    /{" "}
                    <span className="text-white/90 font-black">
                      {filteredCards.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* subtle divider */}
              <div className="mt-4 h-px bg-gradient-to-r from-[rgba(255,43,214,0.22)] via-[rgba(140,0,255,0.18)] to-transparent opacity-90" />
            </div>
          </div>

          {/* Empty state */}
          {isEmpty && (
            <div className="rounded-2xl border border-white/12 bg-black/35 backdrop-blur-xl p-6 text-center">
              <div className="text-[11px] tracking-[.30em] uppercase text-white/60">
                No results
              </div>
              <div className="mt-2 text-white/85">
                Try clearing filters or changing your search.
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3 md:gap-4 mb-6">
            {paginatedCards.map((card, index) => {
              const { cardId, count, isFree, name, image, rarity } = card;
              const effectiveRarity = rarity || getRarity(cardId);

              return (
                <motion.button
                  key={`${card.mint || cardId}-${index}-${isFree ? "free" : "paid"}`}
                  onClick={() => openModal(card)}
                  whileHover={{ y: -2, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className={`group relative text-left rounded-2xl overflow-hidden aspect-[3/4]
                              border border-white/12 bg-black/35 backdrop-blur-xl
                              shadow-[0_18px_44px_rgba(0,0,0,0.40)]
                              ${rarityGlow[effectiveRarity] || ""}
                              focus:outline-none`}
                >
                  {/* neon edge sweep */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-45 transition-opacity"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,43,214,.12), rgba(140,0,255,.10), rgba(255,105,210,.08))",
                    }}
                  />

                  {/* scanlines */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.10]"
                    style={{
                      background:
                        "repeating-linear-gradient(to bottom, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, rgba(0,0,0,0) 6px, rgba(0,0,0,0) 12px)",
                      mixBlendMode: "overlay",
                    }}
                  />

                  {/* corners */}
                  <div className="absolute top-3 left-3 w-5 h-5 border-2 border-[rgba(255,43,214,0.40)] border-r-0 border-b-0 rounded-tl-[10px] opacity-90 pointer-events-none" />
                  <div className="absolute top-3 right-3 w-5 h-5 border-2 border-[rgba(255,43,214,0.40)] border-l-0 border-b-0 rounded-tr-[10px] opacity-90 pointer-events-none" />
                  <div className="absolute bottom-3 left-3 w-5 h-5 border-2 border-[rgba(140,0,255,0.36)] border-r-0 border-t-0 rounded-bl-[10px] opacity-85 pointer-events-none" />
                  <div className="absolute bottom-3 right-3 w-5 h-5 border-2 border-[rgba(140,0,255,0.36)] border-l-0 border-t-0 rounded-br-[10px] opacity-85 pointer-events-none" />

                  {/* image area */}
                  <div className="relative w-full h-full flex flex-col">
                    <div className="flex-1 p-3 flex items-center justify-center">
                      {image ? (
                        <img
                          src={image}
                          alt={name || `NFT #${cardId}`}
                          className="max-h-full max-w-full object-contain
                                     drop-shadow-[0_16px_44px_rgba(0,0,0,0.70)]
                                     group-hover:scale-[1.02] transition-transform"
                        />
                      ) : (
                        <div className="text-[10px] text-center px-2 text-white/70">
                          No image found
                        </div>
                      )}
                    </div>

                    {/* footer bar */}
                    <div className="px-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] tracking-[.28em] uppercase text-white/55">
                            #{cardId}
                          </div>
                          <div className="mt-1 text-[11px] font-black tracking-[.10em] text-white/90 truncate">
                            {name || `NFT #${cardId}`}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 px-2 py-1 rounded-xl border text-[10px] tracking-[.20em] uppercase
                                      ${rarityPill[effectiveRarity] || ""}`}
                        >
                          {effectiveRarity}
                        </div>
                      </div>

                      {/* divider */}
                      <div className="mt-3 h-px bg-white/10" />

                      {/* meta row */}
                      <div className="mt-2 flex items-center justify-between text-[10px] tracking-[.18em] uppercase text-white/60">
                        <span>{isFree ? "Free / Soulbound" : "Paid / Tradable"}</span>
                        <span className="text-white/80 font-black">x{count || 1}</span>
                      </div>
                    </div>
                  </div>

                  {/* count bubble (only when >1) */}
                  {(count || 1) > 1 && (
                    <div
                      className={`absolute top-3 left-3 w-10 h-10 text-[14px] flex items-center justify-center rounded-full
                                  font-black text-white shadow
                                  ${rarityBadgeFill[effectiveRarity] || "bg-white/20"}`}
                    >
                      ×{count}
                    </div>
                  )}

                  {/* FREE badge */}
                  {isFree && (
                    <div className="absolute bottom-3 left-3 text-[9px] font-black px-2 py-1 rounded-xl border
                                    bg-[rgba(255,43,214,0.14)] border-[rgba(255,43,214,0.32)] text-white/90
                                    shadow-[0_0_18px_rgba(255,43,214,0.12)] leading-tight">
                      FREE<br />NOT TRADABLE
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-3 items-center text-white">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-xl border border-white/12 bg-black/40 backdrop-blur-md
                           hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-black/40
                           shadow-[0_0_0_1px_rgba(255,43,214,0.06)_inset]"
              >
                Prev
              </button>

              <div className="px-4 py-2 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md text-xs tracking-[.18em] uppercase">
                Page <span className="text-white/95 font-black">{currentPage}</span> /{" "}
                <span className="text-white/95 font-black">{totalPages}</span>
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-xl border border-white/12 bg-black/40 backdrop-blur-md
                           hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-black/40
                           shadow-[0_0_0_1px_rgba(140,0,255,0.06)_inset]"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalImage && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/80" />

            {/* modal card */}
            <motion.div
              initial={{ scale: 0.92, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 10, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative w-[min(560px,92vw)] rounded-2xl overflow-hidden
                          border border-white/12 bg-black/55 backdrop-blur-xl
                          shadow-[0_24px_72px_rgba(0,0,0,0.70)]
                          ${rarityGlow[modalRarity] || ""}`}
            >
              {/* header */}
              <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-b from-black/55 to-black/20 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] tracking-[.30em] uppercase text-white/60">Preview</div>
                  <div className="mt-1 text-sm md:text-base font-black tracking-[.14em] text-white/90 truncate">
                    {modalName}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`px-2 py-1 rounded-xl border text-[10px] tracking-[.20em] uppercase
                                ${rarityPill[modalRarity] || ""}`}
                  >
                    {modalRarity}
                  </div>
                  <button
                    onClick={closeModal}
                    className="px-3 py-2 rounded-xl border border-white/12 bg-white/5 hover:bg-white/10 text-white/85"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* body */}
              <div className="p-4 md:p-5">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-3 md:p-4 flex items-center justify-center">
                  <img
                    src={modalImage}
                    alt="Enlarged NFT"
                    className="w-[min(420px,82vw)] h-auto object-contain
                               drop-shadow-[0_18px_44px_rgba(0,0,0,0.70)]"
                  />
                </div>

                {modalMeta && (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Card ID</div>
                      <div className="mt-1 font-black tracking-[.16em] text-white/90">
                        {modalMeta.cardId}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Type</div>
                      <div className="mt-1 font-black tracking-[.16em] text-white/90">
                        {modalMeta.isFree ? "FREE / SOULBOUND" : "PAID / TRADABLE"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 col-span-2">
                      <div className="text-[10px] tracking-[.28em] uppercase text-white/55">Mint</div>
                      <div className="mt-1 font-black tracking-[.10em] text-white/90 break-all">
                        {modalMeta.mint || "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* footer */}
              <div className="px-4 py-3 border-t border-white/10 bg-black/35 text-[10px] tracking-[.28em] uppercase text-white/60">
                Tap outside to close
              </div>

              {/* inner corners */}
              <div className="absolute top-3 left-3 w-6 h-6 border-2 border-[rgba(255,43,214,0.42)] border-r-0 border-b-0 rounded-tl-[12px] pointer-events-none" />
              <div className="absolute top-3 right-3 w-6 h-6 border-2 border-[rgba(255,43,214,0.42)] border-l-0 border-b-0 rounded-tr-[12px] pointer-events-none" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-2 border-[rgba(140,0,255,0.36)] border-r-0 border-t-0 rounded-bl-[12px] pointer-events-none" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-2 border-[rgba(140,0,255,0.36)] border-l-0 border-t-0 rounded-br-[12px] pointer-events-none" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
