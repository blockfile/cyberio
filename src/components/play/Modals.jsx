// src/components/play/Modals.jsx
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { shortPk } from "./shared";

export function NetBanner({ netDown }) {
    return (
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
    );
}

export function InfoModal({ infoModal, setInfoModal }) {
    return (
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
                        onClick={() =>
                            setInfoModal((m) => ({ ...m, open: false }))
                        }
                    />
                    <motion.div
                        className="relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden bg-gradient-to-b from-slate-800/80 to-slate-700/60 border border-white/15 text-white"
                        initial={{ scale: 0.94, y: 8, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.98, y: -6, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 160, damping: 18 }}
                    >
                        <div className="text-xs uppercase tracking-widest opacity-80">
                            Notice
                        </div>
                        <h3 className="mt-1 text-2xl font-extrabold text-amber-300">
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function RoundResultModal({ roundModal, roundPct }) {
    return (
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
                        className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden border text-white ${roundModal.outcome === "self"
                                ? "bg-amber-700/40 border-amber-300/70"
                                : roundModal.outcome === "opponent"
                                    ? "bg-rose-700/40 border-rose-300/70"
                                    : "bg-slate-700/40 border-slate-300/70"
                            }`}
                        initial={{ scale: 0.92, y: 10, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.96, y: -8, opacity: 0 }}
                    >
                        <h2 className="text-2xl font-bold mb-2">
                            {roundModal.outcome === "self"
                                ? "You win the round"
                                : roundModal.outcome === "opponent"
                                    ? "Opponent wins the round"
                                    : "Round is a draw"}
                        </h2>
                        <p className="text-sm opacity-90 mb-4">
                            The duel continues to the next hand.
                        </p>
                        <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                            <motion.div
                                className="h-2 bg-white"
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function MatchResultModal({ resultModal, resultPct, wallet }) {
    const isYouWinner =
        resultModal.open && resultModal.winner === wallet;
    return (
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
                        className={`relative mx-4 max-w-md w-[92%] rounded-2xl p-6 text-center overflow-hidden border text-white ${isYouWinner
                                ? "bg-yellow-600/30 border-yellow-300/70"
                                : "bg-red-600/30 border-red-300/70"
                            }`}
                        initial={{ scale: 0.92, y: 12, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.96, y: -8, opacity: 0 }}
                    >
                        <div className="text-xs uppercase tracking-widest opacity-80">
                            Match Result
                        </div>
                        <h2 className="mt-2 text-3xl font-extrabold">
                            {resultModal.forfeit
                                ? isYouWinner
                                    ? "Victory by Forfeit"
                                    : "Defeat by Forfeit"
                                : isYouWinner
                                    ? "Victory"
                                    : "Defeat"}
                        </h2>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                            <div className="text-left">
                                <div className="text-[10px] uppercase opacity-70">
                                    Winner
                                </div>
                                <div className="font-semibold">
                                    {shortPk(resultModal.winner)}
                                </div>
                            </div>
                            <div className="text-center text-xs opacity-70 mt-4">
                                vs
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase opacity-70">
                                    Loser
                                </div>
                                <div className="font-semibold">
                                    {shortPk(resultModal.loser)}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 h-2 w-full bg-white/20 rounded-full overflow-hidden">
                            <motion.div
                                className="h-2 bg-white"
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
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function BonusModal({ open, onClose }) {
    return (
        <AnimatePresence>
            {open && (
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
                    <button onClick={onClose} className="mt-6 rpg-button bg-blue-600">
                        Continue Duel
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
