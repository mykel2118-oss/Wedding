import type { Metadata } from "next";
import Link from "next/link";
import { SeatViewer } from "@/components/seat-viewer";
import { readSession } from "@/lib/auth";
import { readGuest } from "@/lib/guest-token";
import { readLive } from "@/lib/live";
import { MARK } from "@/lib/mark";
import { emptySeating, seatsFor } from "@/lib/seating";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Seating · ${MARK}`,
  description: "Where you will sit at Ying & kel.",
};

export default async function SeatsPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams;
  const token = typeof params.guest === "string" ? params.guest : "";
  const parsed = token ? readGuest(token) : null;
  const session = await readSession();
  let plan = emptySeating();
  try {
    plan = (await readLive()).seating;
  } catch {
    plan = emptySeating();
  }
  const mine = parsed ? seatsFor(plan, parsed.id) : [];
  const marks = mine.map((row) => ({ pieceId: row.piece.id, name: row.name }));

  return (
    <main className="seat-page">
      <p className="eyebrow">Seating</p>
      <h1>Where you will sit</h1>
      {mine.length ? (
        <ul className="seat-lines">
          {mine.map((row) => (
            <li key={`${row.piece.id}-${row.name}`}>
              <strong>{row.name}</strong>
              <span>{row.place}</span>
            </li>
          ))}
        </ul>
      ) : parsed ? (
        <p className="seat-card-note">Your seat will appear here once it is chosen.</p>
      ) : (
        <p className="seat-card-note">Open the link from your invitation to see your table and chair.</p>
      )}
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
