// server/model/NftAsset.js
const mongoose = require("mongoose");

const NftAssetSchema = new mongoose.Schema(
  {
    // mint / asset id
    cid: { type: String, required: true, index: true },

    // owner wallet base58
    ownerWallet: { type: String, required: true, index: true },

    // collection id (group_value)
    collectionId: { type: String, default: null, index: true },

    name: { type: String, default: "" },
    image: { type: String, default: "" },

    power: { type: Number, default: 0 },

    attributes: { type: Array, default: [] },
    raw: { type: Object, default: {} },

    lastSyncedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true, // prevents warnings if any reserved keys appear
  }
);

// No duplicates per wallet
NftAssetSchema.index({ cid: 1, ownerWallet: 1 }, { unique: true });

module.exports = mongoose.model("NftAsset", NftAssetSchema);
