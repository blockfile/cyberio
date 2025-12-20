const mongoose = require("mongoose");

const PassPurchaseIntentSchema = new mongoose.Schema(
  {
    escrowId: { type: String, required: true, unique: true, index: true },
    wallet: { type: String, required: true, index: true },

    durationDays: { type: Number, required: true },
    priceUi: { type: Number, required: true },      // e.g. 5
    amountRaw: { type: String, required: true },    // BigInt as string

    mint: { type: String, required: true },
    treasuryAta: { type: String, required: true },
    tokenProgramId: { type: String, required: true },

    memo: { type: String, required: true },

    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "EXPIRED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    confirmedTxid: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true }, // intent expiration (e.g. now+10m)
  },
  { timestamps: true }
);

PassPurchaseIntentSchema.index({ wallet: 1, status: 1 });
PassPurchaseIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-clean

module.exports = mongoose.model("PassPurchaseIntent", PassPurchaseIntentSchema);
