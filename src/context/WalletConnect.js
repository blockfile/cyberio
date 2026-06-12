// src/context/WalletConnect.jsx
import React, { createContext, useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import bs58 from "bs58";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getWallets } from "@wallet-standard/app";
import { StandardConnect, StandardDisconnect, StandardEvents } from "@wallet-standard/features";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
} from "@solana/wallet-standard-features";
import { API_BASE_URL } from "../config/endpoints";

export const WalletContext = createContext();

// ========= ENV =========
const RPC_ENDPOINT =
  (process.env.REACT_APP_SOLANA_RPC || "").trim() ||
  "https://soft-long-tree.solana-mainnet.quiknode.pro/883d10d4159f4b31b41d6033458772076fedb5d4/";

const TOKEN_MINT =
  (process.env.REACT_APP_TOKEN_MINT || "").trim() ||
  "3WBoV8iTFfa6fjsc66NLKyZJDftSSpbtJ1r6fjJfpump";

const LS_KEY = "CYBERIO_SELECTED_WALLET";

// ========= WALLET DETECTION =========
const SOLANA_CHAIN_PREFIX = "solana:";

function isBrowser() {
  return typeof window !== "undefined";
}

function accountToPublicKey(account) {
  if (!account?.address) return null;
  return { toString: () => account.address };
}

function getWalletChain(standardWallet) {
  return (
    standardWallet.chains?.find((chain) => String(chain) === "solana:mainnet") ||
    standardWallet.chains?.find((chain) => String(chain).startsWith(SOLANA_CHAIN_PREFIX)) ||
    "solana:mainnet"
  );
}

function serializeWalletTransaction(tx) {
  if (tx?.serialize && tx instanceof Transaction) {
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  }
  if (tx?.serialize) return tx.serialize();
  return tx;
}

function isSolanaStandardWallet(wallet) {
  return (
    wallet &&
    wallet.features?.[StandardConnect]?.connect &&
    Array.isArray(wallet.chains) &&
    wallet.chains.some((chain) => String(chain).startsWith(SOLANA_CHAIN_PREFIX))
  );
}

function createStandardProvider(standardWallet) {
  let currentAccount = standardWallet.accounts?.[0] || null;
  const unsubs = new Map();

  const provider = {
    __walletStandard: true,
    name: standardWallet.name || "Wallet",
    providerName: standardWallet.name || "Wallet",
    icon: standardWallet.icon,
    standardWallet,

    get publicKey() {
      currentAccount = currentAccount || standardWallet.accounts?.[0] || null;
      return accountToPublicKey(currentAccount);
    },

    async connect(opts = {}) {
      const output = await standardWallet.features[StandardConnect].connect({
        silent: !!opts.onlyIfTrusted,
      });
      currentAccount = output?.accounts?.[0] || standardWallet.accounts?.[0] || null;
      const publicKey = accountToPublicKey(currentAccount);
      if (!publicKey) throw new Error("No account returned by wallet");
      return { publicKey, account: currentAccount };
    },

    async disconnect() {
      await standardWallet.features[StandardDisconnect]?.disconnect?.();
      currentAccount = null;
    },

    async signMessage(message) {
      const account = currentAccount || standardWallet.accounts?.[0];
      const signMessage = standardWallet.features[SolanaSignMessage]?.signMessage;
      if (!account || !signMessage) throw new Error("Wallet does not support message signing");

      const [result] = await signMessage({ account, message });
      return {
        signature: result?.signature,
        signedMessage: result?.signedMessage,
      };
    },

    async signTransaction(tx, options = {}) {
      const account = currentAccount || standardWallet.accounts?.[0];
      const signTransaction = standardWallet.features[SolanaSignTransaction]?.signTransaction;
      if (!account || !signTransaction) throw new Error("Wallet does not support transaction signing");

      const [result] = await signTransaction({
        account,
        transaction: serializeWalletTransaction(tx),
        chain: getWalletChain(standardWallet),
        options,
      });

      if (!result?.signedTransaction) {
        throw new Error("Wallet did not return a signed transaction");
      }

      return Transaction.from(result.signedTransaction);
    },

    async signAndSendTransaction(tx, options = {}) {
      const account = currentAccount || standardWallet.accounts?.[0];
      const signAndSendTransaction =
        standardWallet.features[SolanaSignAndSendTransaction]?.signAndSendTransaction;
      if (!account || !signAndSendTransaction) {
        throw new Error("Wallet does not support sign and send transaction");
      }

      const [result] = await signAndSendTransaction({
        account,
        transaction: serializeWalletTransaction(tx),
        chain: getWalletChain(standardWallet),
        options,
      });

      if (!result?.signature) throw new Error("Wallet did not return a transaction signature");
      return { signature: bs58.encode(result.signature) };
    },

    on(event, handler) {
      const onChange = standardWallet.features[StandardEvents]?.on;
      if (!onChange) return undefined;

      const off = onChange("change", ({ accounts }) => {
        if (!accounts) return;
        currentAccount = accounts[0] || null;

        if (event === "disconnect" && !currentAccount) {
          handler();
          return;
        }

        if (
          event === "connect" ||
          event === "accountChanged" ||
          event === "publicKeyChanged"
        ) {
          handler(accountToPublicKey(currentAccount));
        }
      });

      unsubs.set(`${event}:${handler}`, off);
      return off;
    },

    off(event, handler) {
      const key = `${event}:${handler}`;
      const off = unsubs.get(key);
      if (off) off();
      unsubs.delete(key);
    },
  };

  return provider;
}

