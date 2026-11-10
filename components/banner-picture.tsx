"use client";

import { useEffect, useRef, useState } from "react";

function armBanner(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("autoplay", "");
  const attempt = video.play();
  if (attempt) attempt.catch(() => {});
}

/** Start the banner during the same tap that opens the envelope. */
export function playBannerFilm() {
  const video = document.querySelector<HTMLVideoElement>(".hero-photo video");
  if (!video) return;
  armBanner(video);
}

export function BannerPicture({
  src,
  still,
  alt,
  width,
  height,
}: {
  src: string;
  still: string | null;
  alt: string;
  width: number | null;
  height: number | null;
}) {
  const film = useRef<HTMLVideoElement>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const video = film.current;
    if (!video) return;
    let stopped = false;
    let lastKick = 0;
    let pauseTimer = 0;
    const watch = () => {
      if (stopped) return;
      if (!video.paused && video.currentTime > 0) setMoving(true);
    };
    const kick = () => {
      if (stopped) return;
      watch();
      if (!video.paused && video.currentTime > 0) return;
      const now = Date.now();
      if (now - lastKick < 250) return;
      lastKick = now;
      armBanner(video);
    };
    const onPause = () => {
      if (stopped || video.ended) return;
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(kick, 120);
    };
    kick();
    video.addEventListener("timeupdate", watch);
    video.addEventListener("playing", watch);
    video.addEventListener("loadeddata", kick);
    video.addEventListener("canplay", kick);
    video.addEventListener("pause", onPause);
    document.addEventListener("pointerdown", kick, true);
    document.addEventListener("visibilitychange", kick);
    const observer = new MutationObserver(kick);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const timer = window.setInterval(kick, 600);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(pauseTimer);
      observer.disconnect();
      video.removeEventListener("timeupdate", watch);
      video.removeEventListener("playing", watch);
      video.removeEventListener("loadeddata", kick);
      video.removeEventListener("canplay", kick);
      video.removeEventListener("pause", onPause);
      document.removeEventListener("pointerdown", kick, true);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [src]);

  return (
    <div className="hero-frame" style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}>
      <video
        ref={film}
        src={src}
        poster={still ?? undefined}
        width={width ?? undefined}
        height={height ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label={alt}
      />
      {still && !moving ? <img className="hero-still" src={still} alt="" fetchPriority="high" decoding="sync" /> : null}
    </div>
  );
}
