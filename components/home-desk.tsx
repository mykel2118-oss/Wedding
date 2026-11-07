"use client";

import { useRef, useState } from "react";
import { MUSIC_CHUNK_BYTES, MUSIC_MAX_BYTES } from "@/lib/music-limits";
import type { HomeDetails } from "@/lib/types";

async function readError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

function postForm(url: string, body: FormData): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.addEventListener("load", () => resolve({ status: xhr.status, text: xhr.responseText }));
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.send(body);
  });
}

export function HomeDesk({ initial }: { initial: HomeDetails }) {
  const [home, setHome] = useState(initial);
  const [address, setAddress] = useState(initial.address);
  const [dressCode, setDressCode] = useState(initial.dressCode);
  const [name, setName] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [opacity, setOpacity] = useState(initial.backgroundOpacity);
  const [panel, setPanel] = useState(initial.panelOpacity);
  const opacityTimer = useRef<number | null>(null);
  const panelTimer = useRef<number | null>(null);
  const [audioKey, setAudioKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function note(text: string) {
    setError("");
    setMessage(text);
  }
  function fail(text: string) {
    setMessage("");
    setError(text);
  }

  async function saveFields(patch: { address?: string; dressCode?: string; honored?: string[]; backgroundOpacity?: number; panelOpacity?: number }) {
    setBusy(true);
    const res = await fetch("/api/home", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return null;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not save that."));
      return null;
    }
    const data = (await res.json()) as { home: HomeDetails };
    setHome(data.home);
    setAddress(data.home.address);
    setDressCode(data.home.dressCode);
    note("Saved.");
    return data.home;
  }

  function queueOpacity(next: number) {
    document.documentElement.style.setProperty("--bg-video", String(next / 100));
    if (opacityTimer.current) window.clearTimeout(opacityTimer.current);
    opacityTimer.current = window.setTimeout(() => {
      void saveFields({ backgroundOpacity: next });
    }, 350);
  }

  function queuePanel(next: number) {
    document.documentElement.style.setProperty("--panel", String(next / 100));
    if (panelTimer.current) window.clearTimeout(panelTimer.current);
    panelTimer.current = window.setTimeout(() => {
      void saveFields({ panelOpacity: next });
    }, 350);
  }

  async function addName(event: React.FormEvent) {
    event.preventDefault();
    const next = name.replace(/\s+/g, " ").trim();
    if (!next) {
      fail("Enter a name.");
      return;
    }
    if (home.honored.includes(next)) {
      fail("That name is already listed.");
      return;
    }
    const saved = await saveFields({ honored: [...home.honored, next] });
    if (saved) setName("");
  }

  async function uploadMusic(event: React.FormEvent) {
    event.preventDefault();
    if (!audio) {
      fail("Choose an audio file.");
      return;
    }
    if (audio.size > MUSIC_MAX_BYTES) {
      fail("That music file is too large to add.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const uploadId = crypto.randomUUID();
      const total = Math.ceil(audio.size / MUSIC_CHUNK_BYTES);
      const urls: string[] = [];
      for (let index = 0; index < total; index++) {
        const start = index * MUSIC_CHUNK_BYTES;
        const blob = audio.slice(start, Math.min(audio.size, start + MUSIC_CHUNK_BYTES));
        const body = new FormData();
        body.set("uploadId", uploadId);
        body.set("index", String(index));
        body.set("total", String(total));
        body.set("size", String(audio.size));
        body.set("file", blob, audio.name || "music.mp3");
        const result = await postForm("/api/music/part", body);
        if (result.status === 401) {
          window.location.href = "/private";
          return;
        }
        if (result.status < 200 || result.status >= 300) {
          fail("Could not add that music.");
          setBusy(false);
          return;
        }
        const saved = JSON.parse(result.text) as { url?: string };
        if (!saved.url) {
          fail("Could not add that music.");
          setBusy(false);
          return;
        }
        urls.push(saved.url);
      }
      const res = await fetch("/api/music/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ size: audio.size, urls }),
      });
      setBusy(false);
      if (!res.ok) {
        fail(await readError(res, "Could not add that music."));
        return;
      }
      const data = (await res.json()) as { home?: HomeDetails };
      if (!data.home?.musicUrl) {
        fail("Could not add that music.");
        return;
      }
      setHome(data.home);
      setAudio(null);
      setAudioKey((value) => value + 1);
      note("Music saved.");
    } catch {
      setBusy(false);
      fail("Could not add that music.");
    }
  }

  async function removeMusic() {
    setBusy(true);
    const res = await fetch("/api/music", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      fail(await readError(res, "Could not remove that music."));
      return;
    }
    const data = (await res.json()) as { home: HomeDetails };
    setHome(data.home);
    note("Music removed.");
  }

  return (
    <section className="desk-section invitation-desk" id="invitation-desk">
      <h2>The invitation</h2>
      <p>These show on the home page after you save them. Leave a field blank and it stays off the page.</p>

      <form
        className="add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveFields({ address, dressCode });
        }}
      >
        <label>
          <span>Venue address</span>
          <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} autoComplete="street-address" />
        </label>
        <label>
          <span>Dress code</span>
          <textarea value={dressCode} onChange={(event) => setDressCode(event.target.value)} maxLength={800} rows={3} />
        </label>
        <button className="button" type="submit" disabled={busy}>
          Save details
        </button>
      </form>

      <form className="add-form" onSubmit={addName}>
        <h3>Parents and honored guests</h3>
        {home.honored.length ? (
          <ul className="honored-edit">
            {home.honored.map((person) => (
              <li key={person}>
                <span>{person}</span>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void saveFields({ honored: home.honored.filter((item) => item !== person) })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </label>
        <button className="button" type="submit" disabled={busy || !name.trim()}>
          Add name
        </button>
      </form>

      <form className="add-form" onSubmit={(event) => event.preventDefault()}>
        <h3>Background film</h3>
        <p>How clearly the moving picture shows across the page.</p>
        <label className="opacity-slider">
          <span>Background film {opacity}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={opacity}
            onChange={(event) => {
              const next = Number(event.target.value);
              setOpacity(next);
              queueOpacity(next);
            }}
          />
        </label>
      </form>

      <form className="add-form" onSubmit={(event) => event.preventDefault()}>
        <h3>Cream panels</h3>
        <p>How solid the panels behind the words and photographs are. Lower lets the moving picture show through.</p>
        <label className="opacity-slider">
          <span>Cream panels {panel}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={panel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={panel}
            onChange={(event) => {
              const next = Number(event.target.value);
              setPanel(next);
              queuePanel(next);
            }}
          />
        </label>
      </form>

      <form className="add-form" id="music-upload" onSubmit={uploadMusic}>
        <h3>Background music</h3>
        <p>One audio file. Guests can play or pause it. Nothing plays until you add a file.</p>
        {home.musicUrl ? (
          <p>
            A track is on the home page.{" "}
            <button type="button" className="text-button" disabled={busy} onClick={() => void removeMusic()}>
              Remove music
            </button>
          </p>
        ) : null}
        <div className="add-row">
          <label className="file-label">
            Choose music
            <input
              key={audioKey}
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg"
              onChange={(event) => setAudio(event.target.files?.[0] ?? null)}
            />
          </label>
          <span className="file-name">{audio ? audio.name : "MP3, M4A, WAV, or OGG"}</span>
          <button className="button" type="submit" disabled={busy || !audio}>
            Save music
          </button>
        </div>
      </form>

      {message ? <p className="form-note">{message}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
