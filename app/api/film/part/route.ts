import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { FILM_CHUNK_BYTES, FILM_MAX_BYTES } from "@/lib/film-limits";
import { uploadPart } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Could not add that film.", 403);
  const session = await readSession();
  if (!session) return fail("Sign in again.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Could not read that upload.");
  }

  const uploadId = String(form.get("uploadId") || "");
  const index = Number(form.get("index"));
  const total = Number(form.get("total"));
  const size = Number(form.get("size"));
  const file = form.get("file");
  if (!ID.test(uploadId)) return fail("Could not add that film.");
  if (!Number.isInteger(index) || !Number.isInteger(total) || !Number.isInteger(size)) return fail("Could not add that film.");
  if (size < 1 || size > FILM_MAX_BYTES) return fail("That film is too large to add.");
  const expectedTotal = Math.ceil(size / FILM_CHUNK_BYTES);
  if (total !== expectedTotal || index < 0 || index >= total) return fail("Could not add that film.");
  if (!(file instanceof File) || file.size < 1 || file.size > FILM_CHUNK_BYTES) return fail("Could not add that film.");
  const expected = index === total - 1 ? size - FILM_CHUNK_BYTES * (total - 1) : FILM_CHUNK_BYTES;
  if (file.size !== expected) return fail("Could not add that film.");

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await uploadPart(buf, `${uploadId}-${index}.mp4`);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("film part failed", error instanceof Error ? error.message : error);
    return fail("Could not add that film.");
  }
}
