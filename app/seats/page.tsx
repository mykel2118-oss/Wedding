import type { Metadata } from "next";
import Link from "next/link";
import { SeatNameForm } from "@/components/seat-name-form";
import { SeatViewer } from "@/components/seat-viewer";
import { rateLimit, readSession } from "@/lib/auth";
import { ensureInvite, listInvites } from "@/lib/db";
import { readGuest } from "@/lib/guest-token";
import { readLive } from "@/lib/live";
import { MARK } from "@/lib/mark";
import { emptySeating, groupsForName, seatGroups, seatsFor } from "@/lib/seating";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Seating · ${MARK}`,
  description: "Where you will sit at Ying & kel.",
};

export default async function SeatsPage({ searchParams }: { searchParams: Promise<{ guest?: string; name?: string }> }) {
  const params = await searchParams;
  const token = typeof params.guest === "string" ? params.guest : "";
  const parsed = token ? readGuest(token) : null;
  const query = typeof params.name === "string" ? params.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const session = await readSession();
  if (parsed) {
    try {
      await ensureInvite(parsed.id, parsed.name, parsed.party);
    } catch {
      /* the map can still open */
    }
  }
  let plan = emptySeating();
  try {
    plan = (await readLive()).seating;
  } catch {
    plan = emptySeating();
  }

  let mine: ReturnType<typeof seatsFor> = [];
  let lookup: "none" | "found" | "missing" | "many" | "wait" = "none";
  if (query) {
    if (!rateLimit("seat-name", 120, 60_000)) {
      lookup = "wait";
    } else {
      let invites: Awaited<ReturnType<typeof listInvites>> = [];
      try {
        invites = await listInvites();
      } catch {
        invites = [];
      }
      const matches = groupsForName(seatGroups(invites), query);
      if (matches.length === 1) {
        lookup = "found";
        mine = seatsFor(plan, matches[0].inviteId);
      } else {
        lookup = matches.length > 1 ? "many" : "missing";
      }
    }
  } else if (parsed) {
    mine = seatsFor(plan, parsed.id);
  }
  const marks = mine.map((row) => ({ pieceId: row.piece.id, name: row.name }));

  return (
    <main className="seat-page">
      <p className="eyebrow">Seating</p>
      <h1>Where you will sit</h1>
      {lookup === "wait" ? (
        <p className="seat-card-note">Wait a moment, then try that name again.</p>
      ) : lookup === "many" ? (
        <p className="seat-card-note">More than one family uses that name. Type one person’s full name.</p>
      ) : lookup === "missing" ? (
        <p className="seat-card-note">We couldn’t find that name. Type one full name from your family.</p>
      ) : mine.length ? (
        <ul className="seat-lines">
          {mine.map((row) => (
            <li key={`${row.piece.id}-${row.name}`}>
              <strong>{row.name}</strong>
              <span>{row.place}</span>
            </li>
          ))}
        </ul>
      ) : lookup === "found" ? (
        <p className="seat-card-note">We have your name. Your table and chair will be here on the day of the wedding.</p>
      ) : (
        <p className="seat-card-note">Open this on the day of the wedding. Your table and chair will be here then.</p>
      )}
      <SeatNameForm preset={query} />
      {plan.pieces.length ? (
        <SeatViewer pieces={plan.pieces} marks={marks} />
      ) : (
        <p className="empty-line">The seating map is not drawn yet.</p>
      )}
      <p className="seat-back-link">
        <Link href={parsed ? `/?guest=${encodeURIComponent(token)}` : "/"}>Back to the invitation</Link>
      </p>
      {session ? (
        <p className="seat-back-link">
          <Link href="/library#seating">Edit the map</Link>
        </p>
      ) : null}
    </main>
  );
}