function providerKey(p) {
  const name = getProviderName(p);
  if (name && name !== "Wallet") return name.toLowerCase();
  if (p?.isPhantom) return "phantom";
  if (p?.isSolflare) return "solflare";
  if (p?.isBackpack) return "backpack";
  return null;
}

function normalizeProviders() {
  if (!isBrowser()) return [];

  const providers = [];

  try {
    const standardProviders = getWallets()
      .get()
      .filter(isSolanaStandardWallet)
      .map(createStandardProvider);
    providers.push(...standardProviders);
  } catch (e) {
    console.warn("Wallet Standard detection failed:", e);
  }

  // Newer Phantom exposes window.solana.providers = [phantom, ...]
  const solAny = window.solana;
  if (solAny?.providers && Array.isArray(solAny.providers)) {
    for (const p of solAny.providers) {
      if (p && typeof p.connect === "function") providers.push(p);
    }
  }

  // Common globals
  if (window.phantom?.solana && typeof window.phantom.solana.connect === "function") {
    providers.push(window.phantom.solana);
  }
  if (window.solflare && typeof window.solflare.connect === "function") {
    providers.push(window.solflare);
  }
  if (window.backpack && typeof window.backpack.connect === "function") {
    providers.push(window.backpack);
  }

  // Fallback: window.solana itself
  if (solAny && typeof solAny.connect === "function") {
    providers.push(solAny);
  }

  const seenRefs = new Set();
  const seenNames = new Set();
  const unique = [];

  for (const p of providers) {
    if (!p || seenRefs.has(p)) continue;
    seenRefs.add(p);

    const key = providerKey(p);
    if (key && seenNames.has(key)) continue;
    if (key) seenNames.add(key);

    unique.push(p);
  }

  return unique;
}

function getProviderName(p) {
  if (!p) return "Wallet";
  if (p.isPhantom) return "Phantom";
  if (p.isSolflare) return "Solflare";
  if (p.isBackpack) return "Backpack";
  // Some wallets expose name or providerName
  return p.name || p.providerName || "Wallet";
}

async function fetchCachedCardCount(address) {
  const res = await fetch(`${API_BASE_URL}/api/wallet-nfts/${address}`);
  const json = await res.json();
  return json?.count ?? json?.items?.length ?? 0;
}

