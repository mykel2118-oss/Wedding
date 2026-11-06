"use client";

import { useEffect, useRef } from "react";
import { SCROLL_FRAME_COUNT, SCROLL_VIDEO, scrollFrameSrc } from "@/lib/atmosphere";

const NEIGHBORS = 2;

export function ScrollGround() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let alive = true;
    let raf = 0;
    let mode: "video" | "frames" = "frames";
    let seeking = false;
    let wantTime = 0;
    const bitmaps = new Map<number, ImageBitmap>();
    const loading = new Set<number>();
    let video: HTMLVideoElement | null = null;

    const progress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(1, Math.max(0, window.scrollY / max));
    };

    const draw = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
      if (!sourceWidth || !sourceHeight) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pxW = Math.max(1, Math.round(width * dpr));
      const pxH = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pxW || canvas.height !== pxH) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const dw = sourceWidth * scale;
      const dh = sourceHeight * scale;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
      canvas.dataset.painted = "1";
      canvas.dataset.source = `${sourceWidth}x${sourceHeight}`;
    };

    const frameIndex = () => Math.round(progress() * (SCROLL_FRAME_COUNT - 1));

    const retain = (index: number) => {
      for (const [key, bmp] of bitmaps) {
        if (Math.abs(key - index) > NEIGHBORS) {
          bmp.close();
          bitmaps.delete(key);
        }
      }
    };

    const loadFrame = async (index: number) => {
      if (!alive || mode !== "frames") return;
      if (index < 0 || index >= SCROLL_FRAME_COUNT || bitmaps.has(index) || loading.has(index)) return;
      loading.add(index);
      try {
        const res = await fetch(scrollFrameSrc(index));
        if (!res.ok || !alive || mode !== "frames") return;
        const bmp = await createImageBitmap(await res.blob());
        if (!alive || mode !== "frames") {
          bmp.close();
          return;
        }
        bitmaps.set(index, bmp);
      } catch {
        /* keep the last painted frame */
      } finally {
        loading.delete(index);
      }
    };

    const paintFrames = async () => {
      const index = frameIndex();
      canvas.dataset.mode = "frames";
      canvas.dataset.frame = String(index);
      await loadFrame(index);
      if (!alive || mode !== "frames") return;
      const bmp = bitmaps.get(index);
      if (bmp) draw(bmp, bmp.width, bmp.height);
      retain(index);
      for (let step = 1; step <= NEIGHBORS; step += 1) {
        void loadFrame(index + step);
        void loadFrame(index - step);
      }
    };

    const seekVideo = () => {
      if (!video || !Number.isFinite(video.duration)) return;
      wantTime = progress() * Math.max(0, video.duration - 0.04);
      canvas.dataset.mode = "video";
      if (seeking) return;
      if (Math.abs(video.currentTime - wantTime) < 0.08 && video.videoWidth) {
        draw(video, video.videoWidth, video.videoHeight);
        return;
      }
      seeking = true;
      try {
        video.currentTime = wantTime;
      } catch {
        seeking = false;
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (mode === "video") seekVideo();
        else void paintFrames();
      });
    };

    const onSeeked = () => {
      seeking = false;
      if (!alive || !video?.videoWidth) return;
      draw(video, video.videoWidth, video.videoHeight);
      canvas.dataset.mode = "video";
      if (Math.abs(video.currentTime - wantTime) >= 0.08) seekVideo();
    };

    const videoPaints = async () => {
      const ios =
        /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (ios) return false;
      const probe = document.createElement("video");
      probe.muted = true;
      probe.defaultMuted = true;
      probe.playsInline = true;
      probe.preload = "auto";
      probe.src = SCROLL_VIDEO;
      const loaded = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 2500);
        probe.addEventListener(
          "loadeddata",
          () => {
            window.clearTimeout(timer);
            resolve(true);
          },
          { once: true },
        );
        probe.addEventListener(
          "error",
          () => {
            window.clearTimeout(timer);
            resolve(false);
          },
          { once: true },
        );
      });
      if (!loaded || !alive || !probe.videoWidth) return false;
      const sampleAt = Math.min(0.15, Math.max(0, (probe.duration || 1) * 0.1));
      const seeked = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 1500);
        probe.addEventListener(
          "seeked",
          () => {
            window.clearTimeout(timer);
            resolve(true);
          },
          { once: true },
        );
        try {
          probe.currentTime = sampleAt;
        } catch {
          window.clearTimeout(timer);
          resolve(false);
        }
      });
      if (!seeked || !alive) return false;
      const test = document.createElement("canvas");
      test.width = 8;
      test.height = 8;
      const testCtx = test.getContext("2d", { willReadFrequently: true });
      if (!testCtx) return false;
      testCtx.drawImage(probe, 0, 0, 8, 8);
      let ink = 0;
      try {
        const data = testCtx.getImageData(0, 0, 8, 8).data;
        for (let i = 0; i < data.length; i += 4) ink += data[i] + data[i + 1] + data[i + 2];
      } catch {
        return false;
      }
      if (ink < 24) return false;
      video = probe;
      probe.addEventListener("seeked", onSeeked);
      return true;
    };

    void (async () => {
      await paintFrames();
      if (!alive) return;
      const ok = await videoPaints();
      if (!alive) return;
      if (ok && video) {
        mode = "video";
        for (const bmp of bitmaps.values()) bmp.close();
        bitmaps.clear();
        seekVideo();
      }
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
    })();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const bmp of bitmaps.values()) bmp.close();
      bitmaps.clear();
      if (video) {
        video.removeEventListener("seeked", onSeeked);
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  return (
    <div className="scroll-ground" aria-hidden="true">
      <canvas ref={ref} />
      <div className="scroll-scrim" />
    </div>
  );
}
