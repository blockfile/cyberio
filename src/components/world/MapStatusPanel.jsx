import React, { useContext, useEffect, useMemo, useState } from "react";
import { WalletContext } from "../../context/WalletConnect";
import { API_BASE_URL } from "../../config/endpoints";
import "./map-status.css";

function shortWallet(wallet) {
  const text = String(wallet || "");
  return text ? `${text.slice(0, 4)}…${text.slice(-4)}` : "OFFLINE";
}

// whole days remaining (rounded up) — reflects stacked/extended passes, not the last plan bought
function daysLeft(expiresAt, now) {
  const ms = new Date(expiresAt).getTime() - now;
  return Math.max(1, Math.ceil(ms / 86400000));
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

// fraction (0..1) of the active pass window remaining — drives the loading bar.
// Uses startedAt when present; otherwise approximates from the last plan's length.
function passFraction(pass, now) {
  if (!pass?.expiresAt) return 0;
  const exp = new Date(pass.expiresAt).getTime();
  if (exp <= now) return 0;
  const span = (Number(pass.durationDays) || 30) * 86400000;
  const start = pass.startedAt ? new Date(pass.startedAt).getTime() : Math.min(now, exp - span);
  const total = Math.max(1, exp - start);
  return Math.max(0.02, Math.min(1, (exp - now) / total));
}

export default function MapStatusPanel({ mapName, playerCount, presenceConnected, variant = "city" }) {
  const walletContext = useContext(WalletContext) || {};
  const { wallet, cardCount = 0, loadingStats, refreshStats } = walletContext;
  const [pass, setPass] = useState(null);
  const [passLoading, setPassLoading] = useState(false);
  const [daily, setDaily] = useState(null); // { earnedToday, dailyCap, remaining }
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!wallet) {
      setPass(null);
      setDaily(null);
      return undefined;
    }

    let alive = true;
    const load = async () => {
      try {
        setPassLoading(true);
        const [passRes, dailyRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/store/pass/active/${encodeURIComponent(wallet)}`, { cache: "no-store" })
            .then((r) => r.json()).catch(() => null),
          fetch(`${API_BASE_URL}/api/earn/daily?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" })
            .then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        setPass(passRes?.success && passRes.active ? passRes.pass : null);
        setDaily(dailyRes?.success ? dailyRes : null);
      } catch {
        if (alive) { setPass(null); setDaily(null); }
      } finally {
        if (alive) setPassLoading(false);
      }
    };

    load();
    refreshStats?.();
    const refreshTimer = window.setInterval(load, 30000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("focus", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const activePass = useMemo(
    () => (pass?.expiresAt && new Date(pass.expiresAt).getTime() > now ? pass : null),
    [pass, now]
  );

  const passPct = activePass ? Math.round(passFraction(activePass, now) * 100) : 0;
  const cap = Number(daily?.dailyCap || 0);
  const earned = Number(daily?.earnedToday || 0);
  const earnPct = cap > 0 ? Math.min(100, Math.round((earned / cap) * 100)) : 0;

  return (
    <aside className={`map-status-panel cyber-frame map-status-panel--${variant}`} aria-label={`${mapName} player status`}>
      <div className="map-status-head">
        <span>{mapName} STATUS</span>
        <span className={`map-status-live${presenceConnected ? " is-online" : ""}`}>
          <i /> {presenceConnected ? "LIVE" : "LINKING"}
        </span>
      </div>

      <div className="map-status-wallet">YOU // {shortWallet(wallet)}</div>

      {/* DIMENSION PASS — loading-bar gauge */}
      <div className="msp-meter">
        <div className="msp-meter-top">
          <span className="map-status-label">DIMENSION PASS</span>
          <strong className={`msp-meter-val${activePass ? " is-active" : ""}`}>
            {passLoading && !pass
              ? "CHECKING"
              : activePass
                ? `${daysLeft(activePass.expiresAt, now)} DAY${daysLeft(activePass.expiresAt, now) > 1 ? "S" : ""}`
                : "INACTIVE"}
          </strong>
        </div>
        <div className="msp-bar">
          <div className={`msp-bar-fill${activePass ? " pass" : ""}`} style={{ width: `${passPct}%` }} />
        </div>
        <small>
          {activePass
            ? `${remainingLabel(activePass.expiresAt, now)} · ${new Date(activePass.expiresAt).toLocaleDateString()}`
            : "Visit the pass store to activate"}
        </small>
      </div>

      {/* DAILY EARN — only meaningful with a pass */}
      {activePass && (
        <div className="msp-meter">
          <div className="msp-meter-top">
            <span className="map-status-label">DAILY EARN</span>
            <strong className="msp-meter-val is-earn">
              {earned.toLocaleString()} / {cap.toLocaleString()}
            </strong>
          </div>
          <div className="msp-bar">
            <div className="msp-bar-fill earn" style={{ width: `${earnPct}%` }} />
          </div>
          <small>
            {cap > 0 && earned >= cap
              ? "Daily cap reached — resets at 00:00 UTC"
              : `${Math.max(0, cap - earned).toLocaleString()} CYBERIO left today`}
          </small>
        </div>
      )}

      {/* deck + players */}
      <div className="map-status-grid msp-grid-2">
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
