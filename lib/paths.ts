import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();

const bundledData = path.join(ROOT, "data");

function dataRoot(): string {
  if (process.env.VERCEL !== "1") return bundledData;
  const tmp = "/tmp/wedding-data";
  const ready = path.join(tmp, "wedding.sqlite");
  if (!fs.existsSync(ready)) {
    fs.mkdirSync(tmp, { recursive: true });
    fs.cpSync(bundledData, tmp, {
      recursive: true,
      filter: (src) => {
        const base = path.basename(src);
        return !base.endsWith("-wal") && !base.endsWith("-shm");
      },
    });
  }
  return tmp;
}

export const DATA_DIR = dataRoot();
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const DB_PATH = path.join(DATA_DIR, "wedding.sqlite");
export const SEED_PATH = path.join(DATA_DIR, "seed.json");

export function mediaFile(filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || base.includes("..") || !/^[\w.-]+$/.test(base)) {
    throw new Error("bad filename");
  }
  const full = path.resolve(MEDIA_DIR, base);
  const root = path.resolve(MEDIA_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("bad filename");
  }
  return full;
}
