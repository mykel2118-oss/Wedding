"use client";

import { useState } from "react";
import { FILM_CHUNK_BYTES, FILM_MAX_BYTES } from "@/lib/film-limits";
import type { MediaItem, MediaKind } from "@/lib/types";

async function readError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

function errorText(text: string, fallback: string) {
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function postForm(
  url: string,
  body: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => resolve({ status: xhr.status, text: xhr.responseText }));
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("upload aborted")));
    xhr.send(body);
  });
}

async function uploadFilm(
  file: File,
  caption: string,
  onProgress: (percent: number) => void,
): Promise<{ status: number; text: string }> {
  const uploadId = crypto.randomUUID();
  const total = Math.ceil(file.size / FILM_CHUNK_BYTES);
  const urls: string[] = [];
  let sent = 0;
  for (let index = 0; index < total; index++) {
    const start = index * FILM_CHUNK_BYTES;
    const blob = file.slice(start, Math.min(file.size, start + FILM_CHUNK_BYTES));
    const body = new FormData();
    body.set("uploadId", uploadId);
    body.set("index", String(index));
    body.set("total", String(total));
    body.set("size", String(file.size));
    body.set("caption", caption);
    body.set("file", blob, file.name || "film.mov");
    const report = (loaded: number, chunkTotal: number) => {
      const portion = chunkTotal > 0 ? (loaded / chunkTotal) * blob.size : 0;
      onProgress(Math.min(99, Math.round(((sent + portion) / file.size) * 100)));
    };
    let result = await postForm("/api/film/part", body, report);
    if (result.status < 200 || result.status >= 300) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      result = await postForm("/api/film/part", body, report);
    }
    if (result.status < 200 || result.status >= 300) return result;
    let saved: { url?: string };
    try {
      saved = JSON.parse(result.text) as { url?: string };
    } catch {
      return { status: 400, text: JSON.stringify({ error: "Could not add that film." }) };
    }
    if (!saved.url) return { status: 400, text: JSON.stringify({ error: "Could not add that film." }) };
    urls.push(saved.url);
    sent += blob.size;
    onProgress(Math.min(99, Math.round((sent / file.size) * 100)));
  }
  onProgress(100);
  const res = await fetch("/api/film/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caption, size: file.size, urls }),
  });
  return { status: res.status, text: await res.text() };
}

