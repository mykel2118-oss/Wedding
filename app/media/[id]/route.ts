import fs from "node:fs";
import { Readable } from "node:stream";
import { getMedia } from "@/lib/db";
import { remoteHeaders } from "@/lib/live";
import { mediaFile } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]+$/;

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!ID.test(id)) return new Response("Not found", { status: 404 });
  const item = await getMedia(id);
  if (!item) return new Response("Not found", { status: 404 });
  if (item.kind === "video" && item.remoteUrl) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: item.remoteUrl,
        "Cache-Control": "no-store",
      },
    });
  }
  if (item.remoteUrl) {
    const upstream = await fetch(item.remoteUrl, {
      headers: remoteHeaders(req.headers.get("range")),
      cache: "no-store",
    });
    if (!upstream.ok && upstream.status !== 206) return new Response("Not found", { status: 404 });
    const out = new Headers({
      "Content-Type": item.mime,
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
    });
    const length = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (length) out.set("Content-Length", length);
    if (contentRange) out.set("Content-Range", contentRange);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  const full = mediaFile(item.filename);
  const stat = fs.statSync(full);
  const range = req.headers.get("range");
  const common = {
    "Content-Type": item.mime,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=86400",
  };

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) return new Response("Bad range", { status: 416 });
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (start > end || start >= stat.size) {
      return new Response("Bad range", {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const stream = fs.createReadStream(full, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = fs.createReadStream(full);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      ...common,
      "Content-Length": String(stat.size),
    },
  });
}
