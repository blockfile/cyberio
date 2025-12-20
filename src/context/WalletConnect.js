import React, { createContext, useEffect, useState, useCallback } from "react";
import axios from "axios";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";

export const WalletContext = createContext();

const RPC_ENDPOINT =
  process.env.REACT_APP_SOLANA_RPC ||
  "https://thrilling-convincing-night.solana-mainnet.quiknode.pro/d870e8b8fb9d6c583ad7bc05a2d05aadfcbc2960/";

const TOKEN_MINT =
  process.env.REACT_APP_TOKEN_MINT ||
  "3WBoV8iTFfa6fjsc66NLKyZJDftSSpbtJ1r6fjJfpump";

const API_BASE_URL = "http://localhost:3001";

export const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState(null);
  const [userData, setUserData] = useState(null);

  const [sdBalance, setSdBalance] = useState("0.00");
  const [solBalance, setSolBalance] = useState("0.0000");
  const [cardCount, setCardCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  const resetAll = useCallback(() => {
    setWallet(null);
    setUserData(null);
    setSdBalance("0.00");
    setSolBalance("0.0000");
    setCardCount(0);
    setLoadingStats(false);
  }, []);

  const fetchUser = useCallback(async (address) => {
    const { data } = await axios.get(`${API_BASE_URL}/api/user/${address}`);
    setUserData(data);
  }, []);

  const fetchStats = useCallback(
    async (address) => {
      if (!address) return;

      try {
        setLoadingStats(true);

        // Debug (keep for now)
        console.log("[WalletConnect] RPC_ENDPOINT =", RPC_ENDPOINT);
        console.log("[WalletConnect] TOKEN_MINT   =", TOKEN_MINT);

        const conn = new Connection(RPC_ENDPOINT, "confirmed");

        const ownerPk = new PublicKey(address);
        const mintPk = new PublicKey(TOKEN_MINT);

        // ✅ HARD CHECK: does mint account exist on this RPC?
        const mintInfo = await conn.getAccountInfo(mintPk, "confirmed");
        if (!mintInfo) {
          throw new Error(
            `Mint account not found on this RPC. TOKEN_MINT=${TOKEN_MINT}`
          );
        }

        // $SD token balance
        const tok = await conn.getParsedTokenAccountsByOwner(ownerPk, {
          mint: mintPk,
        });

        const uiAmt =
          tok.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;

        // SOL balance
        const lamports = await conn.getBalance(ownerPk, "confirmed");

        // NFT count (sync -> fetch count)
        await fetch(`${API_BASE_URL}/api/wallet-nfts/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });

        const res = await fetch(`${API_BASE_URL}/api/wallet-nfts/${address}`);
        const json = await res.json();

        setSdBalance(Number(uiAmt).toFixed(2));
        setSolBalance((lamports / 1e9).toFixed(4));
        setCardCount(json?.count ?? json?.items?.length ?? 0);
      } catch (e) {
        console.error("Wallet stats error:", e);
        setSdBalance("0.00");
        setSolBalance("0.0000");
        setCardCount(0);
      } finally {
        setLoadingStats(false);
      }
    },
    [setSdBalance, setSolBalance, setCardCount]
  );

  useEffect(() => {
    const provider = window.solana;
    if (!provider?.isPhantom) return;

    const onConnect = async () => {
      const addr = provider.publicKey?.toString();
      if (!addr) return;

      setWallet(addr);
      await fetchUser(addr);
      await fetchStats(addr);
    };

    const onDisconnect = () => resetAll();

    const onAccountChanged = async (pk) => {
      if (!pk) return resetAll();
      const addr = pk.toString();
      setWallet(addr);
      await fetchUser(addr);
      await fetchStats(addr);
    };

    provider.on("connect", onConnect);
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChanged);

    // Optional: trusted auto-connect (safe)
    (async () => {
      try {
        const resp = await provider.connect({ onlyIfTrusted: true });
        const addr = resp.publicKey.toString();
        setWallet(addr);
        await fetchUser(addr);
        await fetchStats(addr);
      } catch {
        // ignore
      }
    })();

    return () => {
      provider.off("connect", onConnect);
      provider.off("disconnect", onDisconnect);
      provider.off("accountChanged", onAccountChanged);
    };
  }, [fetchStats, fetchUser, resetAll]);

  const connectWallet = async () => {
    const provider = window.solana;
    if (!provider?.isPhantom) return alert("Install Phantom");

    try {
      const resp = await provider.connect();
      const addr = resp.publicKey.toString();

      const { signature } = await provider.signMessage(
        new TextEncoder().encode("CYBERIO VERIFY"),
        "utf8"
      );
      console.log("sig:", bs58.encode(signature));

      setWallet(addr);
      await fetchUser(addr);
      await fetchStats(addr);
    } catch (e) {
      console.error("Manual connect failed:", e);
      resetAll();
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        userData,
        connectWallet,
        sdBalance,
        solBalance,
        cardCount,
        loadingStats,
        refreshStats: () => wallet && fetchStats(wallet),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
