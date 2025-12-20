// src/components/play/LobbyView.jsx
import React from "react";
import { motion } from "framer-motion";
import { shortPk } from "./shared";

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
        >
            {children}
        </button>
    );
}

export function LobbyView(props) {
    const {
        mode,
        setMode,
        status,
        betAmount,
        setBetAmount,
        findMatch,
        cancelFindMatch,
        opponent,
        isFirst,
        negotiation,
        sendOffer,
        acceptProposal,
        counterProposal,
        confirmMatch,
        isSendingTx,
        selfConfirmed,
        opponentConfirmed,
        txError,
        oppCountdown,
    } = props;

    return (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center text-white">
            <motion.h1
                className="text-3xl md:text-5xl font-bold mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                ⚔️ Duel Arena
            </motion.h1>

            {/* IDLE */}
            {status === "idle" && (
                <motion.div
                    className="w-full max-w-xl mx-auto rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-900/20 to-amber-700/10 p-6"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <div className="text-left">
                        <div className="text-xs uppercase tracking-widest opacity-80">
                            Choose Your Path
                        </div>
                        <div className="text-2xl font-extrabold text-amber-300">
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
                    className="w-full max-w-md mx-auto rounded-2xl border border-blue-400/30 bg-gradient-to-b from-blue-900/20 to-indigo-700/10 p-6"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <div className="text-xs uppercase tracking-widest opacity-80">
                        Divining Opponents
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-blue-300">
                        Casting the Matchmaking Rune…
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
                    className="w-full max-w-xl mx-auto rounded-2xl border border-emerald-400/30 bg-gradient-to-b from-emerald-900/20 to-emerald-700/10 p-6"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <div className="flex items-center justify-between">
                        <div className="text-left">
                            <div className="text-xs uppercase tracking-widest opacity-80">
                                Opponent Found ·{" "}
                                {mode === "friendly" ? "Friendly" : "Quick"}
                            </div>
                            <div className="text-2xl font-extrabold text-emerald-300">
                                {shortPk(opponent)}
                            </div>
                        </div>
                        <div className="hidden md:block text-3xl">🛡️</div>
                    </div>

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
                                        onChange={(e) =>
                                            setBetAmount(+e.target.value)
                                        }
                                        className="w-full accent-emerald-300 mt-2"
                                    />
                                </div>
                                <motion.button
                                    onClick={sendOffer}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.97 }}
                                    className="rpg-button mt-5 w-full"
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
                            Friendly match – no betting. Duel will begin
                            automatically when both are ready.
                        </p>
                    )}
                </motion.div>
            )}

            {/* PROPOSING */}
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

            {/* NEGOTIATION */}
            {status === "negotiation" && negotiation && mode === "quick" && (
                <motion.div
                    className="w-full max-w-xl mx-auto rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-900/20 to-amber-700/10 p-6"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <div className="text-xs uppercase tracking-widest opacity-80">
                        Offer Received
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-amber-300">
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

            {/* CONFIRMING */}
            {status === "confirming" && mode === "quick" && (
                <motion.div
                    className="w-full max-w-xl mx-auto rounded-2xl border border-teal-400/30 bg-gradient-to-b from-teal-900/20 to-teal-700/10 p-6"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <div className="flex items-center justify-between">
                        <div className="text-left">
                            <div className="text-xs uppercase tracking-widest opacity-80">
                                Confirmation
                            </div>
                            <div className="text-2xl font-extrabold text-teal-300">
                                Wager {betAmount.toFixed(2)} SOL
                            </div>
                        </div>
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

                    <div className="mt-3 grid sm:grid-cols-2 gap-3 text-left text-sm">
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-[11px] uppercase opacity-70 mb-1">
                                Opponent
                            </div>
                            <div className="font-semibold">{shortPk(opponent)}</div>
                            {opponentConfirmed && (
                                <div className="mt-1 text-emerald-300 text-xs">
                                    ✅ Opponent confirmed
                                </div>
                            )}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-[11px] uppercase opacity-70 mb-1">
                                Escrow Timer
                            </div>
                            <div className="font-semibold">
                                {oppCountdown !== null ? `${oppCountdown}s` : "—"}
                            </div>
                            <div className="text-[11px] opacity-80">
                                Auto-refund if they don’t pay
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
