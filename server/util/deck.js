// server/util/deck.js
const axios = require("axios");
const NftAsset = require("../model/NftAsset");

/**
 * DAS endpoint:
 *  - Prefer DAS_RPC in env
 *  - Fallback to SOLANA_RPC if that URL is DAS-compatible
 */
const DAS_ENDPOINT = process.env.DAS_RPC || process.env.SOLANA_RPC;

if (!DAS_ENDPOINT) {
  console.warn(
    "[DECK] WARNING: DAS_ENDPOINT not set. Set DAS_RPC or SOLANA_RPC to a DAS-compatible URL."
  );
}

/**
 * Single allowed collection ID.
 * Example in .env:
 *   SD_COLLECTION_ID=AZAb4kFUY4YpB2fuKKNZCNyZft2AdmxkhodJQhWDCq6U
 */
const SD_COLLECTION_ID = process.env.SD_COLLECTION_ID || null;

if (SD_COLLECTION_ID) {
  console.log("[DECK] Using SD_COLLECTION_ID filter:", SD_COLLECTION_ID);
} else {
  console.warn(
    "[DECK] SD_COLLECTION_ID is not set – ALL collections will be accepted."
  );
}

/**
 * Call DAS getAssetsByOwner
 */
async function fetchDasAssetsByOwner(ownerWallet, withRetry) {
  const body = {
    jsonrpc: "2.0",
    id: "get-assets",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: ownerWallet,
      page: 1,
      limit: 1000,
      options: {
        showCollectionMetadata: true,
        showUnverifiedCollections: true,
      },
    },
  };

  const doCall = async () => {
    const { data } = await axios.post(DAS_ENDPOINT, body, {
      headers: { "Content-Type": "application/json" },
    });
    if (!data?.result?.items) return [];
    return data.result.items;
  };

  if (withRetry) {
    return await withRetry(doCall);
  }
  return await doCall();
}

/**
 * Power function – reads from attributes.
 * Expected metadata.attributes like:
 *  [
 *    { trait_type: "Power", value: 5 },
 *    ...
 *  ]
 */
function computePowerFromAttributes(attributes) {
  if (!Array.isArray(attributes)) return 0;

  // Prefer explicit power-like trait
  const powerTrait = attributes.find((a) => {
    const t = (a?.trait_type || "").toString().toLowerCase();
    return ["power", "atk", "attack"].includes(t);
  });

  if (powerTrait) {
    const rawVal = powerTrait.value;
    if (typeof rawVal === "number") return rawVal;
    if (typeof rawVal === "string") {
      const num = parseFloat(rawVal.replace(/[^\d.\-]/g, ""));
      if (!Number.isNaN(num)) return num;
    }
  }

  // Fallback: at least 1, scaled by attribute count
  return attributes.length > 0 ? attributes.length : 1;
}

/**
 * Sync wallet NFTs from DAS into Mongo.
 * - If SD_COLLECTION_ID is set, only NFTs in that collection are stored.
 * - After sync, any NFTs that this wallet no longer owns are removed.
 */
async function syncWalletNftsToDb(walletAddress, withRetry) {
  console.log("[DECK] syncing wallet NFTs to DB:", walletAddress);

  const items = await fetchDasAssetsByOwner(walletAddress, withRetry);
  console.log("[DECK] DAS total items:", items.length);

  if (items.length > 0) {
    const sampleGrouping = items[0].grouping || [];
    console.log("QuickNode items length:", items.length);
    console.log("Example asset.grouping:", sampleGrouping);
  }

  let saved = 0;
  let skipped = 0;
  let skippedWrongCollection = 0;
  let skippedNoCid = 0;

  // Track CIDs the wallet currently owns (after filtering)
  const currentCids = new Set();

  // 1) Optional collection filter
  let filteredItems = items;

  if (SD_COLLECTION_ID) {
    filteredItems = items.filter((asset) => {
      const groupingArr = Array.isArray(asset.grouping)
        ? asset.grouping
        : [];

      const colEntry = groupingArr.find(
        (g) => g.group_key === "collection"
      );

      const collectionId = colEntry?.group_value || null;

      if (collectionId !== SD_COLLECTION_ID) {
        console.log("[DECK] skip asset not in SD_COLLECTION_ID:", {
          assetId: asset.id,
          collectionId,
        });
        skipped++;
        skippedWrongCollection++;
        return false;
      }
      return true;
    });

    console.log(
      "Filtered by collection, remaining assets:",
      filteredItems.length
    );
  }

  // 2) Upsert all filtered assets
  for (const asset of filteredItems) {
    const cid = asset.id; // DAS asset id

    if (!cid) {
      skipped++;
      skippedNoCid++;
      continue;
    }

    const image =
      asset?.content?.links?.image ||
      asset?.content?.files?.[0]?.uri ||
      "";
    const name =
      asset?.content?.metadata?.name ||
      asset?.content?.metadata?.symbol ||
      cid;
    const attributes = asset?.content?.metadata?.attributes || [];

    const power = computePowerFromAttributes(attributes);

    // Resolve collectionId again for storage
    const groupingArr = Array.isArray(asset.grouping) ? asset.grouping : [];
    const colEntry = groupingArr.find(
      (g) => g.group_key === "collection"
    );
    const collectionId = colEntry?.group_value || null;

    await NftAsset.updateOne(
      { cid, ownerWallet: walletAddress },
      {
        cid,
        ownerWallet: walletAddress,
        collectionId,
        name,
        image,
        power,
        attributes,
        raw: asset,
        lastSyncedAt: new Date(),
      },
      { upsert: true }
    );

    currentCids.add(cid);
    saved++;
  }

  // 3) Delete stale NFTs that this wallet no longer owns
  const deleteRes = await NftAsset.deleteMany({
    ownerWallet: walletAddress,
    cid: { $nin: Array.from(currentCids) },
  });

  console.log(
    "[DECK] sync done:",
    JSON.stringify({
      saved,
      skipped,
      skippedWrongCollection,
      skippedNoCid,
      deletedStale: deleteRes.deletedCount,
    })
  );

  return {
    saved,
    skipped,
    skippedWrongCollection,
    skippedNoCid,
    deletedStale: deleteRes.deletedCount,
  };
}

/**
 * Build deck-ready data from DB.
 * Returns:
 *   cardIds    = [{ cid, image, name }]
 *   cardPowers = { [cid]: power }
 */
async function buildDeckFromDb(walletAddress) {
  console.log("[DECK] building deck from DB for wallet:", walletAddress);

  const docs = await NftAsset.find({ ownerWallet: walletAddress })
    .lean()
    .exec();

  const cardIds = docs.map((d) => ({
    cid: d.cid,
    image: d.image || null,
    name: d.name || null,
  }));

  const cardPowersMap = {};
  for (const d of docs) {
    cardPowersMap[d.cid] = typeof d.power === "number" ? d.power : 0;
  }

  console.log("[DECK] final deck size:", cardIds.length);
  return { cardIds, cardPowersMap };
}

/**
 * Used during rounds – look up stored power on the socket.
 */
function getCardPowerFromSocket(socket, cid) {
  if (!socket || !socket.cardPowers) return 0;
  return socket.cardPowers[cid] ?? 0;
}

module.exports = {
  syncWalletNftsToDb,
  buildDeckFromDb,
  getCardPowerFromSocket,
};
