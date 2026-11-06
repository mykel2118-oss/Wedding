"use client";

import { useEffect, useRef, useState } from "react";

export function BannerPicture({
  src,
  still,
  alt,
  width,
  height,
  video,
}: {
  src: string;
  still: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  video: boolean;
}) {
  const film = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!video) return;
    const el = film.current;
    if (!el) return;
    const start = () => {
      el.muted = true;
      const attempt = el.play();
      if (attempt) attempt.catch(() => {});
    };
    start();
    document.addEventListener("pointerdown", start, true);
    return () => document.removeEventListener("pointerdown", start, true);
  }, [video, src]);

  const size = { width: width ?? undefined, height: height ?? undefined };

  if (!video) {
    return (
      <>
        {still ? <img className="hero-still" src={still} alt={alt} {...size} fetchPriority="high" decoding="sync" /> : null}
        <img
          className={still ? (ready ? "hero-motion is-on" : "hero-motion") : undefined}
          src={src}
          alt={still ? "" : alt}
          {...size}
          fetchPriority="high"
          onLoad={() => setReady(true)}
        />
      </>
    );
  }

  return (
    <>
      {still ? <img className="hero-still" src={still} alt={alt} {...size} fetchPriority="high" decoding="sync" /> : null}
      <video
        ref={film}
        className={still ? (ready ? "hero-motion is-on" : "hero-motion") : undefined}
        src={src}
        poster={still ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onPlaying={() => setReady(true)}
      />
    </>
  );
}
