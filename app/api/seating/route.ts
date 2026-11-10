import { NextResponse } from "next/server";
import { rateLimit, readSession, sameOrigin } from "@/lib/auth";
import { listInvites } from "@/lib/db";
import { changeLive, readLive } from "@/lib/live";
import { asSeating, peopleReadyToSeat } from "@/lib/seating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to edit the seating." }, { status: 401 });
  const seating = (await readLive()).seating;
  return NextResponse.json({ seating });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not save the seating." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in to edit the seating." }, { status: 401 });
  if (!rateLimit(`seating:${session.username}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many saves. Wait a few minutes." }, { status: 429 });
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read the seating." }, { status: 400 });
  }
  if (raw.length > 200_000) return NextResponse.json({ error: "That map is too large." }, { status: 400 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Could not read the seating." }, { status: 400 });
  }

  try {
    const people = peopleReadyToSeat(await listInvites(), (await readLive()).seating);
    const seating = asSeating(body, people);
    await changeLive((state) => {
      state.seating = seating;
    });
    return NextResponse.json({ seating });
  } catch {
    return NextResponse.json({ error: "Could not save the seating." }, { status: 500 });
  }
}
