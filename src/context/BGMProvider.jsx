import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { BGM } from "../audio";

const BGMContext = createContext(null);
export const useBGM = () => useContext(BGMContext) || {};

export default function BGMProvider({ children }) {
  const audioRef = useRef(null);
  const autoStartedRef = useRef(false); // auto-start fires once; after that the user owns play/pause

  const [muted, setMuted] = useState(() => localStorage.getItem("bgm_muted") === "true");
  const [volume, setVolume] = useState(() => {
    const v = localStorage.getItem("bgm_volume");
    return v ? Math.min(1, Math.max(0, parseFloat(v))) : 0.4;
  });

  const [scene, setSceneState] = useState("world"); // world | arena | duel | draw
  const sceneRef = useRef("world");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  // components switch the background loop by scene (e.g. World sets it from the open panel)
  const setScene = (s) => {
    if (!BGM[s] || s === sceneRef.current) return;
    sceneRef.current = s;
    setSceneState(s);
  };

  // auto-start BGM ONCE on the first user gesture (browser autoplay policy) — never re-arms,
  // so pausing actually sticks (mount-only; reads mute/off prefs fresh at fire time)
  useEffect(() => {
    const start = () => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      let off = false, m = false;
      try { off = localStorage.getItem("bgm_off") === "true"; m = localStorage.getItem("bgm_muted") === "true"; } catch (e) {}
      if (!off && !m) setPlaying(true);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  // create + loop the current scene's track when playing; swap when the scene changes
  useEffect(() => {
    if (!playing) return;

    const a = new Audio();
    audioRef.current = a;
    a.preload = "auto";
    a.src = BGM[scene] || BGM.world;
    a.loop = true;
    a.muted = muted;
    a.volume = muted ? 0 : volume;
    setReady(true);
    a.play().catch(() => setReady(true)); // ignore autoplay rejections

    return () => {
      a.pause();
      audioRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scene]);

  // apply live mute/volume changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = muted;
    a.volume = muted ? 0 : volume;
  }, [muted, volume]);

  useEffect(() => localStorage.setItem("bgm_muted", String(muted)), [muted]);
  useEffect(() => localStorage.setItem("bgm_volume", String(volume)), [volume]);

  const toggleMute = () => setMuted((m) => !m);
  const setVol = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (clamped > 0 && muted) setMuted(false);
  };
  const toggleBGM = () =>
    setPlaying((p) => {
      const next = !p;
      autoStartedRef.current = true;                 // user took control → stop any auto-start
      try { localStorage.setItem("bgm_off", String(!next)); } catch (e) {} // remember pause across reloads
      return next;
    });

  return (
    <BGMContext.Provider value={{ muted, toggleMute, volume, setVolume: setVol, playing, toggleBGM, ready, scene, setScene }}>
      {children}

      {/* Floating control */}
      <div className="fixed bottom-3 right-3 z-[60]">
        <div className="group relative rounded-xl border border-white/15 bg-black/50 backdrop-blur px-2 py-2 text-white flex items-center justify-center gap-2">
          <button
            onClick={toggleBGM}
            className="px-2 py-1 rounded hover:bg-white/10"
            aria-label={playing ? "Stop BGM" : "Play BGM"}
          >
            {playing ? "⏸" : "▶"}
          </button>

          <button
            onClick={toggleMute}
            className="px-2 py-1 rounded hover:bg-white/10"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>

          {/* slider */}
          <div
            className="absolute bottom-12 right-1 opacity-0 pointer-events-none transition
                       group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100"
          >
            <div className="rounded-lg border border-white/15 bg-black/70 px-2 py-2 shadow-lg">
              <div className="h-28 w-8 flex items-center justify-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  className="w-28 h-5 rotate-[-90deg] origin-center accent-yellow-300"
                  title="BGM volume"
                />
              </div>
              {!ready && playing ? (
                <div className="text-[10px] text-white/60 mt-2 text-center">Loading…</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </BGMContext.Provider>
  );
}
