const mongoose = require("mongoose");

/**
 * This model maps to your EXISTING MongoDB collection: `nftassets`
 * It matches the fields shown in your screenshot (ownerWallet, power, name, image, collectionId, etc).
 *
 * IMPORTANT:
 * - This does NOT sync from chain.
 * - This does NOT write anything.
 * - It only reads whatever your sync job already writes to MongoDB.
 */
const NftAssetDbSchema = new mongoose.Schema(
  {
    cid: { type: String, index: true },
    ownerWallet: { type: String, required: true, index: true },

    // core metadata
    name: { type: String, default: "" },
    image: { type: String, default: "" },
    collectionId: { type: String, index: true },

    // gameplay
    power: { type: Number, default: 0, index: true },
    skill: { type: String, default: "" },
    skillPower: { type: Number, default: null },
    powerSource: { type: String, default: "" },

    // optional: stored blobs from sync
    attributes: { type: Array, default: [] },
    raw: { type: Object, default: {} },

    // sync timestamps
    lastSyncedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "nftassets", // <-- force the correct existing collection name
  }
);

// Helpful indexes for eligibility queries
NftAssetDbSchema.index({ ownerWallet: 1, power: 1 });
NftAssetDbSchema.index({ ownerWallet: 1, collectionId: 1 });

module.exports = mongoose.model("NftAssetDb", NftAssetDbSchema);
