import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { reorderMedia } from "@/lib/db";
import type { MediaKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not reorder." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let body: { kind?: MediaKind; orderedIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not reorder." }, { status: 400 });
  }
  if ((body.kind !== "photo" && body.kind !== "video") || !Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: "Could not reorder." }, { status: 400 });
  }
  if (body.orderedIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id))) {
    return NextResponse.json({ error: "Could not reorder." }, { status: 400 });
  }
  try {
    const items = await reorderMedia(body.kind, body.orderedIds);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Could not reorder." }, { status: 400 });
  }
}
