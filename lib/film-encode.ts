import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

/** A film above this size is redrawn smaller before it is saved. */
const BIG = 400 * 1024;
const LONG_EDGE = 640;

function ffmpegBin(): string {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  return "ffmpeg";
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, log: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, log: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

type Probe = { codec: string; pix: string; width: number; height: number };

function readProbeLine(line: string): Probe | null {
  const codec = /Video:\s*([a-z0-9]+)/i.exec(line)?.[1]?.toLowerCase();
  const size = /(\d{2,5})x(\d{2,5})/.exec(line);
  const pix = /,\s*((?:yuv|yuva|nv12|p010)[a-z0-9]*)/i.exec(line)?.[1]?.toLowerCase() || "";
  if (!codec || !size) return null;
  return { codec, pix, width: Number(size[1]), height: Number(size[2]) };
}

function readProbe(log: string): Probe | null {
  const line = log.split(/\r?\n/).find((row) => row.includes("Video:"));
  return line ? readProbeLine(line) : null;
}

function readOutputSize(log: string, fallback: Probe | null): { width: number; height: number } {
  const lines = log.split(/\r?\n/).filter((row) => row.includes("Video:"));
  const last = lines.length ? readProbeLine(lines[lines.length - 1]) : null;
  return { width: last?.width || fallback?.width || 0, height: last?.height || fallback?.height || 0 };
}

async function probeFilm(input: string): Promise<Probe | null> {
  const { log } = await run(ffmpegBin(), ["-hide_banner", "-i", input], 20_000);
  return readProbe(log);
}

function playsAsUploaded(ext: string, probe: Probe): boolean {
  const plain = probe.pix === "yuv420p" || probe.pix === "yuvj420p";
  if (!plain) return false;
  if (ext === "webm") return probe.codec === "vp8" || probe.codec === "vp9";
  if (ext === "mp4") return probe.codec === "h264";
  return false;
}

function plainH264(probe: Probe): boolean {
  return probe.codec === "h264" && (probe.pix === "yuv420p" || probe.pix === "yuvj420p");
}

/**
 * Turn a GIF into a video the banner can start immediately.
 * The picture stays the same size. The file is packed so a phone can play
 * the first moment before the rest has arrived.
 */
export async function gifPlayable(input: string): Promise<{ file: string; width: number; height: number } | null> {
  const probe = await probeFilm(input);
  const output = path.join(os.tmpdir(), `yk-gif-${path.basename(input)}-${Date.now()}.mp4`);
  const { code, log } = await run(
    ffmpegBin(),
    [
      "-y",
      "-i",
      input,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-tune",
      "animation",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
      "-movflags",
      "+faststart",
      output,
    ],
    50_000,
  );
  if (code !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1000) {
    fs.rmSync(output, { force: true });
    return null;
  }
  const size = readOutputSize(log, probe);
  return { file: output, width: size.width || probe?.width || 0, height: size.height || probe?.height || 0 };
}

/**
 * Keep a banner film at the resolution of the file that was uploaded.
 * A browser-ready file is returned unchanged. A phone movie that already
 * uses a normal picture is repacked without changing the picture. Anything
 * else is redrawn at that same size, sharp enough to match the original.
 * Returns null when the file could not be prepared.
 */
export async function masterFilm(input: string, ext: string): Promise<{ file: string | null; width: number; height: number } | null> {
  const probe = await probeFilm(input);
  if (probe && playsAsUploaded(ext, probe)) return { file: null, width: probe.width, height: probe.height };

  const output = path.join(os.tmpdir(), `yk-master-${path.basename(input)}-${Date.now()}.mp4`);
  if (probe && plainH264(probe)) {
    const copied = await run(
      ffmpegBin(),
      ["-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", output],
      20_000,
    );
    if (copied.code === 0 && fs.existsSync(output) && fs.statSync(output).size > 1000) {
      return { file: output, width: probe.width, height: probe.height };
    }
    fs.rmSync(output, { force: true });
  }

  const drawn = await run(
    ffmpegBin(),
    [
      "-y",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      output,
    ],
    45_000,
  );
  if (drawn.code !== 0 || !fs.existsSync(output) || fs.statSync(output).size < 1000) {
    fs.rmSync(output, { force: true });
    return null;
  }
  const size = readOutputSize(drawn.log, probe);
  return { file: output, width: size.width, height: size.height };
}

/**
 * Redraw a large film at a web size: the long edge stays at most 640,
 * three can play at once on a phone, and the file starts playing before
 * it has all arrived.
 * Returns null when the original is already small enough, or the redraw failed.
 */
export async function shrinkFilmFile(input: string): Promise<{ file: string; width: number; height: number } | null> {
  let size = 0;
  try {
    size = fs.statSync(input).size;
  } catch {
    return null;
  }
  if (size < BIG) return null;
  const output = path.join(os.tmpdir(), `yk-web-${path.basename(input)}-${Date.now()}.mp4`);
  const vf = `scale=w='if(gt(iw,ih),min(${LONG_EDGE},iw),-2)':h='if(gt(iw,ih),-2,min(${LONG_EDGE},ih))':force_divisible_by=2`;
  const { code, log } = await run(
    ffmpegBin(),
    [
      "-y",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "32",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      vf,
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "48k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      output,
    ],
    50_000,
  );
  if (code !== 0 || !fs.existsSync(output)) {
    fs.rmSync(output, { force: true });
    return null;
  }
  const next = fs.statSync(output).size;
  if (next < 1000 || next >= size) {
    fs.rmSync(output, { force: true });
    return null;
  }
  const matches = [...log.matchAll(/Video:.*?(\d{2,5})x(\d{2,5})/g)];
  const last = matches[matches.length - 1];
  return {
    file: output,
    width: last ? Number(last[1]) : 0,
    height: last ? Number(last[2]) : 0,
  };
}
