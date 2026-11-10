import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { deleteGuestPhoto } from "@/lib/guest-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{8,80}$/;

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not remove that." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ok = await deleteGuestPhoto(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
