import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { insertMedia } from "@/lib/db";
import { masterFilm, shrinkFilmFile } from "@/lib/film-encode";
import { FILM_CHUNK_BYTES, FILM_MAX_BYTES } from "@/lib/film-limits";
import { videoFormat } from "@/lib/images";
import { downloadRemote, readRemoteStart, safePart, uploadBlob } from "@/lib/live";

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

async function confirmRemote(url: string, size: number, magic: Buffer) {
  const res = await readRemoteStart(url);
  if (res.status !== 206 && (res.status < 200 || res.status >= 300)) throw new Error("Could not store that film");
  const length = Math.min(magic.length, res.head.length);
  if (length < 12 || !res.head.subarray(0, length).equals(magic.subarray(0, length))) {
    throw new Error("Could not store that film");
  }
  if (res.size !== size) throw new Error("Could not store that film");
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Could not add that film.", 403);
  const session = await readSession();
  if (!session) return fail("Sign in again.", 401);

  let caption = "";
  let size = 0;
  let urls: string[] = [];
  let keepOriginal = false;
  try {
    const body = (await req.json()) as { caption?: unknown; size?: unknown; urls?: unknown; keepOriginal?: unknown };
    caption = String(body.caption || "").trim().slice(0, 280);
    size = Number(body.size);
    urls = Array.isArray(body.urls) ? body.urls.map((url) => String(url)) : [];
    keepOriginal = body.keepOriginal === true;
  } catch {
    return fail("Could not add that film.");
  }
  if (!Number.isInteger(size) || size < 1 || size > FILM_MAX_BYTES) return fail("That film is too large to add.");
  const total = Math.ceil(size / FILM_CHUNK_BYTES);
  if (urls.length !== total || urls.some((url) => !safePart(url))) return fail("That film did not finish uploading.");

  const uploadId = crypto.randomUUID();
  const dir = path.join(os.tmpdir(), `yk-film-${uploadId}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await eachPart(urls.length, 6, async (index) => {
      await downloadRemote(urls[index], path.join(dir, String(index)));
      const stat = await fs.stat(path.join(dir, String(index)));
      const expected = index === total - 1 ? size - FILM_CHUNK_BYTES * (total - 1) : FILM_CHUNK_BYTES;
      if (stat.size !== expected) throw new Error("Could not store that film");
    });
    const dest = path.join(dir, "film");
    const out = createWriteStream(dest);
    for (let index = 0; index < urls.length; index++) {
      await pipeline(createReadStream(path.join(dir, String(index))), out, { end: false });
    }
    await new Promise<void>((resolve, reject) => {
      out.on("error", reject);
      out.end(() => resolve());
    });
    const assembled = await fs.readFile(dest);
    if (assembled.length !== size) return fail("That film did not finish uploading.");
    const video = videoFormat(assembled);
    if (!video) return fail("Choose an MP4, MOV, or WEBM film.");
    let buf = assembled;
    let width: number | null = null;
    let height: number | null = null;
    let ext = video.ext === "webm" ? "webm" : "mp4";
    let prepared: string | null = null;
    if (keepOriginal) {
      const master = await masterFilm(dest, video.ext);
      if (!master) return fail("Could not add that film.");
      if (master.file) {
        buf = await fs.readFile(master.file);
        prepared = master.file;
        ext = "mp4";
      }
      width = master.width || null;
      height = master.height || null;
    } else {
      const shrunk = await shrinkFilmFile(dest);
      if (shrunk) {
        buf = await fs.readFile(shrunk.file);
        prepared = shrunk.file;
        ext = "mp4";
        width = shrunk.width || null;
        height = shrunk.height || null;
      }
    }
    const mime = ext === "webm" ? "video/webm" : "video/mp4";
    const id = crypto.randomUUID();
    const remoteUrl = await uploadBlob(buf, `${id}.${ext}`);
    await confirmRemote(remoteUrl, buf.length, buf.subarray(0, 12));
    const item = await insertMedia({
      id,
      kind: "video",
      filename: `${id}.${ext}`,
      mime,
      caption,
      width,
      height,
      remoteUrl,
    });
    if (prepared) await fs.rm(prepared, { force: true });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("film finish failed", error instanceof Error ? error.message : error);
    return fail("Could not add that film.");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
