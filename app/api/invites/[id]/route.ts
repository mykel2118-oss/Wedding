import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { attendance, deleteInvite, listInvites } from "@/lib/db";
import { signGuest } from "@/lib/guest-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not remove that invitation." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  const removed = await deleteInvite(id);
  if (!removed) return NextResponse.json({ error: "That invitation is already gone." }, { status: 404 });
  const people = await attendance();
  return NextResponse.json({
    ok: true,
    invites: (await listInvites()).map((invite) => ({ ...invite, token: signGuest(invite.id, invite.name, invite.party) })),
    total: people.total,
    names: people.names,
  });
}
