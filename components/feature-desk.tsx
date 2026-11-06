"use client";

import { useState } from "react";
import { FILM_CHUNK_BYTES, FILM_MAX_BYTES, GIF_MAX_BYTES } from "@/lib/film-limits";
import type { HomeDetails, MediaItem } from "@/lib/types";

const SLOTS = [
  { title: "First big photograph", detail: "Ordinary dates" },
  { title: "Second big photograph", detail: "Nights that stayed out" },
  { title: "Third big photograph", detail: "A gold evening" },
] as const;

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
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress(event.loaded, event.total);
      });
    }
    xhr.addEventListener("load", () => resolve({ status: xhr.status, text: xhr.responseText }));
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.send(body);
  });
}

function isGif(file: File) {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

async function uploadPieces(
  file: File,
  caption: string,
  onProgress: (percent: number) => void,
  finish: { keepOriginal?: boolean; gif?: boolean },
) {
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
    const saved = JSON.parse(result.text) as { url?: string };
    if (!saved.url) return { status: 400, text: JSON.stringify({ error: finish.gif ? "Could not add that GIF." : "Could not add that video." }) };
    urls.push(saved.url);
    sent += blob.size;
    onProgress(Math.min(99, Math.round((sent / file.size) * 100)));
  }
  onProgress(100);
  const res = await fetch("/api/film/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caption, size: file.size, urls, ...finish }),
  });
  return { status: res.status, text: await res.text() };
}

type Slot = number | "banner";

