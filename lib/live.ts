import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { storyBanner, storyFeatures } from "./features";
import type { HomeDetails, MediaKind } from "./types";

/** Shared record every live visit reads and writes. Not the temporary Vercel disk. */
const BIN = "adeeefb";
const BIN_URL = `https://extendsclass.com/api/json-storage/bin/${BIN}`;

/** The file host closes connections that do not look like a browser. */
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type LiveMedia = {
  id: string;
  kind: MediaKind;
  filename: string;
  mime: string;
  caption: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  remoteUrl: string | null;
  /** A still shown at once, while the moving picture arrives. A site path or a file-host address. */
  poster?: string | null;
};

export type LiveInvite = { id: string; name: string; createdAt: string; party?: string[] };
export type LiveRsvp = { inviteId: string; names: string[]; updatedAt: string };

/** Pieces of a film that is still being saved. Not shown on the site. */
export type LiveUpload = {
  id: string;
  caption: string;
  size: number;
  total: number;
  parts: string[];
  updatedAt: string;
};

export type LiveState = {
  revision: number;
  media: LiveMedia[];
  invites: LiveInvite[];
  rsvps: LiveRsvp[];
  uploads: LiveUpload[];
  /** Photographs kel removed. The original set must not put these back. */
  removed: string[];
  home: HomeDetails;
};

function asUpload(value: unknown): LiveUpload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LiveUpload>;
  if (typeof row.id !== "string" || !Array.isArray(row.parts)) return null;
  return {
    id: row.id,
    caption: typeof row.caption === "string" ? row.caption : "",
    size: typeof row.size === "number" ? row.size : 0,
    total: typeof row.total === "number" ? row.total : 0,
    parts: row.parts.filter((part): part is string => typeof part === "string"),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

export const DEFAULT_BACKGROUND_OPACITY = 62;
export const DEFAULT_PANEL_OPACITY = 68;

export function backgroundOpacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_BACKGROUND_OPACITY;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function panelOpacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_PANEL_OPACITY;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function emptyHome(): HomeDetails {
  return {
    address: "",
    dressCode: "",
    honored: [],
    musicUrl: null,
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    panelOpacity: DEFAULT_PANEL_OPACITY,
    banner: null,
    features: storyFeatures(undefined),
  };
}

function asHome(value: unknown): HomeDetails {
  const row = value && typeof value === "object" ? (value as Partial<HomeDetails>) : {};
  const honored = Array.isArray(row.honored)
    ? row.honored
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\s+/g, " ").trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 40)
    : [];
  return {
    address: typeof row.address === "string" ? row.address.replace(/\s+/g, " ").trim().slice(0, 240) : "",
    dressCode: typeof row.dressCode === "string" ? row.dressCode.replace(/\r\n/g, "\n").trim().slice(0, 800) : "",
    honored,
    musicUrl: safeRemote(typeof row.musicUrl === "string" ? row.musicUrl : null),
    backgroundOpacity: backgroundOpacity(row.backgroundOpacity),
    panelOpacity: panelOpacity(row.panelOpacity),
    banner: storyBanner(row.banner),
    features: storyFeatures(row.features),
  };
}

function asState(value: unknown): LiveState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LiveState>;
  if (!Array.isArray(row.media)) return null;
  return {
    revision: typeof row.revision === "number" ? row.revision : 0,
    media: row.media,
    invites: Array.isArray(row.invites) ? row.invites : [],
    rsvps: Array.isArray(row.rsvps) ? row.rsvps : [],
    uploads: Array.isArray(row.uploads) ? row.uploads.flatMap((item) => {
      const upload = asUpload(item);
      return upload ? [upload] : [];
    }) : [],
    removed: removedIds(row.removed),
    home: asHome(row.home),
  };
}

function removedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 400) break;
  }
  return out;
}

/**
 * Rows the home page may show.
 * Ids kel removed stay out. Callers must not copy a missing seed photograph back in.
 */
