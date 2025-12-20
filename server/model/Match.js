const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema({
  roundNumber: Number,
  player1: String,
  player2: String,
  player1Card: String,
  player2Card: String,
  player1Power: Number,
  player2Power: Number,
  winner: String,
  timestamp: { type: Date, default: Date.now },
});

const matchSchema = new mongoose.Schema({
  player1: String,
  player2: String,
  winner: String,
  loser: String,
  bet: Number,
  totalPot: Number,
  rounds: [roundSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Match", matchSchema);
