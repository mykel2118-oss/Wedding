import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, MEDIA_DIR } from "./paths";

/**
 * Films and the guest database are copied here on this machine so the next
 * publish can ship them. Anonymous Vercel has no writable disk that survives
 * a new deployment, and it cannot see this folder.
 */
const STORE = process.env.WEDDING_STORE || "/cursor/stores/self/media/wedding-data";

function storeReady(): boolean {
  if (process.env.VERCEL === "1") return false;
  try {
    fs.mkdirSync(path.join(STORE, "media"), { recursive: true });
    fs.accessSync(STORE, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function safeName(name: string): boolean {
  return name === path.basename(name) && !name.endsWith("-wal") && !name.endsWith("-shm") && /^[\w.-]+$/.test(name);
}

/** The scroll background lives in public/atmosphere. It is not a film. */
function atmosphereFile(name: string): boolean {
  return name.startsWith("kling_20261105");
}

function passwordHash(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const tmp = path.join(os.tmpdir(), `yk-hash-${process.pid}.sqlite`);
  try {
    fs.copyFileSync(file, tmp);
    const db = new DatabaseSync(tmp, { readOnly: true });
    const row = db.prepare("SELECT password_hash AS hash FROM users WHERE username = 'kel'").get() as
      | { hash: string }
      | undefined;
    db.close();
    return row?.hash ?? null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Pull films and the database from the store when this working copy is behind it. */
export function restoreDurable(): void {
  if (!storeReady()) return;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const mediaStore = path.join(STORE, "media");
  if (fs.existsSync(mediaStore)) {
    for (const name of fs.readdirSync(mediaStore)) {
      if (!safeName(name) || atmosphereFile(name)) continue;
      const from = path.join(mediaStore, name);
      const to = path.join(MEDIA_DIR, name);
      if (!fs.statSync(from).isFile() || fs.existsSync(to)) continue;
      fs.copyFileSync(from, to);
    }
  }

  const stored = path.join(STORE, "wedding.sqlite");
  if (!fs.existsSync(stored)) return;
  if (!fs.existsSync(DB_PATH)) {
    fs.copyFileSync(stored, DB_PATH);
    return;
  }
  const storedHash = passwordHash(stored);
  const localHash = passwordHash(DB_PATH);
  const storedNewer = fs.statSync(stored).mtimeMs > fs.statSync(DB_PATH).mtimeMs + 1000;
  if (storedNewer && storedHash && storedHash === localHash) {
    fs.copyFileSync(stored, DB_PATH);
  }
}

/** Copy the database and media files into the store. The caller checkpoints first. */
export function mirrorDurable(): void {
  if (!storeReady()) return;
  if (!fs.existsSync(DB_PATH)) return;
  fs.copyFileSync(DB_PATH, path.join(STORE, "wedding.sqlite"));
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const mediaStore = path.join(STORE, "media");
  fs.mkdirSync(mediaStore, { recursive: true });
  const names = new Set<string>();
  for (const name of fs.readdirSync(MEDIA_DIR)) {
    if (!safeName(name) || atmosphereFile(name)) continue;
    const from = path.join(MEDIA_DIR, name);
    if (!fs.statSync(from).isFile()) continue;
    names.add(name);
    const to = path.join(mediaStore, name);
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
    fs.copyFileSync(from, to);
  }
  for (const name of fs.readdirSync(mediaStore)) {
    if (atmosphereFile(name)) continue;
    if (!names.has(name)) fs.rmSync(path.join(mediaStore, name), { force: true });
  }
}

export function durableDir(): string {
  return STORE;
}
