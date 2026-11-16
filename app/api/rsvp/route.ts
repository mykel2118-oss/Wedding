import { NextResponse } from "next/server";
import { rateLimit, sameOrigin } from "@/lib/auth";
import { ensureInvite, saveRsvp } from "@/lib/db";
import { readGuest } from "@/lib/guest-token";
import { cleanName } from "@/lib/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not save that reply." }, { status: 403 });

  let body: { token?: unknown; names?: unknown };
  try {
    body = (await req.json()) as { token?: unknown; names?: unknown };
  } catch {
    return NextResponse.json({ error: "Could not read that reply." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const guest = readGuest(token);
  if (!guest) return NextResponse.json({ error: "That invitation could not be found." }, { status: 404 });
  if (!rateLimit(`rsvp:${guest.id}`, 30)) {
    return NextResponse.json({ error: "Too many replies just now. Wait a little, then try again." }, { status: 429 });
  }
  const party = guest.party;
  if (!Array.isArray(body.names) || body.names.length < 1 || body.names.length > party.length) {
    return NextResponse.json({ error: "This invitation is only for the people named on it." }, { status: 400 });
  }

  const used = party.map(() => false);
  const names: string[] = [];
  for (const item of body.names) {
    const name = cleanName(item);
    const index = name ? party.findIndex((person, at) => !used[at] && person.trim().toLowerCase() === name.toLowerCase()) : -1;
    if (index < 0) {
      return NextResponse.json({ error: "This invitation is only for the people named on it." }, { status: 400 });
    }
    used[index] = true;
    names.push(party[index]);
  }

  await ensureInvite(guest.id, guest.name);
  const saved = await saveRsvp(guest.id, names);
  if (!saved) return NextResponse.json({ error: "That invitation could not be found." }, { status: 404 });
  return NextResponse.json(saved);
}
