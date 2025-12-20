const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    sellerWallet: { type: String, index: true, required: true },
    buyerWallet: { type: String, index: true },

    cardId: { type: String, required: true },
    name: { type: String, required: true },
    power: { type: Number, required: true },

    priceSD: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },

    // include "locked"
    status: {
      type: String,
      enum: ["active", "locked", "pending", "sold", "cancelled"],
      default: "active",
      index: true,
    },

    /** Reservation / intent (who is buying & proof string) */
    holdBuyer: { type: String, index: true, default: null },
    pendingMemo: { type: String, default: null, index: true },
    lockedAt: { type: Date, default: null, index: true },

    /** Idempotency: we store the tx once processed */
    purchaseTxSig: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Helpful indexes for queries & cleanup
listingSchema.index({ status: 1, lockedAt: 1 });
listingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Listing", listingSchema);
