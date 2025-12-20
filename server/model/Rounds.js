const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },
    roundNumber: Number,
    playerWallet: String,
    opponentWallet: String,
    playerCard: String,
    opponentCard: String,
    playerPower: Number,
    opponentPower: Number,
    winner: String, // wallet of round winner
  },
  { timestamps: true }
);

module.exports = mongoose.model("Round", roundSchema);
