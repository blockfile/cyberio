// server/model/NftAsset.js
const mongoose = require("mongoose");

const NftAssetSchema = new mongoose.Schema(
  {
    // DAS asset id / mint
    cid: { type: String, required: true, index: true },

    // owner wallet base58
    ownerWallet: { type: String, required: true, index: true },

    // collection (DAS grouping.group_value for group_key === "collection")
    collectionId: { type: String, default: null, index: true },

    name: { type: String, default: "" },
    image: { type: String, default: "" },

    // computed stat
    power: { type: Number, default: 0 },
    skill: { type: String, default: "" },
    skillPower: { type: Number, default: null },
    powerSource: { type: String, default: "" },

    // traits from metadata
    attributes: { type: Array, default: [] },

    // raw DAS asset object
    raw: { type: Object, default: {} },

    lastSyncedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Ensure no duplicates per wallet / asset
NftAssetSchema.index({ cid: 1, ownerWallet: 1 }, { unique: true });

module.exports = mongoose.model("NftAsset", NftAssetSchema);
