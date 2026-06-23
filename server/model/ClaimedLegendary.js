const mongoose = require("mongoose");

// One row per Legendary cardId that has been drawn. Because each Legendary can only be
// claimed once (globally), at most ~20 (the power-10 cards) ever circulate.
const ClaimedLegendarySchema = new mongoose.Schema(
  {
    cardId: { type: String, required: true, unique: true, index: true },
    wallet: { type: String, default: "" },
    txid: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClaimedLegendary", ClaimedLegendarySchema);
