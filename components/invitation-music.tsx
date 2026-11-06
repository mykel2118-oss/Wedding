"use client";

import { useEffect, useRef, useState } from "react";

let startMusic: (() => void) | null = null;

/** Starts the saved track from the envelope tap, in that same gesture. */
export function startInvitationMusic() {
  startMusic?.();
}

export function InvitationMusic({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    startMusic = () => {
      const audio = audioRef.current;
      if (!audio) return;
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    return () => {
      startMusic = null;
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  return (
    <div className="music-pause">
      <audio
        ref={audioRef}
        className="invitation-music"
        src={src}
        preload="auto"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button type="button" onClick={toggle} aria-pressed={playing} aria-label={playing ? "Pause the music" : "Play the music"}>
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}
