// server/model/Payout.js
// Tracks PVP match winner payouts so a failed/slow on-chain transfer is never lost —
// pending records are retried by sweepPendingPayouts() until paid (or capped → failed).
const mongoose = require("mongoose");

const PayoutSchema = new mongoose.Schema(
  {
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", default: null, index: true },
    room: { type: String, default: null },
    winner: { type: String, required: true, index: true },
    amountRaw: { type: String, required: true }, // raw token units, stored as string (no precision loss)
    mint: { type: String, required: true },
    decimals: { type: Number, default: 6 },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending", index: true },
    txid: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    lastAttemptAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Payout", PayoutSchema);
