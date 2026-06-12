// src/components/navbar/navbar.jsx
import React, { useCallback, useContext, useMemo, useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import { Wallet, Power, RefreshCcw } from "lucide-react";
import { WalletContext } from "../../context/WalletConnect";
import "./navbar.css";

function shortWallet(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export default function Navbar() {
  const {
    wallet,
    providerName,
    connectWallet,
    disconnectWallet,
    sdBalance,
    solBalance,
    cardCount,
    loadingStats,
    refreshStats,
  } = useContext(WalletContext);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openWalletPicker = useCallback(
    () => connectWallet({ forceSelect: true }),
    [connectWallet]
  );

  const refreshAll = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      await refreshStats?.();
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [wallet, refreshStats]);

  const loading = loadingStats || refreshing;
  const cardsLabel = wallet ? cardCount ?? "..." : "-";
  const sdLabel = wallet ? sdBalance ?? "..." : "-";
  const solLabel = wallet ? solBalance ?? "..." : "-";

  const desktopRight = useMemo(() => {
    if (!wallet) {
      return (
        <button type="button" className="cyNav__btn cyNav__btn--primary" onClick={openWalletPicker}>
          <Wallet size={16} />
          <span className="cyNav__mono">CONNECT</span>
        </button>
      );
    }

    return (
      <>
        <div className="cyNav__pill cyNav__pill--glass" title={`${providerName || "Wallet"}: ${wallet}`}>
          <span className="cyNav__mono">{providerName || "WALLET"}</span>
          <b className="cyNav__mono">{shortWallet(wallet)}</b>
        </div>

        <div className="cyNav__pill cyNav__pill--purple">
          <span className="cyNav__mono">CARDS</span>
          <b className="cyNav__mono">{cardsLabel}</b>
        </div>

        <div className="cyNav__pill cyNav__pill--yellow">
          <span className="cyNav__mono">$SD</span>
          <b className="cyNav__mono">{sdLabel}</b>
        </div>

        <div className="cyNav__pill cyNav__pill--blue">
          <span className="cyNav__mono">SOL</span>
          <b className="cyNav__mono">{solLabel}</b>
        </div>

        <button
          type="button"
          className="cyNav__btn cyNav__btn--ghost"
          onClick={refreshAll}
          disabled={loading}
          title="Refresh balances"
        >
          <RefreshCcw size={16} />
          <span className="cyNav__mono">{loading ? "REFRESHING..." : "REFRESH"}</span>
        </button>

        <button
          type="button"
          className="cyNav__btn cyNav__btn--ghost"
          onClick={openWalletPicker}
          title="Choose another wallet"
        >
          <Wallet size={16} />
          <span className="cyNav__mono">CHANGE</span>
        </button>

        <button
          type="button"
          className="cyNav__btn cyNav__btn--danger"
          onClick={disconnectWallet}
          title="Disconnect to change wallet"
        >
          <Power size={16} />
          <span className="cyNav__mono">DISCONNECT</span>
        </button>
      </>
    );
  }, [
    wallet,
    providerName,
    cardsLabel,
    sdLabel,
    solLabel,
    refreshAll,
    openWalletPicker,
    disconnectWallet,
    loading,
  ]);

  return (
    <header className="cyNav">
      <div className="cyNav__bar">
        <div className="cyNav__scan" aria-hidden="true" />
        <div className="cyNav__sheen" aria-hidden="true" />

        <div className="cyNav__brand">
          <div className="cyNav__brandTitle font-cyberway">CYBERIO</div>
          <div className="cyNav__brandSub cyNav__mono">
            {wallet ? "CONNECTED" : "DISCONNECTED"}
          </div>
        </div>

        <div className="cyNav__right">{desktopRight}</div>

        <button
          className="cyNav__toggle"
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>

      {mobileOpen && (
        <div className="cyNav__mobile">
          {!wallet ? (
            <button type="button" className="cyNav__btn cyNav__btn--primary w-full" onClick={openWalletPicker}>
              <Wallet size={16} />
              <span className="cyNav__mono">CONNECT WALLET</span>
            </button>
          ) : (
            <>
              <div className="cyNav__mobileRow">
                <div className="cyNav__pill cyNav__pill--glass w-full" title={`${providerName || "Wallet"}: ${wallet}`}>
                  <span className="cyNav__mono">{providerName || "WALLET"}</span>
                  <b className="cyNav__mono">{shortWallet(wallet)}</b>
                </div>
              </div>

              <div className="cyNav__mobileGrid">
                <div className="cyNav__pill cyNav__pill--purple">
                  <span className="cyNav__mono">CARDS</span>
                  <b className="cyNav__mono">{cardsLabel}</b>
                </div>

                <div className="cyNav__pill cyNav__pill--yellow">
                  <span className="cyNav__mono">$SD</span>
                  <b className="cyNav__mono">{sdLabel}</b>
                </div>

                <div className="cyNav__pill cyNav__pill--blue">
                  <span className="cyNav__mono">SOL</span>
                  <b className="cyNav__mono">{solLabel}</b>
                </div>
              </div>

              <div className="cyNav__mobileActions">
                <button
                  type="button"
                  className="cyNav__btn cyNav__btn--ghost"
                  onClick={refreshAll}
                  disabled={loading}
                >
                  <RefreshCcw size={16} />
                  <span className="cyNav__mono">{loading ? "REFRESHING..." : "REFRESH"}</span>
                </button>

                <button
                  type="button"
                  className="cyNav__btn cyNav__btn--ghost"
                  onClick={openWalletPicker}
                >
                  <Wallet size={16} />
                  <span className="cyNav__mono">CHANGE</span>
                </button>

                <button
                  type="button"
                  className="cyNav__btn cyNav__btn--danger"
                  onClick={disconnectWallet}
                >
                  <Power size={16} />
                  <span className="cyNav__mono">DISCONNECT</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
