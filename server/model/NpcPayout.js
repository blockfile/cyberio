// server/model/NpcPayout.js
const mongoose = require("mongoose");

const NpcPayoutSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    txid: { type: String, default: null },
    amount: { type: Number, required: true }, // human units, e.g. 10
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// prevent double payout for same wallet+session
NpcPayoutSchema.index({ wallet: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model("NpcPayout", NpcPayoutSchema);
