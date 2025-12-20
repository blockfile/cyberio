// server/index.js (only the sweeper part; put near the bottom after app.listen)
const Listing = require("./model/Listing");
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function unlockStaleLocks() {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS);
  try {
    const res = await Listing.updateMany(
      {
        status: "locked",
        lockedAt: { $lte: cutoff },
      },
      {
        $set: {
          status: "active",
          pendingMemo: null,
          holdBuyer: null,
          lockedAt: null,
        },
      }
    );
    if (res.modifiedCount > 0) {
      console.log(`🔓 Unlocked ${res.modifiedCount} stale listing(s)`);
    }
  } catch (e) {
    console.error("Unlock sweeper error:", e?.message || e);
  }
}
setInterval(unlockStaleLocks, 60 * 1000); // run every minute
