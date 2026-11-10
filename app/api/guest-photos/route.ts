import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit, sameOrigin } from "@/lib/auth";
import { addGuestPhoto, listGuestPhotos } from "@/lib/guest-photos";
import { sniffPhoto } from "@/lib/images";
import { guestName } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOTO_LIMIT = 4 * 1024 * 1024;

function clientAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || req.headers.get("x-real-ip") || "guest").slice(0, 80);
}

export async function GET() {
  return NextResponse.json({ photos: await listGuestPhotos() });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not add that photograph." }, { status: 403 });
  if (!rateLimit(`guest-photo:${clientAddress(req)}`, 80, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many photographs from this connection. Wait a few minutes." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that photograph." }, { status: 400 });
  }

  const name = guestName(form.get("name"));
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > PHOTO_LIMIT) {
    return NextResponse.json({ error: "That photograph needs to be a smaller JPEG." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffPhoto(buf);
  if (!sniffed || sniffed.mime !== "image/jpeg") {
    return NextResponse.json({ error: "Use a JPEG photograph." }, { status: 400 });
  }

  try {
    const photo = await addGuestPhoto({
      id: crypto.randomUUID(),
      name,
      buf,
      width: sniffed.width,
      height: sniffed.height,
    });
    if (!photo) return NextResponse.json({ error: "The album is full." }, { status: 400 });
    return NextResponse.json({ photo });
  } catch {
    return NextResponse.json({ error: "Could not add that photograph." }, { status: 500 });
  }
}
