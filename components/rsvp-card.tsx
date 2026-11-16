"use client";

import { useState } from "react";

function listNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function invitedPeople(partyNames: string[] | null, name: string | null) {
  return (partyNames?.length ? partyNames : name ? [name] : []).slice(0, 2);
}

function comingSeed(invited: string[], savedNames: string[] | null, replied: boolean) {
  if (!replied || !savedNames?.length) return invited.map(() => true);
  const pool = savedNames.map((item) => item.trim().toLowerCase());
  const chosen = invited.map((person) => {
    const at = pool.indexOf(person.trim().toLowerCase());
    if (at < 0) return false;
    pool.splice(at, 1);
    return true;
  });
  return chosen.some(Boolean) ? chosen : invited.map(() => true);
}

export function RsvpCard({
  token,
  name,
  partyNames,
  savedNames,
}: {
  token: string | null;
  name: string | null;
  partyNames: string[] | null;
  savedNames: string[] | null;
}) {
  const replied = Boolean(savedNames && savedNames.length);
  const invited = invitedPeople(partyNames, name);
  const saved = replied
    ? invited.filter((person) => (savedNames ?? []).some((item) => item.trim().toLowerCase() === person.trim().toLowerCase()))
    : [];
  const [coming, setComing] = useState<boolean[]>(() => comingSeed(invited, savedNames, replied));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<{ names: string[]; headcount: number } | null>(
    saved.length ? { names: saved, headcount: saved.length } : null,
  );

  function chosenNames(flags = coming) {
    return invited.filter((_, index) => flags[index]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !name) return;
    const names = chosenNames();
    if (!names.length) {
      setError("Add back at least one person from your invitation.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, names }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; names?: string[]; headcount?: number } | null;
      if (!res.ok || !data?.names || typeof data.headcount !== "number") {
        setError(data?.error || "Could not save that reply.");
        return;
      }
      setDone({ names: data.names, headcount: data.headcount });
      setComing(comingSeed(invited, data.names, true));
      setEditing(false);
    } catch {
      setError("Could not save that reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rsvp-card" id="rsvp" aria-labelledby="rsvp-title">
      <p className="eyebrow">RSVP</p>
      <h2 id="rsvp-title">Will you be there?</h2>
      <p className="rsvp-note rsvp-deadline">Please reply before March 6. The last day to RSVP is March 6, 2027.</p>
      {done && !editing ? (
        <div className="rsvp-saved">
          <p className="rsvp-done">
            You already replied. {done.headcount} {done.headcount === 1 ? "person" : "people"}: {listNames(done.names)}.
          </p>
          <button type="button" className="button" onClick={() => setEditing(true)}>
            Edit reply
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {token && name ? (
            <>
              <p className="invite-name">{name}</p>
              <p className="rsvp-note">Remove a name if that person is not coming. You can add that name back.</p>
              <ul className="rsvp-people">
                {invited.map((person, index) => (
                  <li key={`${person}-${index}`} className={coming[index] ? undefined : "is-aside"}>
                    <span>{person}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const next = coming.slice();
                        next[index] = !next[index];
                        setComing(next);
                        setError("");
                      }}
                    >
                      {coming[index] ? "Remove" : "Add back"}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="rsvp-actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? "Saving" : done ? "Save changes" : "Send reply"}
                </button>
                {done ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setEditing(false);
                      setError("");
                      setComing(comingSeed(invited, done.names, true));
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <label>
                <span>Your name</span>
                <input type="text" name="guest-name" value="" readOnly placeholder="On your invitation" aria-readonly="true" />
              </label>
              <p className="rsvp-note">Open the personal note from your invitation. Your name will already be written here.</p>
            </>
          )}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