export function LibraryDesk({ initial }: { initial: MediaItem[] }) {
  const [items, setItems] = useState(initial);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filmCaption, setFilmCaption] = useState("");
  const [filmFile, setFilmFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [filmKey, setFilmKey] = useState(0);
  const [filmProgress, setFilmProgress] = useState<number | null>(null);

  function note(text: string) {
    setError("");
    setMessage(text);
  }

  function fail(text: string) {
    setMessage("");
    setError(text);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      fail("Choose a photograph.");
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    body.set("caption", caption);
    body.set("expect", "photo");
    const res = await fetch("/api/media", { method: "POST", body });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not add that photograph."));
      return;
    }
    const data = (await res.json()) as { item: MediaItem };
    setItems((current) => [...current, data.item]);
    setCaption("");
    setFile(null);
    setFileKey((value) => value + 1);
    note("Photograph added.");
  }

  async function addFilm(event: React.FormEvent) {
    event.preventDefault();
    if (!filmFile) {
      fail("Choose an MP4, MOV, or WEBM film.");
      return;
    }
    if (filmFile.size > FILM_MAX_BYTES) {
      fail("That film is too large to add.");
      return;
    }
    setBusy(true);
    setFilmProgress(0);
    let status = 0;
    let text = "";
    try {
      const result = await uploadFilm(filmFile, filmCaption, setFilmProgress);
      status = result.status;
      text = result.text;
    } catch {
      setFilmProgress(null);
      setBusy(false);
      fail("Could not add that film.");
      return;
    }
    setBusy(false);
    setFilmProgress(null);
    if (status === 401) {
      window.location.href = "/private";
      return;
    }
    if (status < 200 || status >= 300) {
      fail(errorText(text, "Could not add that film."));
      return;
    }
    let data: { item?: MediaItem };
    try {
      data = JSON.parse(text) as { item?: MediaItem };
    } catch {
      fail("Could not add that film.");
      return;
    }
    if (!data.item?.id || data.item.kind !== "video") {
      fail("Could not add that film.");
      return;
    }
    setItems((current) => [...current, data.item as MediaItem]);
    setFilmCaption("");
    setFilmFile(null);
    setFilmKey((value) => value + 1);
    note("Film added.");
  }

  async function saveCaption(item: MediaItem) {
    setBusy(true);
    const res = await fetch(`/api/media/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: item.caption }),
    });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not save that caption."));
      return;
    }
    note("Caption saved.");
  }

  async function move(kind: MediaKind, id: string, direction: -1 | 1) {
    const group = items.filter((item) => item.kind === kind);
    const index = group.findIndex((item) => item.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= group.length) return;
    const orderedIds = group.map((item) => item.id);
    const [moved] = orderedIds.splice(index, 1);
    orderedIds.splice(next, 0, moved);
    setBusy(true);
    const res = await fetch("/api/media/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, orderedIds }),
    });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not reorder."));
      return;
    }
    const data = (await res.json()) as { items: MediaItem[] };
    setItems(data.items);
    note("Order updated.");
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not remove that."));
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setConfirmId(null);
    note("Removed from the library.");
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await fetch("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (res.status === 401 && !currentPassword) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not update the password."));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    note("Password updated.");
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  const photos = items.filter((item) => item.kind === "photo");
  const videos = items.filter((item) => item.kind === "video");

  return (
    <div className="desk">
      <div className="desk-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>The library</h1>
          <p className="lede">
            Photographs and films saved here are what the public pages show. Captions and order can be changed at any time.
          </p>
        </div>
        <button type="button" className="text-button" onClick={signOut}>
          Sign out
        </button>
      </div>

      {message ? <p className="form-note">{message}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="add-form" onSubmit={add}>
        <h2>Add a photograph</h2>
        <label>
          <span>Caption</span>
          <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={280} placeholder="A line for this one" />
        </label>
        <div className="add-row">
          <label className="file-label">
            Choose a photograph
            <input
              key={fileKey}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <span className="file-name">{file ? file.name : "JPEG, PNG, WEBP, or HEIC"}</span>
          <button className="button" type="submit" disabled={busy || !file}>
            Add photograph
          </button>
        </div>
      </form>

      <section className="desk-section">
        <h2>Photographs <em>{photos.length}</em></h2>
        {photos.length === 0 ? <p className="empty-line">No photographs yet.</p> : null}
        <ul className="library-list">
          {photos.map((item, index) => (
            <LibraryRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === photos.length - 1}
              busy={busy}
              confirming={confirmId === item.id}
              onCaption={(value) =>
                setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, caption: value } : entry)))
              }
              onSave={() => saveCaption(item)}
              onMove={(direction) => move("photo", item.id, direction)}
              onAskRemove={() => setConfirmId(item.id)}
              onCancelRemove={() => setConfirmId(null)}
              onRemove={() => remove(item.id)}
            />
          ))}
        </ul>
      </section>

      <section className="desk-section">
        <h2>Films <em>{videos.length}</em></h2>
        {videos.length === 0 ? <p className="empty-line">No films yet.</p> : null}
        <ul className="library-list">
          {videos.map((item, index) => (
            <LibraryRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === videos.length - 1}
              busy={busy}
              confirming={confirmId === item.id}
              onCaption={(value) =>
                setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, caption: value } : entry)))
              }
              onSave={() => saveCaption(item)}
              onMove={(direction) => move("video", item.id, direction)}
              onAskRemove={() => setConfirmId(item.id)}
              onCancelRemove={() => setConfirmId(null)}
              onRemove={() => remove(item.id)}
            />
          ))}
        </ul>
      </section>

      <form className="password-card" onSubmit={changePassword}>
        <h2>Password</h2>
        <p>Choose something you will remember. The old one stops working as soon as this is saved.</p>
        <label>
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={7}
            required
          />
        </label>
        <button className="button" type="submit" disabled={busy}>
          Update password
        </button>
      </form>

      <form className="add-form film-upload" id="film-upload" onSubmit={addFilm}>
        <h2>Add a film</h2>
        <p>MP4, MOV, or WEBM, including a film from a phone. Films stay in this library. A video for one of the three big photographs is added above, and that one loops on the home page.</p>
        <label>
          <span>Caption</span>
          <input
            value={filmCaption}
            onChange={(event) => setFilmCaption(event.target.value)}
            maxLength={280}
            placeholder="A line for this film"
          />
        </label>
        <div className="add-row">
          <label className="file-label">
            Choose a film
            <input
              key={filmKey}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
              onChange={(event) => setFilmFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <span className="file-name">{filmFile ? filmFile.name : "MP4, MOV, or WEBM"}</span>
          {filmProgress !== null ? (
            <p className="upload-progress" role="status" aria-live="polite" data-upload-percent={filmProgress}>
              {filmProgress < 100 ? `Uploading ${filmProgress}%` : "Uploading 100%. Saving…"}
              <span className="upload-track" aria-hidden="true">
                <span style={{ width: `${filmProgress}%` }} />
              </span>
            </p>
          ) : null}
          <button className="button" type="submit" disabled={busy || !filmFile}>
            {filmProgress === null ? "Add film" : filmProgress < 100 ? `Uploading ${filmProgress}%` : "Saving…"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LibraryRow({
  item,
  first,
  last,
  busy,
  confirming,
  onCaption,
  onSave,
  onMove,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  item: MediaItem;
  first: boolean;
  last: boolean;
  busy: boolean;
  confirming: boolean;
  onCaption: (value: string) => void;
  onSave: () => void;
  onMove: (direction: -1 | 1) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="library-row">
      {item.kind === "video" ? (
        <video src={item.src} muted playsInline preload="metadata" />
      ) : (
        <img src={item.src} alt="" />
      )}
      <div>
        <label>
          <span>Caption</span>
          <input value={item.caption} maxLength={280} onChange={(event) => onCaption(event.target.value)} />
        </label>
        <div className="row-actions">
          <button type="button" className="text-button" disabled={busy} onClick={onSave}>
            Save caption
          </button>
          <button type="button" className="text-button" disabled={busy || first} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="text-button" disabled={busy || last} onClick={() => onMove(1)}>
            Move down
          </button>
          {confirming ? (
            <>
              <button type="button" className="text-button danger" disabled={busy} onClick={onRemove}>
                Remove
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={onCancelRemove}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="text-button danger" disabled={busy} onClick={onAskRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
