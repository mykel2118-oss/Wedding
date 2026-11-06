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