export function mediaKeepingDeletions(state: LiveState): LiveMedia[] {
  const gone = new Set(removedIds(state.removed));
  return state.media.filter((item) => item && typeof item.id === "string" && !gone.has(item.id));
}

const remembered = new Map<string, LiveMedia>();
let highWater = 0;

function noteState(state: LiveState) {
  if (state.revision < highWater) return;
  highWater = state.revision;
  const gone = new Set(removedIds(state.removed));
  const ids = new Set<string>();
  for (const item of state.media) {
    if (item && typeof item.id === "string" && !gone.has(item.id)) {
      remembered.set(item.id, item);
      ids.add(item.id);
    }
  }
  for (const id of remembered.keys()) {
    if (!ids.has(id) || gone.has(id)) remembered.delete(id);
  }
}

function requestText(url: string, method: string, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": BROWSER,
          ...(body
            ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function readLive(): Promise<LiveState> {
  let last = "";
  let best: LiveState | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await requestText(`${BIN_URL}?t=${Date.now()}-${attempt}-${Math.random()}`, "GET");
      last = res.text;
      if (res.status < 200 || res.status >= 300) continue;
      const state = asState(JSON.parse(last));
      if (!state) continue;
      if (!best || state.revision >= best.revision) best = state;
      if (state.revision >= highWater) {
        noteState(state);
        return state;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  if (best && highWater === 0) {
    noteState(best);
    return best;
  }
  throw new Error(last || "Could not read the shared record");
}

function sameRecord(a: LiveState, b: LiveState): boolean {
  return (
    JSON.stringify(a.media) === JSON.stringify(b.media) &&
    JSON.stringify(a.invites) === JSON.stringify(b.invites) &&
    JSON.stringify(a.rsvps) === JSON.stringify(b.rsvps) &&
    JSON.stringify(a.uploads) === JSON.stringify(b.uploads) &&
    JSON.stringify(removedIds(a.removed)) === JSON.stringify(removedIds(b.removed)) &&
    JSON.stringify(a.home) === JSON.stringify(b.home)
  );
}

export async function changeLive(edit: (state: LiveState) => void, options?: { forget?: string[] }): Promise<LiveState> {
  const forget = new Set(options?.forget ?? []);
  for (const id of forget) remembered.delete(id);
  let base = await readLive();
  for (let attempt = 0; attempt < 8; attempt++) {
    if (base.revision < highWater) {
      base = await readLive();
      continue;
    }
    const next = structuredClone(base);
    next.removed = removedIds([...(next.removed ?? []), ...forget]);
    const gone = new Set(next.removed);
    next.media = next.media.filter((item) => item && !gone.has(item.id));
    for (const row of remembered.values()) {
      if (!row || gone.has(row.id) || forget.has(row.id) || next.media.some((item) => item.id === row.id)) continue;
      next.media.push(structuredClone(row));
    }
    edit(next);
    next.removed = removedIds([...(next.removed ?? []), ...forget]);
    const goneAfter = new Set(next.removed);
    next.media = next.media.filter((item) => item && !goneAfter.has(item.id));
    if (sameRecord(next, base)) return base;
    next.revision = (base.revision || 0) + 1;
    const res = await requestText(BIN_URL, "PUT", JSON.stringify(next));
    if (res.status < 200 || res.status >= 300) throw new Error("Could not save the shared record");
    const seen = await readLive();
    if (seen.revision === next.revision && sameRecord(seen, next) && next.media.every((item) => seen.media.some((row) => row.id === item.id))) {
      noteState(seen);
      return seen;
    }
    base = seen.revision >= base.revision ? seen : await readLive();
  }
  throw new Error("Could not save the shared record");
}

function httpsUrl(url: string, hosts: string[], suffixes: string[] = []): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname;
    const allowed = hosts.includes(host) || suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (!allowed) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** A still that can be shown at once. A picture on this site, or the durable file host. */
export function posterSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/photos/") && !value.includes("..") && !value.includes("\\") && !value.includes("//")) return value;
  return safeRemote(value);
}

/** A film guests can watch. Only the durable file host. */
export function safeRemote(url: string | null | undefined): string | null {
  if (!url) return null;
  return httpsUrl(url, ["pomf.lain.la", "pomf2.lain.la"]);
}

/** A short-lived piece of a film, kept only until the whole film is stored. */
export function safePart(url: string | null | undefined): string | null {
  if (!url) return null;
  return httpsUrl(url, ["pomf.lain.la", "pomf2.lain.la"], ["uguu.se"]);
}

function httpsBuffer(url: string, method: string, body?: Buffer, headers?: Record<string, string>): Promise<{ status: number; text: string; raw: Buffer; headers: NodeJS.Dict<string | string[]> }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          "user-agent": BROWSER,
          ...(body ? { "content-length": String(body.length) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          resolve({ status: res.statusCode || 0, text: raw.toString("utf8"), raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function uploadBlob(buf: Buffer, filename: string): Promise<string> {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "") || "upload.bin";
  const boundary = `----yk${crypto.randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buf, tail]);
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await httpsBuffer("https://pomf.lain.la/upload.php", "POST", body, {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      });
      last = res.text;
      if (!res.text.trim().startsWith("{")) {
        last = `file host ${res.status} ${res.text.slice(0, 160).replace(/\s+/g, " ")}`;
      } else {
        const data = JSON.parse(res.text) as { success?: boolean; files?: Array<{ url?: string }> };
        const url = safeRemote(data?.files?.[0]?.url);
        if (res.status >= 200 && res.status < 300 && data?.success && url) return url;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : "Could not store that file";
    }
    await new Promise((resolve) => setTimeout(resolve, resWait(last, attempt)));
  }
  throw new Error(last || "Could not store that file");
}

export async function uploadPart(buf: Buffer, filename: string): Promise<string> {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "") || "part.mp4";
  const boundary = `----yk${crypto.randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buf, tail]);
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await httpsBuffer("https://uguu.se/upload", "POST", body, {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      });
      last = res.text;
      if (!res.text.trim().startsWith("{")) {
        last = `file host ${res.status} ${res.text.slice(0, 160).replace(/\s+/g, " ")}`;
      } else {
        const data = JSON.parse(res.text) as { success?: boolean; files?: Array<{ url?: string }> };
        const url = safePart(data?.files?.[0]?.url);
        if (res.status >= 200 && res.status < 300 && data?.success && url) return url;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : "Could not store that file";
    }
    await new Promise((resolve) => setTimeout(resolve, resWait(last, attempt)));
  }
  throw new Error(last || "Could not store that file");
}

function resWait(message: string, attempt: number): number {
  if (message.includes("429")) return 8000 * (attempt + 1);
  return 700 * (attempt + 1);
}

export function downloadRemote(url: string, dest: string): Promise<void> {
  const safe = safePart(url);
  if (!safe) return Promise.reject(new Error("Could not store that film"));
  return new Promise((resolve, reject) => {
    const req = https.get(safe, { headers: { "user-agent": BROWSER } }, (res) => {
      if ((res.statusCode || 0) >= 400) {
        res.resume();
        reject(new Error("Could not store that film"));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => resolve());
      file.on("error", reject);
    });
    req.on("error", reject);
  });
}

export async function readRemoteStart(url: string): Promise<{ status: number; size: number; head: Buffer }> {
  const safe = safeRemote(url);
  if (!safe) throw new Error("Could not store that film");
  const res = await httpsBuffer(safe, "GET", undefined, { range: "bytes=0-31" });
  const range = String(res.headers["content-range"] || "");
  const match = /\/(\d+)\s*$/.exec(range);
  const size = match ? Number(match[1]) : Number(res.headers["content-length"] || 0);
  return { status: res.status, size, head: res.raw.subarray(0, 32) };
}

export function remoteHeaders(range?: string | null): Headers {
  const headers = new Headers({ "user-agent": BROWSER });
  if (range) headers.set("range", range);
  return headers;
}

