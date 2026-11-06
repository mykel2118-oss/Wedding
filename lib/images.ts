import { spawn } from "node:child_process";
import path from "node:path";

export function convertToJpeg(input: string, output: string): Promise<{ width: number; height: number }> {
  const script = path.join(process.cwd(), "scripts", "convert_image.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, input, output], { timeout: 60_000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || "Could not read that photograph"));
        return;
      }
      const [width, height] = out.trim().split(/\s+/).map(Number);
      if (!width || !height) {
        reject(new Error("Could not read that photograph"));
        return;
      }
      resolve({ width, height });
    });
  });
}

export function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function sniffPhoto(buf: Buffer): { ext: string; mime: string; width: number | null; height: number | null } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return { ext: "jpg", mime: "image/jpeg", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png", mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp", mime: "image/webp", width: null, height: null };
  }
  return null;
}

export function audioFormat(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") {
    return { ext: "wav", mime: "audio/wav" };
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS") {
    return { ext: "ogg", mime: "audio/ogg" };
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) return { ext: "m4a", mime: "audio/mp4" };
  }
  return null;
}

export function videoFormat(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("qt")) return { ext: "mov", mime: "video/quicktime" };
    return { ext: "mp4", mime: "video/mp4" };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: "webm", mime: "video/webm" };
  }
  return null;
}
