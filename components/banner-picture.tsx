"use client";

import { useEffect, useRef, useState } from "react";

/** Start the banner film during the same tap that opens the envelope. */
export function playBannerFilm() {
  const video = document.querySelector<HTMLVideoElement>(".hero-photo video");
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  const attempt = video.play();
  if (attempt) attempt.catch(() => {});
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
    const watch = () => {
      if (video.currentTime > 0.05 && !video.paused) setMoving(true);
    };
    playBannerFilm();
    video.addEventListener("timeupdate", watch);
    video.addEventListener("playing", watch);
    document.addEventListener("pointerdown", playBannerFilm, true);
    return () => {
      video.removeEventListener("timeupdate", watch);
      video.removeEventListener("playing", watch);
      document.removeEventListener("pointerdown", playBannerFilm, true);
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
