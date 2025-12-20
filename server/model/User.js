const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true },
  cards: {
    type: [
      {
        name: { type: String },
        cardId: { type: String },
        count: { type: Number, default: 1 },
        isFree: { type: Boolean, default: false }, // ✅ track non-tradable
        power: { type: Number },
      },
    ],
    default: [],
  },
  currentBalance: { type: Number, default: 0 },
  betBalance: { type: Number, default: 0 },
  winningBalance: { type: Number, default: 0 },
  newPlayer: { type: Boolean, default: true },
  freeCard: { type: Number, default: 5 },
});

module.exports = mongoose.model("User", userSchema);
