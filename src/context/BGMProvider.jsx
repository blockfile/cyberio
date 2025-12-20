import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const BGMContext = createContext(null);
export const useBGM = () => useContext(BGMContext);

// ✅ No require.context. Nothing is bundled, nothing is auto-downloaded.
const TRACKS = Array.from({ length: 9 }, (_, i) => `/bgm/${i + 1}.mp3`);

export default function BGMProvider({ children }) {
  const audioRef = useRef(null);

  const [muted, setMuted] = useState(() => localStorage.getItem("bgm_muted") === "true");
  const [volume, setVolume] = useState(() => {
    const v = localStorage.getItem("bgm_volume");
    return v ? Math.min(1, Math.max(0, parseFloat(v))) : 0.4;
  });

  const [index, setIndex] = useState(() => Math.floor(Math.random() * TRACKS.length));
  const [ready, setReady] = useState(false);     // audio element created?
  const [playing, setPlaying] = useState(false); // user intent toggle

  // ✅ Create audio ONLY after user turns it on (no network before)
  useEffect(() => {
    if (!playing) return;

    const src = TRACKS[index];
    const a = new Audio();
    audioRef.current = a;

    a.preload = "none"; // ✅ don’t preload by default
    a.src = src;        // src assignment begins fetch when play/load happens
    a.loop = false;
    a.muted = muted;
    a.volume = muted ? 0 : volume;

    const onEnded = () => {
      setIndex((prev) => {
        if (TRACKS.length <= 1) return prev;
        let next = prev;
        while (next === prev) next = Math.floor(Math.random() * TRACKS.length);
        return next;
      });
    };

    a.addEventListener("ended", onEnded);
    setReady(true);

    // ✅ attempt to play (user already clicked)
    a.play().catch(() => {
      // if browser blocks (rare since user clicked), keep playing=true but it won’t start
      setReady(true);
    });

    return () => {
      a.pause();
      a.removeEventListener("ended", onEnded);
      audioRef.current = null;
      setReady(false);
    };
  }, [playing, index]); // new track only when playing or track changes

  // apply mute/volume changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = muted;
    a.volume = muted ? 0 : volume;
  }, [muted, volume]);

  // persist settings
  useEffect(() => localStorage.setItem("bgm_muted", String(muted)), [muted]);
  useEffect(() => localStorage.setItem("bgm_volume", String(volume)), [volume]);

  const toggleMute = () => setMuted((m) => !m);

  const setVol = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (clamped > 0 && muted) setMuted(false);
  };

  // ✅ Main toggle: ON creates audio + plays; OFF stops + destroys audio
  const toggleBGM = () => {
    setPlaying((p) => !p);
  };

  return (
    <BGMContext.Provider value={{ muted, toggleMute, volume, setVolume: setVol, playing, toggleBGM, ready }}>
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
            disabled={!playing}
            style={{ opacity: playing ? 1 : 0.5 }}
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
                  value={(!playing || muted) ? 0 : volume}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  className="w-28 h-5 rotate-[-90deg] origin-center accent-yellow-300"
                  title="BGM volume"
                  disabled={!playing}
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
