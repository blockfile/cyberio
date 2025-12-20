// src/components/play/DuelView.jsx
import React from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { cardHover, cardTap, fadeInUp, imgSrc } from "./shared";

export function DuelView(props) {
    const {
        wallet,
        opponent,
        selfScore,
        opponentScore,
        oppGone,
        oppReconnectSeconds,
        roundSecondsLeft,
        status,
        selfCards,
        opponentCards,
        selfFieldCard,
        opponentFieldCard,
        selfEndedTurn,
        opponentEndedTurn,
        timerPct,
        matchOver,
        reveal,
        fighting,
        lastReveal,
        handleCardSelect,
        handleEndTurn,
        pendingUid,
    } = props;

    const isWinnerSelf = lastReveal.winner === "self";
    const isWinnerOpp = lastReveal.winner === "opponent";

    // Safety: opponent draw pile should always be some "back" cards
    const safeOpponentCards =
        opponentCards && opponentCards.length
            ? opponentCards
            : ["back", "back", "back"];

    return (
        <LayoutGroup>
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center text-white">
                {/* HUD left */}
                <div className="absolute top-4 left-4 text-white z-20 space-y-1 text-sm">
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
                        <p className="text-yellow-300">
                            Round timer: {roundSecondsLeft}s
                        </p>
                    )}
                </div>

                {/* Opponent hand / draw pile */}
                <div className="w-full max-w-5xl mx-auto">
                    <div className="mx-auto mb-3 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-white/10 border border-white/15">
                        Opponent Draw Pile
                    </div>
                    <div className="relative mx-auto flex justify-center gap-3 mb-5">
                        <AnimatePresence initial={false}>
                            {safeOpponentCards.map((card, i) => (
                                <motion.div
                                    key={`opp-${i}`}
                                    layout
                                    {...fadeInUp}
                                    className="relative"
                                >
                                    <motion.img
                                        src={imgSrc(card === "back" ? "back" : card)}
                                        className="w-24 h-36 rounded-xl shadow border border-white/10 bg-white/5"
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Field boxes */}
                <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 items-center gap-4 md:gap-8">
                    {/* Opp field */}
                    <div className="md:justify-self-end">
                        <div className="relative rounded-2xl p-3 bg-white/7 border border-yellow-300/30 backdrop-blur-md">
                            <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-yellow-500/80 text-black font-bold uppercase tracking-widest">
                                Opponent Field
                            </div>
                            <div className="relative w-32 h-44 mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-yellow-900/40 to-yellow-900/10 border-2 border-yellow-400/70">
                                {opponentFieldCard ? (
                                    <motion.img
                                        key={`opp-field-${String(
                                            typeof opponentFieldCard === "object"
                                                ? opponentFieldCard.cid
                                                : opponentFieldCard
                                        )}`}
                                        src={imgSrc(opponentFieldCard)}
                                        className="w-[95%] h-[95%] object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-yellow-300">
                                        <span className="text-xl">⚔️</span>
                                        <span className="text-[10px] opacity-80">Place</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Center VS */}
                    <div className="hidden md:flex items-center justify-center">
                        <div className="rounded-full px-4 py-2 border border-white/15 bg-white/10 text-sm tracking-wide">
                            VS
                        </div>
                    </div>

                    {/* Your field */}
                    <div className="md:justify-self-start">
                        <div className="relative rounded-2xl p-3 bg-white/7 border border-red-300/30 backdrop-blur-md">
                            <div className="absolute -top-3 left-3 text-[10px] px-2 py-[2px] rounded-full bg-red-500/80 text-white font-bold uppercase tracking-widest">
                                Your Field
                            </div>
                            <div className="relative w-32 h-44 mx-auto flex items-center justify-center rounded-xl bg-gradient-to-b from-red-900/40 to-red-900/10 border-2 border-red-400/70">
                                {selfFieldCard ? (
                                    <motion.img
                                        key={`self-field-${selfFieldCard.uid || selfFieldCard.cid || selfFieldCard}`}
                                        src={imgSrc(selfFieldCard)}
                                        className="w-[95%] h-[95%] object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-rose-200">
                                        <span className="text-xl">⚔️</span>
                                        <span className="text-[10px] opacity-80">Place</span>
                                    </div>
                                )}
                                {!selfFieldCard && (
                                    <div className="absolute inset-1 rounded-lg border-2 border-dashed border-white/15 pointer-events-none" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Your hand */}
                <div className="w-full max-w-5xl mx-auto mt-6">
                    <div className="mx-auto mb-2 w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-widest bg-white/10 border border-white/15">
                        Your Hand
                    </div>
                    <div className="relative rounded-3xl px-4 py-5 border border-white/15 bg-gradient-to-t from-black/40 to-white/5 backdrop-blur-md">
                        <div
                            className={`flex flex-wrap justify-center gap-3 ${matchOver ? "pointer-events-none" : ""
                                }`}
                        >
                            <AnimatePresence initial={false}>
                                {selfCards.map((card) => {
                                    const isPending = pendingUid === card.uid;
                                    return (
                                        <motion.div
                                            key={card.uid}
                                            layout
                                            {...fadeInUp}
                                            className={`relative w-24 h-36 rounded-2xl ${isPending ? "opacity-70" : ""
                                                }`}
                                        >
                                            <motion.img
                                                src={imgSrc(card)}
                                                className={`relative w-full h-full rounded-2xl cursor-pointer border border-white/15 bg-white/5 ${isPending ? "cursor-wait" : ""
                                                    }`}
                                                whileHover={isPending ? undefined : cardHover}
                                                whileTap={isPending ? undefined : cardTap}
                                                onClick={() => !isPending && handleCardSelect(card)}
                                            />
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

                {/* Big VS overlay */}
                <AnimatePresence>
                    {reveal && fighting && (lastReveal.yourCard || lastReveal.oppCard) && (
                        <motion.div
                            className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="bg-slate-900/90 border border-white/20 rounded-3xl p-6 max-w-3xl w-[92%] text-white grid grid-cols-3 gap-4 items-center">
                                <div className="text-center">
                                    <div className="text-[10px] uppercase opacity-70 mb-1">
                                        You
                                    </div>
                                    <img
                                        src={imgSrc(lastReveal?.yourCard)}
                                        className={`h-40 mx-auto rounded-xl border ${isWinnerSelf
                                                ? "border-yellow-300 shadow-[0_0_30px_rgba(253,224,71,0.4)]"
                                                : "border-white/20"
                                            }`}
                                    />
                                </div>
                                <div className="text-center text-xl font-bold">
                                    VS
                                    <div className="mt-2 text-sm opacity-80">
                                        {isWinnerSelf
                                            ? "You prevail!"
                                            : isWinnerOpp
                                                ? "Opponent prevails"
                                                : "Draw"}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[10px] uppercase opacity-70 mb-1">
                                        Opponent
                                    </div>
                                    <img
                                        src={imgSrc(lastReveal?.oppCard)}
                                        className={`h-40 mx-auto rounded-xl border ${isWinnerOpp
                                                ? "border-yellow-300 shadow-[0_0_30px_rgba(253,224,71,0.4)]"
                                                : "border-white/20"
                                            }`}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </LayoutGroup>
    );
}
