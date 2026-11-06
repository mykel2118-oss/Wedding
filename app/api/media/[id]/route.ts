import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { deleteMedia, updateMedia } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]+$/;

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not save that." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: { caption?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not save that." }, { status: 400 });
  }
  const patch: { caption?: string; sortOrder?: number } = {};
  if (typeof body.caption === "string") patch.caption = body.caption.trim().slice(0, 280);
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) patch.sortOrder = Math.round(body.sortOrder);
  const item = await updateMedia(id, patch);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not remove that." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ok = await deleteMedia(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
