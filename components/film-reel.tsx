"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MediaItem } from "@/lib/types";

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function frameStyle(item: MediaItem): { aspectRatio: string } | undefined {
  if (!item.width || !item.height) return undefined;
  return { aspectRatio: `${item.width} / ${item.height}` };
}

function ahead(index: number, itemIndex: number, count: number) {
  return (itemIndex - index + count) % count;
}

/** A tiny media fragment makes the first picture show before playback, instead of a black frame. */
function withFrame(src: string) {
  return src.includes("#") ? src : `${src}#t=0.001`;
}

export function FilmReel({ items }: { items: MediaItem[] }) {
  const reelRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [viewW, setViewW] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const [near, setNear] = useState(false);
  const [fallback, setFallback] = useState<MediaItem | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const readyIds = useRef(new Set<string>());
  const [warm, setWarm] = useState<Record<string, true>>({});
  const count = items.length;
  const current = items[index] ?? items[0];

  useEffect(() => {
    setIndex((value) => (count ? value % count : 0));
  }, [count]);

  useEffect(() => {
    const reel = reelRef.current;
    if (!reel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "720px" },
    );
    observer.observe(reel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const apply = () => setViewW(view.clientWidth);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(view);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    const video = currentRef.current;
    if (!video) return;
    if (paused || !near || !pageVisible) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused, near, pageVisible, index, current?.id]);

  useEffect(() => {
    const onChange = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (paused || !near || !pageVisible || dragging || count < 2) return;
    const nextId = items[(index + 1) % count]?.id;
    let timer = 0;
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      const ready = nextId ? readyIds.current.has(nextId) : false;
      if (elapsed >= 4000 && ready) {
        setIndex((value) => (value + 1) % count);
        return;
      }
      timer = window.setTimeout(tick, elapsed >= 4000 ? 200 : 4000 - elapsed);
    };
    timer = window.setTimeout(tick, 4000);
    return () => window.clearTimeout(timer);
  }, [paused, near, pageVisible, dragging, count, index, items]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || count < 2) return;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let axis: "x" | "y" | null = null;

    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      dx = 0;
      axis = null;
      setDragging(true);
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const mx = touch.clientX - startX;
      const my = touch.clientY - startY;
      if (!axis && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      }
      if (axis !== "x") return;
      event.preventDefault();
      dx = mx;
      setDragX(mx);
    };
    const end = () => {
      setDragging(false);
      setDragX(0);
      if (axis === "x" && Math.abs(dx) > 42) {
        const step = dx < 0 ? 1 : -1;
        setIndex((value) => (value + step + count) % count);
      }
      axis = null;
    };

    view.addEventListener("touchstart", start, { passive: true });
    view.addEventListener("touchmove", move, { passive: false });
    view.addEventListener("touchend", end);
    view.addEventListener("touchcancel", end);
    return () => {
      view.removeEventListener("touchstart", start);
      view.removeEventListener("touchmove", move);
      view.removeEventListener("touchend", end);
      view.removeEventListener("touchcancel", end);
    };
  }, [count]);

  function slide(step: number) {
    if (count < 2) return;
    setIndex((value) => (value + step + count) % count);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || count < 2) return;
    const startX = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => setDragX(ev.clientX - startX);
    const up = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setDragging(false);
      setDragX(0);
      if (Math.abs(dx) > 42) slide(dx < 0 ? 1 : -1);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  async function maximize(item: MediaItem, video: HTMLVideoElement | null) {
    if (!video) {
      setFallback(item);
      return;
    }
    const player = video as FullscreenVideo;
    try {
      if (player.requestFullscreen) {
        await player.requestFullscreen();
        return;
      }
    } catch {
      /* a fixed frame covers the page when the browser refuses the fullscreen API */
    }
    if (player.webkitEnterFullscreen) {
      player.webkitEnterFullscreen();
      return;
    }
    setFallback(item);
  }

  return (
    <div className="film-reel" ref={reelRef}>
      <div className="film-toolbar">
        {count > 1 ? (
          <button type="button" className="text-button" onClick={() => slide(-1)}>
            Previous
          </button>
        ) : null}
        <button type="button" className="text-button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? "Play" : "Pause"}
        </button>
        {count > 1 ? (
          <button type="button" className="text-button" onClick={() => slide(1)}>
            Next
          </button>
        ) : null}
      </div>
      <div
        className="film-slide-view"
        ref={viewRef}
        onPointerDown={onPointerDown}
      >
        <div
          className="film-slide-track"
          data-dragging={dragging ? "true" : "false"}
          style={{ transform: `translate3d(${-index * viewW + dragX}px, 0, 0)` }}
        >
          {items.map((item, itemIndex) => {
            const place = ahead(index, itemIndex, count);
            const loaded = near && (place === 0 || place === 1 || place === count - 1 || Boolean(warm[item.id]));
            const showing = itemIndex === index;
            const nextUp = place === 1 && current ? Boolean(warm[current.id]) : false;
            return (
              <figure className="film-slide" key={item.id}>
                <div className="film-frame" style={frameStyle(item)}>
                  <video
                    ref={showing ? currentRef : undefined}
                    src={loaded ? withFrame(item.src) : undefined}
                    muted
                    playsInline
                    loop
                    preload={showing || nextUp ? "auto" : "metadata"}
                    aria-label={item.caption || "Film"}
                    width={item.width ?? undefined}
                    height={item.height ?? undefined}
                    style={frameStyle(item)}
                    onLoadedData={(event) => {
                      if (event.currentTarget.readyState < 2) return;
                      readyIds.current.add(item.id);
                      setWarm((known) => (known[item.id] ? known : { ...known, [item.id]: true }));
                    }}
                  />
                  <button
                    type="button"
                    className="film-max"
                    aria-label="Full screen"
                    onClick={() => {
                      const video = showing ? currentRef.current : null;
                      if (video && !video.src) video.src = item.src;
                      void maximize(item, video);
                    }}
                  >
                    <span className="film-max-long">Full screen</span>
                    <span className="film-max-short">Full</span>
                  </button>
                </div>
                {item.caption ? <figcaption>{item.caption}</figcaption> : null}
              </figure>
            );
          })}
        </div>
      </div>
      {fallback ? (
        <div className="film-fallback" role="dialog" aria-modal="true" aria-label={fallback.caption || "Film"}>
          <video src={fallback.src} controls autoPlay playsInline />
          <button type="button" className="text-button" onClick={() => setFallback(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
