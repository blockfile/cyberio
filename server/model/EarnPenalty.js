const mongoose = require("mongoose");

// PVE/NPC-battle anti-spam penalty (server-enforced).
// One doc per wallet. A loss, surrender, or abandon (disconnect that doesn't
// reconnect within the grace window) records an offense and starts a cooldown.
// penalty = min(BASE * offenseCount, MAX). offenseCount resets on a win and
// auto-decays (treated as 0) once lastOffenseAt is older than the decay window.
const EarnPenaltySchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, unique: true, index: true },

    penaltyUntil: { type: Date, default: null },   // cannot start a new NPC fight until this passes
    offenseCount: { type: Number, default: 0 },    // consecutive penalized exits (for escalation)
    lastOffenseAt: { type: Date, default: null },  // when the last offense happened (for decay)
    lastReason: { type: String, default: null },   // "loss" | "surrender" | "abandon"
  },
  { timestamps: true }
);

module.exports = mongoose.model("EarnPenalty", EarnPenaltySchema);
