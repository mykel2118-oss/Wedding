import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { saveHome } from "@/lib/db";
import { audioFormat } from "@/lib/images";
import { MUSIC_CHUNK_BYTES, MUSIC_MAX_BYTES } from "@/lib/music-limits";
import { downloadRemote, safePart, uploadBlob } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function eachPart(count: number, limit: number, run: (index: number) => Promise<void>) {
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= count) return;
      await run(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, () => worker()));
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Could not add that music.", 403);
  const session = await readSession();
  if (!session) return fail("Sign in again.", 401);

  let size = 0;
  let urls: string[] = [];
  try {
    const body = (await req.json()) as { size?: unknown; urls?: unknown };
    size = Number(body.size);
    urls = Array.isArray(body.urls) ? body.urls.map((url) => String(url)) : [];
  } catch {
    return fail("Could not add that music.");
  }
  if (!Number.isInteger(size) || size < 1 || size > MUSIC_MAX_BYTES) return fail("That music file is too large to add.");
  const total = Math.ceil(size / MUSIC_CHUNK_BYTES);
  if (urls.length !== total || urls.some((url) => !safePart(url))) return fail("That music did not finish uploading.");

  const dir = path.join(os.tmpdir(), `yk-music-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await eachPart(urls.length, 4, async (index) => {
      await downloadRemote(urls[index], path.join(dir, String(index)));
    });
    const dest = path.join(dir, "audio");
    const out = createWriteStream(dest);
    for (let index = 0; index < urls.length; index++) {
      await pipeline(createReadStream(path.join(dir, String(index))), out, { end: false });
    }
    await new Promise<void>((resolve, reject) => {
      out.on("error", reject);
      out.end(() => resolve());
    });
    const buf = await fs.readFile(dest);
    if (buf.length !== size) return fail("That music did not finish uploading.");
    const audio = audioFormat(buf);
    if (!audio) return fail("Choose an MP3, M4A, WAV, or OGG file.");
    const remoteUrl = await uploadBlob(buf, `${crypto.randomUUID()}.${audio.ext}`);
    const home = await saveHome({ musicUrl: remoteUrl });
    if (home.musicUrl !== remoteUrl) return fail("Could not add that music.");
    return NextResponse.json({ home });
  } catch (error) {
    console.error("music finish failed", error instanceof Error ? error.message : error);
    return fail("Could not add that music.");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
