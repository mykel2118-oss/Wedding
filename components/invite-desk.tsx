"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { InviteRecord } from "@/lib/types";

type HostInvite = InviteRecord & { token: string };

const qrOptions = {
  width: 640,
  margin: 1,
  errorCorrectionLevel: "Q" as const,
  color: { dark: "#2B221C", light: "#F6F0E6" },
};

function guestUrl(origin: string, token: string) {
  const url = new URL("/", origin);
  url.searchParams.set("guest", token);
  return url.toString();
}

function download(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function fileSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "guest";
}

export function InviteDesk({ initial }: { initial: HostInvite[] }) {
  const [invites, setInvites] = useState(initial);
  const [draft, setDraft] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ name: string; url: string; image: string } | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteQr, setSiteQr] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/`;
    setSiteUrl(url);
    QRCode.toDataURL(url, qrOptions)
      .then(setSiteQr)
      .catch(() => setError("Could not draw the invitation code."));
  }, []);

  const attending = invites.filter((invite) => invite.responded);
  const names = attending.flatMap((invite) => invite.names);

  async function codeFor(token: string) {
    const url = guestUrl(window.location.origin, token);
    const image = await QRCode.toDataURL(url, qrOptions);
    return { url, image };
  }

  async function make(event: React.FormEvent) {
    event.preventDefault();
    const names = draft.map((item) => item.trim());
    if (!names[0]) {
      setError("Enter a guest name.");
      return;
    }
    if (names.length > 1 && !names[1]) {
      setError("Enter the second name, or leave the invitation as one name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: names.filter(Boolean) }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        invite?: HostInvite;
        invites?: HostInvite[];
      } | null;
      if (!res.ok || !data?.invite?.token) {
        setError(data?.error || "Could not make that invitation.");
        return;
      }
      if (data.invites) setInvites(data.invites);
      const drawn = await codeFor(data.invite.token);
      setMade({ name: data.invite.name, ...drawn });
      setDraft([""]);
    } catch {
      setError("Could not make that invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadGuest(invite: HostInvite) {
    setError("");
    try {
      const drawn = await codeFor(invite.token);
      download(drawn.image, `ying-kel-${fileSlug(invite.name)}.png`);
    } catch {
      setError("Could not download that code.");
    }
  }

  async function remove(invite: HostInvite) {
    if (pendingDelete !== invite.id) {
      setPendingDelete(invite.id);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${invite.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string; invites?: HostInvite[] } | null;
      if (!res.ok || !data?.invites) {
        setError(data?.error || "Could not remove that invitation.");
        return;
      }
      setInvites(data.invites);
      setPendingDelete(null);
      if (made?.name === invite.name) setMade(null);
    } catch {
      setError("Could not remove that invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="invite-desk">
      <p className="eyebrow">Guests</p>
      <h2>Who is coming</h2>
      <p className="headcount">
        <strong>{names.length}</strong> {names.length === 1 ? "person" : "people"} attending
      </p>
      {names.length ? (
        <ul className="name-roll" aria-label="People attending">
          {names.map((person, index) => (
            <li key={`${person}-${index}`}>{person}</li>
          ))}
        </ul>
      ) : (
        <p className="rsvp-note">No replies yet. Every name from a reply is listed here.</p>
      )}

      <h3>Replies</h3>
      {attending.length ? (
        <ul className="rsvp-list">
          {attending.map((invite) => (
            <li key={invite.id}>
              <p>
                <strong>{invite.name}</strong>
                <span>
                  {" "}
                  · {invite.names.join(", ")} · {invite.headcount} {invite.headcount === 1 ? "person" : "people"}
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rsvp-note">The reply list is empty.</p>
      )}

      <form className="add-form" onSubmit={make}>
        <h3>An invitation</h3>
        <p className="rsvp-note">Add one name, or add a second. One code covers that invitation.</p>
        {draft.map((value, index) => (
          <label key={index}>
            <span>{index === 0 ? "Name" : "Second name"}</span>
            <input
              type="text"
              value={value}
              maxLength={60}
              onChange={(event) => {
                const next = draft.slice();
                next[index] = event.target.value;
                setDraft(next);
              }}
            />
          </label>
        ))}
        <div className="add-row">
          {draft.length < 2 ? (
            <button type="button" className="button" onClick={() => setDraft([...draft, ""])}>
              Add
            </button>
          ) : (
            <button type="button" className="text-button" onClick={() => setDraft(draft.slice(0, 1))}>
              Remove second name
            </button>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Making" : "Make a code"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {made ? (
        <div className="qr-panel">
          <img src={made.image} alt={`QR code for ${made.name}`} width={220} height={220} />
          <div>
            <p>
              <strong>{made.name}</strong>
            </p>
            <p className="qr-url">{made.url}</p>
            <button type="button" className="button" onClick={() => download(made.image, `ying-kel-${fileSlug(made.name)}.png`)}>
              Download QR
            </button>
          </div>
        </div>
      ) : null}

      {invites.length ? (
        <ul className="rsvp-list invite-codes">
          {invites.map((invite) => (
            <li key={invite.id}>
              <p>
                <strong>{invite.name}</strong>
                <span>{invite.responded ? " · replied" : " · waiting"}</span>
              </p>
              <span className="row-actions">
                <button type="button" className="text-button" onClick={() => downloadGuest(invite)}>
                  Download QR
                </button>
                <button type="button" className="text-button danger" onClick={() => remove(invite)} disabled={busy}>
                  {pendingDelete === invite.id ? "Confirm delete" : "Delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="qr-panel general-qr">
        <div>
          <h3>The invitation</h3>
          <p className="rsvp-note">One code for the wedding site, separate from each guest&apos;s code.</p>
          {siteUrl ? <p className="qr-url">{siteUrl}</p> : null}
          {siteQr ? (
            <button type="button" className="button" onClick={() => download(siteQr, "ying-kel-invitation.png")}>
              Download invitation QR
            </button>
          ) : null}
        </div>
        {siteQr ? <img src={siteQr} alt="QR code for the invitation" width={220} height={220} /> : null}
      </div>
    </section>
  );
}
