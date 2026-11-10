"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { GuestPhoto } from "@/lib/guest-photos";

const qrOptions = {
  width: 640,
  margin: 1,
  errorCorrectionLevel: "Q" as const,
  color: { dark: "#2B221C", light: "#F6F0E6" },
};

export function GuestDesk({ initial }: { initial: GuestPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const next = `${window.location.origin}/camera`;
    setUrl(next);
    QRCode.toDataURL(next, qrOptions)
      .then(setQr)
      .catch(() => setError("Could not draw the camera code."));
  }, []);

  async function refresh() {
    const res = await fetch("/api/guest-photos");
    const data = (await res.json().catch(() => null)) as { photos?: GuestPhoto[] } | null;
    if (res.ok && data?.photos) setPhotos(data.photos);
  }

  async function move(id: string, direction: -1 | 1) {
    const ids = photos.map((photo) => photo.id);
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/guest-photos/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; photos?: GuestPhoto[] } | null;
      if (!res.ok || !data?.photos) {
        setError(data?.error || "Could not arrange those.");
        await refresh();
        return;
      }
      setPhotos(data.photos);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/guest-photos/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Could not remove that.");
        return;
      }
      setPhotos((current) => current.filter((photo) => photo.id !== id));
      setPending(null);
      setNote("Photograph removed.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!qr) return;
    const anchor = document.createElement("a");
    anchor.href = qr;
    anchor.download = "guest-camera-qr.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <section className="desk-section" id="guest-photos">
      <h2>Guest photographs</h2>
      <p>
        Print this code for the wedding. A guest scans it, the camera opens in the browser, and they can use the back
        camera or the front camera. The photograph lands on Guest photos, with their name underneath.
      </p>
      {note ? <p className="form-note">{note}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="qr-panel">
        {qr ? <img src={qr} alt="QR code that opens the wedding camera" /> : null}
        <div>
          <p className="qr-url">{url}</p>
          <button type="button" className="text-button" onClick={download} disabled={!qr}>
            Download QR
          </button>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="empty-line">No guest photographs yet.</p>
      ) : (
        <ul className="library-list">
          {photos.map((photo, index) => (
            <li className="library-row" key={photo.id}>
              <img src={photo.src} alt="" />
              <div>
                <p className="guest-taken">Taken by {photo.name}</p>
                <div className="row-actions">
                  <button type="button" className="text-button" disabled={busy || index === 0} onClick={() => void move(photo.id, -1)}>
                    Move up
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || index === photos.length - 1}
                    onClick={() => void move(photo.id, 1)}
                  >
                    Move down
                  </button>
                  {pending === photo.id ? (
                    <>
                      <button type="button" className="text-button danger" disabled={busy} onClick={() => void remove(photo.id)}>
                        Remove
                      </button>
                      <button type="button" className="text-button" disabled={busy} onClick={() => setPending(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="text-button danger" disabled={busy} onClick={() => setPending(photo.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
