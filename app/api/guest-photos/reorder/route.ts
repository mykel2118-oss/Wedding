import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { reorderGuestPhotos } from "@/lib/guest-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{8,80}$/;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not arrange those." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let body: { orderedIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not arrange those." }, { status: 400 });
  }
  if (!Array.isArray(body.orderedIds) || body.orderedIds.some((id) => typeof id !== "string" || !ID.test(id))) {
    return NextResponse.json({ error: "Could not arrange those." }, { status: 400 });
  }
  const photos = await reorderGuestPhotos(body.orderedIds);
  if (!photos) return NextResponse.json({ error: "Could not arrange those." }, { status: 400 });
  return NextResponse.json({ photos });
}
