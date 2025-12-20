const mongoose = require("mongoose");

const EarnNpcSessionSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ["ACTIVE", "ENDED", "CANCELED"],
      default: "ACTIVE",
      index: true,
    },

    // Player hand from your DB deck (NFTs/cards)
    selfCards: { type: Array, default: [] },

    // NPC hand (server generated)
    npcCards: { type: Array, default: [] },

    // Current round
    round: { type: Number, default: 1 },
    maxRounds: { type: Number, default: 3 },

    // Score
    selfScore: { type: Number, default: 0 },
    npcScore: { type: Number, default: 0 },

    // Current plays
    selfFieldCard: { type: Object, default: null },
    npcFieldCard: { type: Object, default: null },

    // Ended turn flags
    selfEndedTurn: { type: Boolean, default: false },
    npcEndedTurn: { type: Boolean, default: false },

    // Result
    winner: { type: String, default: null }, // "self" | "npc" | "draw"
    endedAt: { type: Date, default: null },

    // Anti-abuse / audit
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EarnNpcSession", EarnNpcSessionSchema);
