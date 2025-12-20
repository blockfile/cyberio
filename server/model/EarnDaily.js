const mongoose = require("mongoose");

const EarnDailySchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, index: true },
    day: { type: String, required: true, index: true }, // YYYY-MM-DD (UTC)

    total: { type: Number, default: 0 },          // total earned today
    matchesPlayed: { type: Number, default: 0 },  // matches played today
    lockedUntil: { type: Date, default: null },   // cooldown after limit
  },
  { timestamps: true }
);

EarnDailySchema.index({ wallet: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("EarnDaily", EarnDailySchema);
