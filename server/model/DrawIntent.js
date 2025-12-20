const mongoose = require("mongoose");

const drawIntentSchema = new mongoose.Schema(
  {
    wallet: { type: String, index: true, required: true },
    memo: { type: String, index: true, required: true, unique: true },
    priceSD: { type: Number, required: true }, // e.g., 20
    status: {
      type: String,
      enum: ["locked", "completed", "expired"],
      default: "locked",
      index: true,
    },
    // store the tx the draw was finalized with (idempotency)
    txSignature: { type: String, unique: true, sparse: true },
    // if you want timeboxing (optional cleanup job can expire old locks)
    lockedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DrawIntent", drawIntentSchema);
