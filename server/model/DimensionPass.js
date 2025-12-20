const mongoose = require("mongoose");

const DimensionPassSchema = new mongoose.Schema(
  {
    wallet: { type: String, required: true, index: true },
    durationDays: { type: Number, required: true },
    expiresAt: { type: Date, required: true, index: true },

    // audit
    lastPurchaseTxid: { type: String, default: "" },
    lastEscrowId: { type: String, default: "" },
  },
  { timestamps: true }
);

DimensionPassSchema.index({ wallet: 1 }, { unique: true });

module.exports = mongoose.model("DimensionPass", DimensionPassSchema);
