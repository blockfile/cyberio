import React, { useContext, useEffect, useMemo, useState } from "react";
import { WalletContext } from "../../context/WalletConnect";
import { API_BASE_URL } from "../../config/endpoints";
import "./map-status.css";

function shortWallet(wallet) {
  const text = String(wallet || "");
  return text ? `${text.slice(0, 4)}…${text.slice(-4)}` : "OFFLINE";
}

function remainingLabel(expiresAt, now) {
  const remaining = new Date(expiresAt).getTime() - now;
  if (!expiresAt || remaining <= 0) return "EXPIRED";
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(1, minutes)}m left`;
}

export default function MapStatusPanel({ mapName, playerCount, presenceConnected, variant = "city" }) {
  const walletContext = useContext(WalletContext) || {};
  const { wallet, cardCount = 0, loadingStats, refreshStats } = walletContext;
  const [pass, setPass] = useState(null);
  const [passLoading, setPassLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!wallet) {
      setPass(null);
      return undefined;
    }

    let alive = true;
    const load = async () => {
      try {
        setPassLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/api/store/pass/active/${encodeURIComponent(wallet)}`,
          { cache: "no-store" }
        );
        const data = await response.json();
        if (alive) setPass(data?.success && data.active ? data.pass : null);
      } catch {
        if (alive) setPass(null);
      } finally {
        if (alive) setPassLoading(false);
      }
    };

    load();
    refreshStats?.();
    const refreshTimer = window.setInterval(load, 60000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("focus", load);
    };
    // refreshStats is intentionally omitted: the context exposes a new wrapper
    // on renders, while the wallet address is the actual refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const activePass = useMemo(
    () => (pass?.expiresAt && new Date(pass.expiresAt).getTime() > now ? pass : null),
    [pass, now]
  );

  return (
    <aside className={`map-status-panel map-status-panel--${variant}`} aria-label={`${mapName} player status`}>
      <div className="map-status-head">
        <span>{mapName} STATUS</span>
        <span className={`map-status-live${presenceConnected ? " is-online" : ""}`}>
          <i /> {presenceConnected ? "LIVE" : "LINKING"}
        </span>
      </div>

      <div className="map-status-wallet">YOU // {shortWallet(wallet)}</div>

      <div className="map-status-grid">
        <div className="map-status-item map-status-item--pass">
          <span className="map-status-label">DIMENSION PASS</span>
          <strong className={activePass ? "is-active" : ""}>
            {passLoading ? "CHECKING" : activePass ? `${activePass.durationDays} DAY ACTIVE` : "INACTIVE"}
          </strong>
          <small>
            {activePass
              ? `${remainingLabel(activePass.expiresAt, now)} · ${new Date(activePass.expiresAt).toLocaleDateString()}`
              : "Visit the pass store to activate"}
          </small>
        </div>

        <div className="map-status-item">
          <span className="map-status-label">DECK SIZE</span>
          <strong>{loadingStats ? "…" : Number(cardCount) || 0}</strong>
          <small>cards ready</small>
        </div>

        <div className="map-status-item">
          <span className="map-status-label">PLAYERS</span>
          <strong>{playerCount}</strong>
          <small>in this map</small>
        </div>
      </div>
    </aside>
  );
}