async function syncWalletNfts(address) {
  await fetch(`${API_BASE_URL}/api/wallet-nfts/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
}

// Some wallets use "accountChanged", some use "publicKeyChanged"
function onAny(p, event, handler) {
  try {
    return p.on?.(event, handler);
  } catch {}
  return undefined;
}
function offAny(p, event, handler, unsubscribe) {
  try {
    if (typeof unsubscribe === "function") unsubscribe();
    else p.off?.(event, handler);
  } catch {}
}

export const WalletProvider = ({ children }) => {
  const [wallet, setWallet] = useState(null);
  const [userData, setUserData] = useState(null);

  const [sdBalance, setSdBalance] = useState("0.00");
  const [solBalance, setSolBalance] = useState("0.0000");
  const [cardCount, setCardCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerName, setProviderName] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const autoConnectAttempted = useRef(false);
  const statsRequestRef = useRef(null);

  const [providers, setProviders] = useState(() => normalizeProviders());

  useEffect(() => {
    const refreshProviders = () => setProviders(normalizeProviders());

    refreshProviders();

    let offRegister;
    let offUnregister;
    try {
      const wallets = getWallets();
      offRegister = wallets.on("register", refreshProviders);
      offUnregister = wallets.on("unregister", refreshProviders);
    } catch {}

    const timers = [250, 1000, 2500].map((delay) =>
      window.setTimeout(refreshProviders, delay)
    );
    window.addEventListener("focus", refreshProviders);

    return () => {
      offRegister?.();
      offUnregister?.();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", refreshProviders);
    };
  }, []);

  const resetAll = useCallback(() => {
    setWallet(null);
    setUserData(null);
    setSdBalance("0.00");
    setSolBalance("0.0000");
    setCardCount(0);
    setLoadingStats(false);
  }, []);

  const fetchUser = useCallback(async (address) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/user/${address}`);
      setUserData(data);
    } catch {
      setUserData(null);
    }
  }, []);

  const fetchStats = useCallback(async (address) => {
    if (!address) return;
    const statsAddress = String(address);
    const currentRequest = statsRequestRef.current;

    if (currentRequest?.address === statsAddress) {
      return currentRequest.promise;
    }

    const promise = (async () => {
      try {
        setLoadingStats(true);

        try {
          setCardCount(await fetchCachedCardCount(statsAddress));
        } catch (e) {
          console.error("Cached wallet NFT count error:", e);
          setCardCount(0);
        }

        const conn = new Connection(RPC_ENDPOINT, "confirmed");

        const ownerPk = new PublicKey(statsAddress);
        const mintPk = new PublicKey(TOKEN_MINT);

        // Mint existence check
        const mintInfo = await conn.getAccountInfo(mintPk, "confirmed");
        if (!mintInfo) {
          throw new Error(`Mint account not found on this RPC. TOKEN_MINT=${TOKEN_MINT}`);
        }

        // Token balance
        const tok = await conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
        const uiAmt =
          tok.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;

        // SOL
        const lamports = await conn.getBalance(ownerPk, "confirmed");

        setSdBalance(Number(uiAmt).toFixed(2));
        setSolBalance((lamports / 1e9).toFixed(4));

        try {
          await syncWalletNfts(statsAddress);
          setCardCount(await fetchCachedCardCount(statsAddress));
        } catch (e) {
          console.warn("Wallet NFT sync skipped; showing cached count:", e);
        }
      } catch (e) {
        console.error("Wallet stats error:", e);
        setSdBalance("0.00");
        setSolBalance("0.0000");
      } finally {
        setLoadingStats(false);
      }
    })();

    statsRequestRef.current = { address: statsAddress, promise };

    try {
      return await promise;
    } finally {
      if (statsRequestRef.current?.promise === promise) {
        statsRequestRef.current = null;
      }
    }
  }, []);

  const pickProvider = useCallback((p) => {
    setSelectedProvider(p);
    const name = getProviderName(p);
    setProviderName(name);
    try {
      localStorage.setItem(LS_KEY, name);
    } catch {}
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      if (selectedProvider?.disconnect) {
        await selectedProvider.disconnect();
      }
    } catch {
      // ignore
    } finally {
      resetAll();
    }
  }, [selectedProvider, resetAll]);

  const doAfterConnect = useCallback(
    async (addr) => {
      setWallet(addr);
      await fetchUser(addr);
      await fetchStats(addr);
    },
    [fetchUser, fetchStats]
  );

  const connectWithProvider = useCallback(
    async (p, { onlyIfTrusted = false } = {}) => {
      if (!p) throw new Error("No wallet provider");

      pickProvider(p);

      // connect
      const resp = await p.connect(onlyIfTrusted ? { onlyIfTrusted: true } : undefined);
      const addr = resp?.publicKey?.toString?.() || p.publicKey?.toString?.();
      if (!addr) throw new Error("No public key returned by wallet");

      // optional signature (not all wallets support signMessage)
      try {
        if (p.signMessage) {
          const { signature } = await p.signMessage(
            new TextEncoder().encode("CYBERIO VERIFY"),
            "utf8"
          );
          console.log("sig:", bs58.encode(signature));
        }
      } catch (e) {
        // not fatal; continue
        console.warn("signMessage not supported / rejected:", e?.message || e);
      }

      await doAfterConnect(addr);
      return addr;
    },
    [doAfterConnect, pickProvider]
  );

  // Connect entrypoint:
  // - forceSelect: always open picker UI
  // - otherwise: try last selected wallet, else first detected wallet
  const connectWallet = useCallback(
    async ({ forceSelect = false } = {}) => {
      if (!providers.length) {
        alert("No Solana wallet detected. Install Phantom / Solflare / Backpack.");
        return;
      }

      if (forceSelect) {
        setShowPicker(true);
        return;
      }

      // Try last selected
      const last = (() => {
        try {
          return localStorage.getItem(LS_KEY);
        } catch {
          return null;
        }
      })();

      const preferred =
        providers.find((p) => getProviderName(p) === last) || providers[0];

      try {
        await connectWithProvider(preferred, { onlyIfTrusted: false });
      } catch (e) {
        console.error("Connect failed:", e);
        // If preferred failed, open picker so user can choose
        setShowPicker(true);
      }
    },
    [providers, connectWithProvider]
  );

  // Auto-connect on mount (trusted)
  useEffect(() => {
    if (!providers.length) return;
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;

    const last = (() => {
      try {
        return localStorage.getItem(LS_KEY);
      } catch {
        return null;
      }
    })();

    const preferred =
      providers.find((p) => getProviderName(p) === last) || providers[0];

    // Set provider name early for UI
    pickProvider(preferred);

    (async () => {
      try {
        await connectWithProvider(preferred, { onlyIfTrusted: true });
      } catch {
        // ignore
      }
    })();
  }, [providers, connectWithProvider, pickProvider]);

  // Provider event wiring
  useEffect(() => {
    const p = selectedProvider;
    if (!p) return;

    const onConnect = async () => {
      const addr = p.publicKey?.toString?.();
      if (!addr) return;
      await doAfterConnect(addr);
    };

    const onDisconnect = () => {
      resetAll();
    };

    const onAccountChanged = async (pk) => {
      // Phantom emits pk null on disconnect sometimes
      if (!pk) {
        resetAll();
        return;
      }
      const addr = pk.toString();
      await doAfterConnect(addr);
    };

    // Try both event names for broad compatibility
    const subscriptions = [
      ["connect", onConnect, onAny(p, "connect", onConnect)],
      ["disconnect", onDisconnect, onAny(p, "disconnect", onDisconnect)],
      ["accountChanged", onAccountChanged, onAny(p, "accountChanged", onAccountChanged)],
      ["publicKeyChanged", onAccountChanged, onAny(p, "publicKeyChanged", onAccountChanged)],
    ];

    return () => {
      subscriptions.forEach(([event, handler, unsubscribe]) => {
        offAny(p, event, handler, unsubscribe);
      });
    };
  }, [selectedProvider, doAfterConnect, resetAll]);

  // Simple picker UI (no extra deps)
  const WalletPicker = () => {
    if (!showPicker) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,.65)",
          display: "grid",
          placeItems: "center",
          padding: 16,
        }}
        onClick={() => setShowPicker(false)}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            width: "min(520px, 96vw)",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(0,0,0,.70)",
            backdropFilter: "blur(12px) saturate(160%)",
            boxShadow: "0 22px 70px rgba(0,0,0,.65), 0 0 0 1px rgba(255,43,214,.08) inset",
            padding: 14,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ color: "rgba(255,255,255,.92)", fontWeight: 900, letterSpacing: ".14em" }}>
              SELECT WALLET
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              style={{
                border: "1px solid rgba(255,255,255,.14)",
                background: "rgba(255,255,255,.06)",
                color: "rgba(255,255,255,.9)",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              CLOSE
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {providers.map((p, idx) => {
              const name = getProviderName(p);
              const active = providerName && name === providerName;
              return (
                <button
                  key={`${name}-${idx}`}
                  type="button"
                  onClick={async () => {
                    try {
                      setShowPicker(false);
                      await connectWithProvider(p, { onlyIfTrusted: false });
                    } catch (e) {
                      console.error("Connect failed:", e);
                      alert(`Failed to connect to ${name}.`);
                    }
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: `1px solid ${active ? "rgba(255,43,214,.36)" : "rgba(255,255,255,.14)"}`,
                    background: active ? "rgba(255,43,214,.10)" : "rgba(255,255,255,.06)",
                    color: "rgba(255,255,255,.92)",
                    cursor: "pointer",
                    letterSpacing: ".08em",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{name}</div>
                  <div style={{ opacity: 0.72, fontSize: 12, marginTop: 4 }}>
                    {p?.publicKey ? "Detected and ready" : "Detected"}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12, lineHeight: 1.4 }}>
            If you want to switch wallets, use <b>CHANGE</b> in the Navbar, or <b>DISCONNECT</b> then connect again.
          </div>
        </div>
      </div>
    );
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        walletProvider: selectedProvider,
        walletProviders: providers,
        userData,
        providerName,
        connectWallet,
        disconnectWallet,
        sdBalance,
        solBalance,
        cardCount,
        loadingStats,
        refreshStats: () => wallet && fetchStats(wallet),
      }}
    >
      {children}
      <WalletPicker />
    </WalletContext.Provider>
  );
};
