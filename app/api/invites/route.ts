import { NextResponse } from "next/server";
import { rateLimit, readSession, sameOrigin } from "@/lib/auth";
import { attendance, createInvite, listInvites } from "@/lib/db";
import { signGuest } from "@/lib/guest-token";
import { cleanName } from "@/lib/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function board() {
  const people = await attendance();
  return {
    invites: (await listInvites()).map((invite) => ({ ...invite, token: signGuest(invite.id, invite.name, invite.party) })),
    total: people.total,
    names: people.names,
  };
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  return NextResponse.json(await board());
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not make that invitation." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!rateLimit(`invite:${session.username}`, 40)) {
    return NextResponse.json({ error: "Too many invitations just now. Wait a little, then try again." }, { status: 429 });
  }

  let body: { name?: unknown; names?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; names?: unknown };
  } catch {
    return NextResponse.json({ error: "Enter a guest name." }, { status: 400 });
  }
  const raw = Array.isArray(body.names) ? body.names : [body.name];
  const party = raw.map((item) => cleanName(item)).filter((item): item is string => Boolean(item)).slice(0, 2);
  if (!party.length || party.length !== raw.filter((item) => typeof item === "string" && item.trim()).length) {
    return NextResponse.json({ error: "Enter a guest name." }, { status: 400 });
  }
  if (raw.filter((item) => typeof item === "string").length > 2) {
    return NextResponse.json({ error: "An invitation can have two names." }, { status: 400 });
  }

  const invite = await createInvite(party);
  return NextResponse.json({ invite: { ...invite, token: signGuest(invite.id, invite.name, invite.party) }, ...(await board()) });
}
