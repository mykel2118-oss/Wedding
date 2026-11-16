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

function replyNames(invited: string[], savedNames: string[] | null) {
  const saved = savedNames?.length ? savedNames.slice(0, invited.length) : [];
  if (!saved.length) return invited.slice();
  const seed = saved.slice();
  while (seed.length < invited.length) seed.push(invited[seed.length] ?? "");
  return seed;
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
  const saved = replied ? (savedNames ?? []).slice(0, invited.length) : [];
  const seed = replyNames(invited, replied ? saved : null);
  const [people, setPeople] = useState<string[]>(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<{ names: string[]; headcount: number } | null>(
    saved.length ? { names: saved, headcount: saved.length } : null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !name) return;
    const names = people.map((item) => item.trim());
    if (!names.length || names.some((item) => !item)) {
      setError("Each person needs their own name.");
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
      setPeople(data.names);
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
              <p className="rsvp-note">This reply is only for the people named on your invitation.</p>
              {people.map((person, index) => (
                <label key={index}>
                  <span>{people.length === 1 ? "Your name" : index === 0 ? "Name" : "Second name"}</span>
                  <input
                    type="text"
                    name={index === 0 ? "guest-name" : "guest-name-2"}
                    value={person}
                    maxLength={60}
                    required
                    onChange={(event) => {
                      const next = people.slice();
                      next[index] = event.target.value;
                      setPeople(next);
                    }}
                  />
                </label>
              ))}
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
                      setPeople(done.names);
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
