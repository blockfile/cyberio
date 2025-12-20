// src/components/layout/Navbar.jsx
import React, { useContext, useEffect, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { FiMenu, FiX } from "react-icons/fi";
import { WalletContext } from "../../context/WalletConnect";

const SD_TOKEN_MINT = "3WBoV8iTFfa6fjsc66NLKyZJDftSSpbtJ1r6fjJfpump";
const RPC_ENDPOINT =
  "https://thrilling-convincing-night.solana-mainnet.quiknode.pro/d870e8b8fb9d6c583ad7bc05a2d05aadfcbc2960/";

// If your API runs on a different host/port in dev, change this

const API_BASE_URL =
  (process.env.REACT_APP_API_URL || "").trim() ||
  (process.env.REACT_APP_API_BASE || "").trim() ||
  "http://localhost:3001";

export default function Navbar() {
  const { wallet, connectWallet } = useContext(WalletContext);

  const [balance, setBalance] = useState(null); // $SD
  const [solBalance, setSolBalance] = useState(null); // SOL
  const [cardCount, setCardCount] = useState(null); // number of NFTs/cards
  const [mobileOpen, setMobileOpen] = useState(false);

  // ─ Fetch SOL + $SD balances ─
  useEffect(() => {
    if (!wallet) {
      setBalance(null);
      setSolBalance(null);
      return;
    }

    (async () => {
      try {
        const conn = new Connection(RPC_ENDPOINT);

        // $SD token balance
        const resp = await conn.getParsedTokenAccountsByOwner(
          new PublicKey(wallet),
          { mint: new PublicKey(SD_TOKEN_MINT) }
        );
        const uiAmt =
          resp.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ||
          0;
        setBalance(uiAmt.toFixed(2));

        // SOL balance
        const lamports = await conn.getBalance(new PublicKey(wallet));
        setSolBalance((lamports / 1e9).toFixed(4));
      } catch (err) {
        console.error("Failed to fetch balances:", err);
        setBalance("0.00");
        setSolBalance("0.0000");
      }
    })();
  }, [wallet]);

  // ─ Sync wallet NFTs/cards in DB + get count ─
  useEffect(() => {
    if (!wallet) {
      setCardCount(null);
      return;
    }

    (async () => {
      try {
        // 1) Sync from chain → DB
        await fetch(`${API_BASE_URL}/api/wallet-nfts/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ walletAddress: wallet }),
        });

        // 2) Immediately fetch cached list for count
        const res = await fetch(`${API_BASE_URL}/api/wallet-nfts/${wallet}`);
        const data = await res.json();

        if (data.ok && Array.isArray(data.items)) {
          setCardCount(typeof data.count === "number" ? data.count : data.items.length);
        } else {
          setCardCount(0);
        }
      } catch (err) {
        console.error("Failed to sync wallet NFTs:", err);
        setCardCount(0);
      }
    })();
  }, [wallet]);


  return (
    <div className="w-full bg-black text-white font-play shadow-lg px-4 py-3 relative z-10">
      <div className="flex justify-between items-center">
        {/* Brand */}
        <div className="text-3xl font-cyberway tracking-wider text-yellow-400">
          CYBERIO
        </div>

        {/* Wallet Info - Desktop */}
        <div className="hidden md:flex items-center gap-4">
          {wallet ? (
            <>
              <div className="text-green-300 font-mono text-sm truncate max-w-[150px]">
                {wallet.slice(0, 4)}…{wallet.slice(-4)}
              </div>

              {/* Card/NFT count */}
              {cardCount != null && (
                <div className="bg-purple-400 text-black px-3 py-1 rounded shadow font-semibold text-sm">
                  Cards: {cardCount}
                </div>
              )}

              <div className="bg-yellow-400 text-black px-3 py-1 rounded shadow font-semibold text-sm">
                {balance != null ? `$SD ${balance}` : "..."}
              </div>
              <div className="bg-blue-400 text-black px-3 py-1 rounded shadow font-semibold text-sm">
                {solBalance != null ? `${solBalance} SOL` : "..."}
              </div>
            </>
          ) : (
            <button
              onClick={connectWallet}
              className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded font-bold shadow transition"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden text-yellow-400 text-2xl"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>

      {/* Mobile Menu (wallet only) */}
      {mobileOpen && (
        <div className="md:hidden mt-4 space-y-4">
          <div className="mt-2">
            {wallet ? (
              <div className="space-y-2">
                <div className="text-green-300 font-mono text-sm">
                  {wallet.slice(0, 4)}…{wallet.slice(-4)}
                </div>
                <div className="flex flex-col gap-1">
                  {cardCount != null && (
                    <div className="bg-purple-400 text-black px-3 py-1 rounded shadow font-semibold text-sm inline-block">
                      Cards: {cardCount}
                    </div>
                  )}
                  <div className="bg-yellow-400 text-black px-3 py-1 rounded shadow font-semibold text-sm inline-block">
                    {balance != null ? `$SD ${balance}` : "..."}
                  </div>
                  <div className="bg-blue-400 text-black px-3 py-1 rounded shadow font-semibold text-sm inline-block">
                    {solBalance != null ? `${solBalance} SOL` : "..."}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded font-bold shadow transition"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