export function FeatureDesk({ initial, media }: { initial: HomeDetails; media: MediaItem[] }) {
  const [features, setFeatures] = useState(initial.features);
  const [banner, setBanner] = useState<string | null>(initial.banner);
  const [known, setKnown] = useState(media);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Slot | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressSlot, setProgressSlot] = useState<Slot | "gif" | null>(null);
  const [keys, setKeys] = useState<Record<string, number>>({});
  const [place, setPlace] = useState<"banner" | "story">("banner");

  function note(text: string, where: "banner" | "story") {
    setError("");
    setMessage(text);
    setPlace(where);
  }
  function fail(text: string, where: "banner" | "story") {
    setMessage("");
    setError(text);
    setPlace(where);
  }
  function whereOf(index: Slot): "banner" | "story" {
    return index === "banner" ? "banner" : "story";
  }

  function bump(key: string) {
    setKeys((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  }

  async function savePatch(patch: { features?: HomeDetails["features"]; banner?: string | null }, done: string, where: "banner" | "story") {
    setBusy(true);
    const res = await fetch("/api/home", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/private";
      return false;
    }
    if (!res.ok) {
      fail(await readError(res, "Could not save that."), where);
      return false;
    }
    const data = (await res.json()) as { home: HomeDetails };
    setFeatures(data.home.features);
    setBanner(data.home.banner);
    setConfirm(null);
    note(done, where);
    return true;
  }

  async function addGif(file: File) {
    if (file.size > GIF_MAX_BYTES) {
      fail("That GIF is too large to add.", "banner");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setProgressSlot("gif");
    setProgress(0);
    let status = 0;
    let text = "";
    try {
      const result = await uploadPieces(file, "The first photograph", setProgress, { gif: true });
      status = result.status;
      text = result.text;
    } catch {
      setProgress(null);
      setProgressSlot(null);
      setBusy(false);
      fail("Could not add that GIF.", "banner");
      return;
    }
    setProgress(null);
    setProgressSlot(null);
    if (status === 401) {
      setBusy(false);
      window.location.href = "/private";
      return;
    }
    if (status < 200 || status >= 300) {
      setBusy(false);
      fail(errorText(text, "Could not add that GIF."), "banner");
      return;
    }
    let data: { item?: MediaItem };
    try {
      data = JSON.parse(text) as { item?: MediaItem };
    } catch {
      setBusy(false);
      fail("Could not add that GIF.", "banner");
      return;
    }
    if (!data.item || data.item.kind !== "video") {
      setBusy(false);
      fail("Could not add that GIF.", "banner");
      return;
    }
    setKnown((current) => [...current, data.item as MediaItem]);
    const saved = await savePatch({ banner: data.item.id }, "GIF saved. It plays on the banner right away.", "banner");
    if (saved) bump("banner-photo");
  }

  async function addPhoto(index: Slot, file: File) {
    if (isGif(file)) {
      if (index !== "banner") {
        fail("A GIF goes on the first photograph.", "story");
        return;
      }
      await addGif(file);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const body = new FormData();
    body.set("file", file);
    body.set("caption", index === "banner" ? "The first photograph" : SLOTS[index].detail);
    body.set("expect", "photo");
    const res = await fetch("/api/media", { method: "POST", body });
    if (res.status === 401) {
      window.location.href = "/private";
      return;
    }
    if (!res.ok) {
      setBusy(false);
      fail(await readError(res, "Could not add that photograph."), whereOf(index));
      return;
    }
    const data = (await res.json()) as { item?: MediaItem };
    if (!data.item || data.item.kind !== "photo") {
      setBusy(false);
      fail("Could not add that photograph.", whereOf(index));
      return;
    }
    setKnown((current) => [...current, data.item as MediaItem]);
    const saved =
      index === "banner"
        ? await savePatch({ banner: data.item.id }, "Photograph saved on the banner.", "banner")
        : await savePatch(
            { features: features.map((item, slot) => (slot === index ? data.item!.id : item)) as HomeDetails["features"] },
            "Photograph saved on that spot.",
            "story",
          );
    if (saved) bump(index === "banner" ? "banner-photo" : `photo-${index}`);
  }

  async function addVideo(index: Slot, file: File) {
    if (file.size > FILM_MAX_BYTES) {
      fail("That video is too large to add.", whereOf(index));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setProgressSlot(index);
    setProgress(0);
    let status = 0;
    let text = "";
    try {
      const result = await uploadPieces(
        file,
        index === "banner" ? "The first photograph" : SLOTS[index].detail,
        setProgress,
        { keepOriginal: index === "banner" },
      );
      status = result.status;
      text = result.text;
    } catch {
      setProgress(null);
      setProgressSlot(null);
      setBusy(false);
      fail("Could not add that video.", whereOf(index));
      return;
    }
    setProgress(null);
    setProgressSlot(null);
    if (status === 401) {
      setBusy(false);
      window.location.href = "/private";
      return;
    }
    if (status < 200 || status >= 300) {
      setBusy(false);
      fail(errorText(text, "Could not add that video."), whereOf(index));
      return;
    }
    let data: { item?: MediaItem };
    try {
      data = JSON.parse(text) as { item?: MediaItem };
    } catch {
      setBusy(false);
      fail("Could not add that video.", whereOf(index));
      return;
    }
    if (!data.item || data.item.kind !== "video") {
      setBusy(false);
      fail("Could not add that video.", whereOf(index));
      return;
    }
    setKnown((current) => [...current, data.item as MediaItem]);
    const saved =
      index === "banner"
        ? await savePatch({ banner: data.item.id }, "Video saved. It loops on the banner.", "banner")
        : await savePatch(
            { features: features.map((item, slot) => (slot === index ? data.item!.id : item)) as HomeDetails["features"] },
            "Video saved. It loops in that spot.",
            "story",
          );
    if (saved) bump(index === "banner" ? "banner-video" : `video-${index}`);
  }

  const bannerItem = banner ? known.find((entry) => entry.id === banner) ?? null : null;

  return (
    <>
    <section className="desk-section" id="banner-photo">
      <h2>The first photograph</h2>
      <p>This is the wide photograph at the top of the page. Remove a replacement to bring the original photograph back. A video loops there, with no sound. A GIF plays there too. Both keep the file you chose.</p>
      {place === "banner" && message ? <p className="form-note">{message}</p> : null}
      {place === "banner" && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <article className="feature-card banner-card">
        <div className="feature-preview">
          {bannerItem?.kind === "video" ? (
            <video src={bannerItem.src} muted loop autoPlay playsInline />
          ) : (
            <img src={bannerItem?.src || "/photos/home-banner.png"} alt={bannerItem?.caption || "The first photograph"} />
          )}
        </div>
        <div className="feature-actions">
          {confirm === "banner" ? (
            <div className="row-actions">
              <button type="button" className="text-button danger" disabled={busy} onClick={() => void savePatch({ banner: null }, "The original photograph is back.", "banner")}>
                Remove
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(null)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="text-button danger" disabled={busy || !banner} onClick={() => setConfirm("banner")}>
              Remove
            </button>
          )}
          <form
            className="add-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("photo") as HTMLInputElement;
              const file = input.files?.[0];
                if (!file) {
                  fail("Choose a photograph.", "banner");
                  return;
                }
                void addPhoto("banner", file);
            }}
          >
            <label className="file-label">
              Upload a photograph or a GIF
              <input key={keys["banner-photo"] ?? 0} name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.heic,.jpg,.jpeg,.png,.webp,.gif" disabled={busy} />
            </label>
            {progress !== null && progressSlot === "gif" ? (
              <p className="upload-progress" role="status" aria-live="polite">
                {progress < 100 ? `Uploading ${progress}%` : "Uploading 100%. Saving…"}
                <span className="upload-track" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </span>
              </p>
            ) : null}
            <button className="button" type="submit" disabled={busy}>
              {progress === null || progressSlot !== "gif" ? "Save photograph" : progress < 100 ? `Uploading ${progress}%` : "Saving…"}
            </button>
          </form>
          <form
            className="add-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("video") as HTMLInputElement;
              const file = input.files?.[0];
                if (!file) {
                  fail("Choose a video.", "banner");
                  return;
                }
                void addVideo("banner", file);
            }}
          >
            <label className="file-label">
              Upload a video
              <input key={keys["banner-video"] ?? 0} name="video" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm" disabled={busy} />
            </label>
            {progress !== null && progressSlot === "banner" ? (
              <p className="upload-progress" role="status" aria-live="polite">
                {progress < 100 ? `Uploading ${progress}%` : "Uploading 100%. Saving…"}
                <span className="upload-track" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </span>
              </p>
            ) : null}
            <button className="button" type="submit" disabled={busy}>
              {progress === null || progressSlot !== "banner" ? "Save video" : progress < 100 ? `Uploading ${progress}%` : "Saving…"}
            </button>
          </form>
        </div>
      </article>
    </section>
    <section className="desk-section" id="big-photos">
      <h2>The three big photographs</h2>
      <p>These are the large pictures in the story. Remove one, then put a photograph or a video in its place. A video loops there, with no sound, so it can play on a phone.</p>
      {place === "story" && message ? <p className="form-note">{message}</p> : null}
      {place === "story" && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="feature-grid">
        {SLOTS.map((slot, index) => {
          const id = features[index];
          const item = id ? known.find((entry) => entry.id === id) : null;
          return (
            <article className="feature-card" key={slot.title}>
              <h3>{slot.title}</h3>
              <p className="feature-kicker">{slot.detail}</p>
              <div className="feature-preview">
                {item?.kind === "video" ? (
                  <video src={item.src} muted loop autoPlay playsInline />
                ) : item ? (
                  <img src={item.src} alt={item.caption || slot.detail} />
                ) : (
                  <p className="empty-line">This spot is empty.</p>
                )}
              </div>
              <div className="feature-actions">
                {confirm === index ? (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy || !id}
                      onClick={() => {
                        const next = features.map((entry, slotIndex) => (slotIndex === index ? null : entry)) as HomeDetails["features"];
                        void savePatch({ features: next }, "Removed from that spot.", "story");
                      }}
                    >
                      Remove
                    </button>
                    <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button type="button" className="text-button danger" disabled={busy || !id} onClick={() => setConfirm(index)}>
                    Remove
                  </button>
                )}
                <form
                  className="add-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.elements.namedItem("photo") as HTMLInputElement;
                    const file = input.files?.[0];
                    if (!file) {
                      fail("Choose a photograph.", "story");
                      return;
                    }
                    void addPhoto(index, file);
                  }}
                >
                  <label className="file-label">
                    Upload a photograph
                    <input key={keys[`photo-${index}`] ?? 0} name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.jpg,.jpeg,.png,.webp" disabled={busy} />
                  </label>
                  <button className="button" type="submit" disabled={busy}>
                    Save photograph
                  </button>
                </form>
                <form
                  className="add-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.elements.namedItem("video") as HTMLInputElement;
                    const file = input.files?.[0];
                    if (!file) {
                      fail("Choose a video.", "story");
                      return;
                    }
                    void addVideo(index, file);
                  }}
                >
                  <label className="file-label">
                    Upload a video
                    <input key={keys[`video-${index}`] ?? 0} name="video" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm" disabled={busy} />
                  </label>
                  {progress !== null && progressSlot === index ? (
                    <p className="upload-progress" role="status" aria-live="polite">
                      {progress < 100 ? `Uploading ${progress}%` : "Uploading 100%. Saving…"}
                      <span className="upload-track" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    </p>
                  ) : null}
                  <button className="button" type="submit" disabled={busy}>
                    {progress === null || progressSlot !== index ? "Save video" : progress < 100 ? `Uploading ${progress}%` : "Saving…"}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </section>
    </>
  );
}
