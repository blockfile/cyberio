import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../config/endpoints";
import "./profile-hud.css";

const asset = (n) => `${process.env.PUBLIC_URL}/citymap/assets/${n}.png`;
const shortWallet = (w) => {
  const t = String(w || "");
  return t ? `${t.slice(0, 4)}…${t.slice(-4)}` : "GUEST";
};

/**
 * Top-left identity HUD: HD avatar, display name (nickname while a Dimension Pass is
 * active, otherwise the shortened wallet), a pass badge, inline nickname editing
 * (pass-gated), and the character switcher.
 */
export default function ProfileHUD({ wallet, charId = "1", onPickChar, passActive = false }) {
  const [nickname, setNickname] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loadProfile = useCallback(async () => {
    if (!wallet) { setNickname(""); return; }
    try {
      const r = await fetch(`${API_BASE_URL}/api/user/${encodeURIComponent(wallet)}`, { cache: "no-store" });
      const d = await r.json();
      setNickname(d?.nickname || "");
    } catch { /* ignore */ }
  }, [wallet]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  // a pass that just expired should hide the edit affordance immediately
  useEffect(() => { if (!passActive) setEditing(false); }, [passActive]);

  const displayName = passActive && nickname ? nickname : shortWallet(wallet);

  const openEdit = () => { setDraft(nickname || ""); setErr(""); setEditing(true); };
  const save = async () => {
    setSaving(true); setErr("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/user/nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, nickname: draft }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Could not save");
      setNickname(d.nickname);
      setEditing(false);
    } catch (e) {
      setErr(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-hud">
      <div className={`ph-avatar-wrap${passActive ? " is-pass" : ""}`}>
        <img
          className="ph-avatar"
          src={asset(`enc_player${charId}`)}
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = asset(`player${charId}_s`); }}
          alt="" draggable={false}
        />
      </div>

      <div className="ph-body">
        {editing ? (
          <div className="ph-edit">
            <input
              className="ph-input"
              value={draft}
              maxLength={16}
              placeholder="Nickname"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            />
            <button className="ph-icon ph-save" onClick={save} disabled={saving} title="Save">{saving ? "…" : "✓"}</button>
            <button className="ph-icon ph-cancel" onClick={() => setEditing(false)} title="Cancel">✕</button>
          </div>
        ) : (
          <div className="ph-name-row">
            <span className="ph-name" title={wallet}>{displayName}</span>
            {passActive && (
              <button className="ph-icon ph-edit-btn" onClick={openEdit} title="Edit nickname">✎</button>
            )}
          </div>
        )}

        {err ? (
          <div className="ph-err">{err}</div>
        ) : (
          <div className={`ph-badge${passActive ? " on" : ""}`}>
            {passActive ? "◆ DIMENSION PASS" : "◇ NO PASS"}
          </div>
        )}

        <div className="ph-chars-row">
          <div className="ph-chars" role="group" aria-label="Choose character">
            {["1", "2", "3"].map((id) => (
              <button
                key={id}
                className={`ph-char${charId === id ? " sel" : ""}`}
                onClick={() => onPickChar?.(id)}
                title={`Character ${id}`}
              >
                <img src={asset(`player${id}_s`)} alt="" draggable={false} />
              </button>
            ))}
          </div>
          <span className="ph-hint">WASD to move</span>
        </div>
      </div>
    </div>
  );
}
