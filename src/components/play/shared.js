// src/components/play/shared.js
import duelfield from "../assets/images/duelfield.jpg";
import backImage from "../assets/images/back.png";
import bs58 from "bs58";

/* ------------ Image loader for monster art (fallback only) ------------ */
function importAll(r) {
  const images = {};
  r.keys().forEach((item) => {
    const key = item.replace("./", "").replace(".png", "");
    images[key] = r(item);
  });
  return images;
}

const monsterImages = importAll(
  require.context("../assets/images/monsters", false, /\.png$/)
);

const monsterKeys = Object.keys(monsterImages).sort();

function spriteFromCid(cid) {
  if (!monsterKeys.length || !cid) return backImage;

  try {
    const bytes = bs58.decode(String(cid));
    let sum = 0;
    for (const b of bytes) sum += b;

    const idx = sum % monsterKeys.length;
    const key = monsterKeys[idx];
    return monsterImages[key] || backImage;
  } catch (e) {
    console.error("[shared] spriteFromCid error:", e?.message || e);
    return backImage;
  }
}

/**
 * IMPORTANT:
 * - if server provides card.image (NFT URL), USE IT.
 * - only fallback to local monster sprite when image is missing.
 */
export function imgSrc(cardLike) {
  if (!cardLike) return backImage;

  // "back" sentinel
  if (cardLike === "back") return backImage;

  // object shape (from server)
  if (typeof cardLike === "object") {
    // Prefer real NFT image when present
    const direct =
      cardLike.image || cardLike.cardImage || cardLike.img || cardLike.uri;
    if (direct) return direct;

    const cid = cardLike.cid || cardLike.mint || cardLike.id;
    if (cid) return spriteFromCid(cid);
    return backImage;
  }

  // string mint/cid
  if (typeof cardLike === "string") {
    return spriteFromCid(cardLike);
  }

  return backImage;
}

export const cardHover = { y: -10, rotate: -1.5 };
export const cardTap = { scale: 0.96 };

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

export const MATCH_RESULT_MS = 4200;
export const ROUND_RESULT_MS = 2600;

export function derivePowerFromCid(cid) {
  if (!cid) return null;
  try {
    const bytes = bs58.decode(String(cid));
    let sum = 0;
    for (const b of bytes) sum += b;
    return 10 + (sum % 31);
  } catch {
    return null;
  }
}

export function shortPk(pk) {
  if (!pk) return "—";
  const s = String(pk);
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export { duelfield, backImage };
