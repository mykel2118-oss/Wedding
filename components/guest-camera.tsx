"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const NAME_KEY = "yk-camera-name";
const MAX_EDGE = 1600;

type Facing = "environment" | "user";
type Look = "warm" | "vintage" | "normal";

const LOOKS: { id: Look; label: string; filter: string }[] = [
  { id: "warm", label: "Warm", filter: "sepia(0.25) saturate(1.35) brightness(1.06) contrast(1.04)" },
  { id: "vintage", label: "Vintage", filter: "sepia(0.55) contrast(0.88) brightness(1.08) saturate(0.7)" },
  { id: "normal", label: "Normal", filter: "none" },
];

async function openCamera(facing: Facing) {
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { exact: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: true },
  ];
  let last: unknown = null;
  for (const constraints of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("camera");
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function shrinkCanvas(canvas: HTMLCanvasElement) {
  let quality = 0.82;
  let blob = await canvasBlob(canvas, quality);
  while (blob && blob.size > 3_500_000 && quality > 0.5) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await canvasBlob(canvas, quality);
  }
  return blob;
}

function drawCover(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  mirror: boolean,
  filter: string,
) {
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.filter = filter;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function GuestCamera() {
  const [name, setName] = useState("");
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [look, setLook] = useState<Look>("normal");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ticket = useRef(0);
  const filter = LOOKS.find((item) => item.id === look)?.filter ?? "none";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("intro-done", "envelope-open");
    root.classList.remove("envelope-lock");
    const stored = sessionStorage.getItem(NAME_KEY)?.replace(/\s+/g, " ").trim().slice(0, 40) || "";
    if (stored) setName(stored);
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!live || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
  }, [live, facing]);

  async function openFacing(next: Facing) {
    const mine = ticket.current + 1;
    ticket.current = mine;
    setError("");
    setReady(false);
    const stream = await openCamera(next);
    if (mine !== ticket.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const previous = streamRef.current;
    streamRef.current = stream;
    previous?.getTracks().forEach((track) => track.stop());
    setFacing(next);
    setLive(true);
  }

  function begin(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) {
      setError("Enter your name.");
      return;
    }
    setName(clean);
    sessionStorage.setItem(NAME_KEY, clean);
    sessionStorage.setItem("yk-intro:home", "1");
    void openFacing(facing).catch(() => {
      setError("The camera needs permission. Allow it, then try again.");
    });
  }

  async function sendBlob(blob: Blob) {
    const body = new FormData();
    body.set("name", name);
    body.set("file", blob, "photo.jpg");
    const res = await fetch("/api/guest-photos", { method: "POST", body });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(data?.error || "Could not add that photograph.");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || busy || video.videoWidth === 0) return;
    setBusy(true);
    setError("");
    try {
      const canvas = drawCover(video, video.videoWidth, video.videoHeight, facing === "user", filter);
      const blob = canvas ? await shrinkCanvas(canvas) : null;
      if (!blob) throw new Error("Could not take that photograph.");
      await sendBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that photograph.");
    } finally {
      setBusy(false);
    }
  }

  if (!live) {
    return (
      <main className="camera-gate">
        <p className="eyebrow">The wedding of Ying & kel</p>
        <h1>Add a photograph</h1>
        <p>Your name stays under the picture, as Taken by {name.trim() || "your name"}.</p>
        <p className="camera-save-note">
          Once you take a photograph, it is saved on the website right away. You will not be able to delete it.
        </p>
        <form onSubmit={begin}>
          <label>
            <span>Your name</span>
            <input
              value={name}
              maxLength={40}
              autoComplete="name"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="button">
            Open the camera
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="camera-stage">
      <div className="camera-top">
        <Link href="/guests">See the photographs</Link>
        <button
          type="button"
          onClick={() => {
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            setReady(false);
            setLive(false);
            setError("");
          }}
        >
          Change name
        </button>
      </div>
      <div className="camera-view">
        <video
          ref={videoRef}
          className={facing === "user" ? "is-mirror" : ""}
          style={{ filter }}
          autoPlay
          muted
          playsInline
          onPlaying={() => setReady(true)}
        />
        {saved ? <p className="camera-saved">Saved</p> : null}
      </div>
      <div className="camera-filters" role="group" aria-label="Photograph look">
        {LOOKS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={look === item.id}
            onClick={() => setLook(item.id)}
            disabled={busy}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="camera-bar">
        <span aria-hidden="true" />
        <button type="button" className="camera-shutter" onClick={() => void shoot()} disabled={busy || !ready} aria-label="Take a photograph" />
        <button
          type="button"
          className="camera-side"
          onClick={() => {
            const next = facing === "environment" ? "user" : "environment";
            void openFacing(next).catch(() => setError("Could not switch the camera."));
          }}
          disabled={busy}
          aria-label="Switch camera"
        >
          Flip
        </button>
      </div>
      <p className="camera-byline">Taken by {name}</p>
      {error ? (
        <p className="camera-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
