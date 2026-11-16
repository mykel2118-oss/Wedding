"use client";

import { useState } from "react";

function partyCount(text: string): number | null {
  if (!/^[1-9]\d*$/.test(text)) return null;
  const count = Number(text);
  if (!Number.isInteger(count) || count < 1) return null;
  return count;
}

function listNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
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
  const starting = Math.max((replied ? savedNames : partyNames)?.length ?? 1, 1);
  const [quantityText, setQuantityText] = useState(String(starting));
  const [people, setPeople] = useState<string[]>(() => {
    const seed = ((replied ? savedNames : partyNames) || [name ?? ""]).slice();
    while (seed.length < starting) seed.push("");
    if (!seed[0] && name) seed[0] = name;
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<{ names: string[]; headcount: number } | null>(
    replied && savedNames ? { names: savedNames, headcount: savedNames.length } : null,
  );
  const quantity = partyCount(quantityText);

  function onQuantity(raw: string) {
    const next = raw.replace(/[^\d]/g, "");
    setQuantityText(next);
    setError("");
    const count = partyCount(next);
    if (count === null) return;
    setPeople((current) => {
      const copy = current.slice(0, count);
      while (copy.length < count) copy.push("");
      if (name && !copy[0]) copy[0] = name;
      return copy;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !name) return;
    if (quantity === null) {
      setError("Enter how many people are coming.");
      return;
    }
    const names = people.slice(0, quantity).map((item) => item.trim());
    if (names.length !== quantity || names.some((item) => !item)) {
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
      setQuantityText(String(data.headcount));
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
              <label className="quantity-field">
                <span>How many people, including you?</span>
                <input
                  type="text"
                  name="quantity"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={quantityText}
                  onChange={(event) => onQuantity(event.target.value)}
                  required
                />
              </label>
              {quantity !== null
                ? people.slice(0, quantity).map((person, index) => (
                <label key={index}>
                  <span>{index === 0 ? "Your name" : `Person ${index + 1}`}</span>
                  <input
                    type="text"
                    name={index === 0 ? "guest-name" : `guest-name-${index + 1}`}
                    value={person}
                    maxLength={60}
                    required
                    placeholder="Their name"
                    onChange={(event) => {
                      const next = people.slice();
                      next[index] = event.target.value;
                      setPeople(next);
                    }}
                  />
                </label>
              ))
                : null}
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
                      setQuantityText(String(done.headcount));
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
