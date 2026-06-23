// server/util/deck.js
// NON-NFT card decks: built straight from the player's database cards (User.cards).
// (The old NFT/DAS sync was removed when we abandoned NFT cards — see plan.md "v47".)
const User = require("../model/User");

/**
 * Build deck-ready data from the player's DATABASE cards.
 * User.cards = [{ cardId, name, power, count, isFree }] → expand each by `count` into the
 * deck pool. `cid` = the card id (the client maps it to local card art; dealHands assigns
 * a unique `uid` per dealt card, so duplicate cids are fine).
 * Returns:
 *   cardIds       = [{ cid, image, name, power, skill }]
 *   cardPowersMap = { [cid]: power }
 */
async function buildDeckFromDb(walletAddress) {
  const user = await User.findOne({ walletAddress }).lean().exec();
  const cards = (user && user.cards) || [];

  const cardIds = [];
  const cardPowersMap = {};
  for (const c of cards) {
    const cid = String(c.cardId);
    const power = Number(c.power) || 0;
    cardPowersMap[cid] = power;
    const count = Math.max(1, Number(c.count) || 1);
    for (let i = 0; i < count; i++) {
      cardIds.push({ cid, image: null, name: c.name || cid, power, skill: null });
    }
  }

  console.log("[DECK] DB deck size for", walletAddress, "=", cardIds.length);
  return { cardIds, cardPowersMap };
}

/** Used during rounds – look up stored power on the socket. */
function getCardPowerFromSocket(socket, cid) {
  if (!socket || !socket.cardPowers) return 0;
  return socket.cardPowers[cid] ?? 0;
}

module.exports = { buildDeckFromDb, getCardPowerFromSocket };
