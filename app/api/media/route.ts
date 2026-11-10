import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { insertMedia, listMedia } from "@/lib/db";
import { shrinkFilmFile } from "@/lib/film-encode";
import { convertToJpeg, sniffPhoto, videoFormat } from "@/lib/images";
import { uploadBlob } from "@/lib/live";
import { MEDIA_DIR, mediaFile } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOTO_LIMIT = 40 * 1024 * 1024;
const VIDEO_LIMIT = 120 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ items: await listMedia() });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not add that file." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that upload." }, { status: 400 });
  }
  const file = form.get("file");
  const caption = String(form.get("caption") || "").trim().slice(0, 280);
  const expect = String(form.get("expect") || "");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a photograph or a film." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const buf = Buffer.from(await file.arrayBuffer());
  const video = videoFormat(buf);
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  if (expect === "video" && !video) {
    return NextResponse.json({ error: "Choose an MP4, MOV, or WEBM film." }, { status: 400 });
  }
  if (expect === "photo" && video) {
    return NextResponse.json({ error: "Choose a JPEG, PNG, WEBP, or HEIC photograph." }, { status: 400 });
  }

  try {
    if (video) {
      if (buf.length > VIDEO_LIMIT) {
        return NextResponse.json({ error: "Films need to be under 120 MB." }, { status: 400 });
      }
      const originalName = `${id}.${video.ext}`;
      const originalPath = mediaFile(originalName);
      await fs.writeFile(originalPath, buf);
      const shrunk = await shrinkFilmFile(originalPath);
      const stored = shrunk ? await fs.readFile(shrunk.file) : buf;
      const ext = shrunk ? "mp4" : video.ext;
      const filename = `${id}.${ext}`;
      if (shrunk && filename !== originalName) await fs.writeFile(mediaFile(filename), stored);
      const remoteUrl = await uploadBlob(stored, filename);
      const item = await insertMedia({
        id,
        kind: "video",
        filename,
        mime: ext === "webm" ? "video/webm" : "video/mp4",
        caption,
        width: shrunk?.width || null,
        height: shrunk?.height || null,
        remoteUrl,
      });
      if (shrunk) {
        await fs.rm(shrunk.file, { force: true });
        if (filename !== originalName) await fs.rm(originalPath, { force: true });
      }
      return NextResponse.json({ item });
    }

    if (buf.length > PHOTO_LIMIT) {
      return NextResponse.json({ error: "Photographs need to be under 40 MB." }, { status: 400 });
    }

    const photo = sniffPhoto(buf);
    if (photo) {
      const filename = `${id}.${photo.ext}`;
      const remoteUrl = await uploadBlob(buf, filename);
      await fs.writeFile(mediaFile(filename), buf);
      const item = await insertMedia({
        id,
        kind: "photo",
        filename,
        mime: photo.mime,
        caption,
        width: photo.width,
        height: photo.height,
        remoteUrl,
      });
      return NextResponse.json({ item });
    }

    const tmp = path.join(os.tmpdir(), `yk-${id}`);
    const filename = `${id}.jpg`;
    try {
      await fs.writeFile(tmp, buf);
      const size = await convertToJpeg(tmp, mediaFile(filename));
      const saved = await fs.readFile(mediaFile(filename));
      const remoteUrl = await uploadBlob(saved, filename);
      const item = await insertMedia({
        id,
        kind: "photo",
        filename,
        mime: "image/jpeg",
        caption,
        width: size.width,
        height: size.height,
        remoteUrl,
      });
      return NextResponse.json({ item });
    } finally {
      await fs.rm(tmp, { force: true });
    }
  } catch (error) {
    console.error("media upload failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "That file could not be saved. Use a JPEG, PNG, WEBP, or HEIC photograph, or an MP4, MOV, or WEBM film." },
      { status: 400 },
    );
  }
}
