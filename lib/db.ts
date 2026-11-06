import crypto from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { mirrorDurable, restoreDurable } from "./durable";
import { changeLive, mediaKeepingDeletions, readLive, safeRemote, type LiveMedia, type LiveState } from "./live";
import { cleanLabel, cleanName, invitationLines } from "./names";
import { DB_PATH, DATA_DIR, MEDIA_DIR, SEED_PATH } from "./paths";
import { storyBanner, storyFeatures } from "./features";
import type { HomeDetails, InviteRecord, MediaItem, MediaKind } from "./types";

/**
 * Initial password hash for username `kel`.
 * bcrypt (cost 12). The password itself is not stored.
 * Replaced at build time if this placeholder is still present.
 */
export const INITIAL_PASSWORD_HASH = "$2a$12$hemS/SWIamBwRobXahCcQuKSeKbJ8YlRhJRoVb1ahWyw75wvjNV1m";

const globalForDb = globalThis as unknown as { weddingDb?: DatabaseSync };

function remember(): void {
  try {
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
    mirrorDurable();
  } catch {
    /* the write is already in the local database; the store copy retries next time */
  }
}

function openDb(): DatabaseSync {
  restoreDurable();
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rsvps (
      invite_id TEXT PRIMARY KEY,
      plus_names TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
  `);
  try {
    db.exec("ALTER TABLE media ADD COLUMN remote_url TEXT");
  } catch {
    /* the column is already there */
  }
  seed(db);
  return db;
}

function seed(db: DatabaseSync): void {
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (users.n === 0) {
    if (!INITIAL_PASSWORD_HASH.startsWith("$2")) {
      throw new Error("Password hash is not configured");
    }
    db.prepare(
      "INSERT INTO users (username, password_hash, updated_at) VALUES (?, ?, ?)",
    ).run("kel", INITIAL_PASSWORD_HASH, new Date().toISOString());
  }
  const media = db.prepare("SELECT COUNT(*) AS n FROM media").get() as { n: number };
  // An empty local database can be filled from the original files.
  // That does not publish them. The shared catalog is the list on the home page,
  // and a photograph kel deleted is not copied back from this set.
  if (media.n > 0) return;
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Missing seed file at ${SEED_PATH}`);
  }
  const seedFile = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as {
    photos: Array<{
      id: string;
      filename: string;
      caption: string;
      width: number;
      height: number;
      sortOrder: number;
    }>;
  };
  const insert = db.prepare(
    `INSERT INTO media (id, kind, filename, mime, caption, sort_order, width, height, created_at)
     VALUES (?, 'photo', ?, 'image/jpeg', ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const photo of seedFile.photos) {
      const file = `${MEDIA_DIR}/${photo.filename}`;
      if (!fs.existsSync(file)) {
        throw new Error(`Seed photo missing on disk: ${photo.filename}`);
      }
      insert.run(photo.id, photo.filename, photo.caption, photo.sortOrder, photo.width, photo.height, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getDb(): DatabaseSync {
  if (!globalForDb.weddingDb) globalForDb.weddingDb = openDb();
  return globalForDb.weddingDb;
}

type StoredMedia = MediaItem & { filename: string; remoteUrl: string | null };

function liveToItem(row: LiveMedia): MediaItem | null {
  const remoteUrl = safeRemote(row.remoteUrl);
  if (!remoteUrl && !fs.existsSync(`${MEDIA_DIR}/${row.filename}`)) return null;
  return {
    id: row.id,
    kind: row.kind,
    caption: row.caption,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    mime: row.mime,
    src: remoteUrl && (row.kind === "video" || row.mime === "image/gif") ? remoteUrl : `/media/${row.id}${row.kind === "photo" ? `?v=${row.width || 0}x${row.height || 0}` : ""}`,
  };
}

async function editCatalog(edit: (state: LiveState) => void, forget: string[] = []): Promise<LiveState> {
  return changeLive((state) => {
    state.media = mediaKeepingDeletions(state);
    edit(state);
    state.media = mediaKeepingDeletions(state);
  }, { forget });
}

/** The catalog is the list. A missing original photograph was removed, so it is not copied back. */
async function shared(): Promise<LiveState> {
  const state = await readLive();
  return { ...state, media: mediaKeepingDeletions(state) };
}

function fromShared(row: LiveMedia): StoredMedia | null {
  const item = liveToItem(row);
  if (!item) return null;
  return { ...item, filename: row.filename, remoteUrl: safeRemote(row.remoteUrl) };
}

export async function getHome(): Promise<HomeDetails> {
  const state = await shared();
  return state.home;
}

export async function saveHome(patch: Partial<HomeDetails>): Promise<HomeDetails> {
  const saved = await editCatalog((state) => {
    const current = state.home;
    const honored = patch.honored
      ? patch.honored.map((item) => item.replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean).slice(0, 40)
      : current.honored;
    state.home = {
      address: patch.address !== undefined ? patch.address.replace(/\s+/g, " ").trim().slice(0, 240) : current.address,
      dressCode: patch.dressCode !== undefined ? patch.dressCode.replace(/\r\n/g, "\n").trim().slice(0, 800) : current.dressCode,
      honored,
      musicUrl: patch.musicUrl !== undefined ? safeRemote(patch.musicUrl) : current.musicUrl,
      backgroundOpacity: patch.backgroundOpacity !== undefined ? Math.max(0, Math.min(100, Math.round(patch.backgroundOpacity))) : current.backgroundOpacity,
      panelOpacity: patch.panelOpacity !== undefined ? Math.max(0, Math.min(100, Math.round(patch.panelOpacity))) : current.panelOpacity,
      banner: patch.banner !== undefined ? storyBanner(patch.banner) : storyBanner(current.banner),
      features: patch.features !== undefined ? storyFeatures(patch.features) : storyFeatures(current.features),
    };
  });
  return saved.home;
}

export async function listMedia(): Promise<MediaItem[]> {
  const state = await shared();
  return state.media
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map(liveToItem)
    .filter((item): item is MediaItem => item !== null);
}

export async function getMedia(id: string): Promise<StoredMedia | null> {
  const state = await shared();
  const row = state.media.find((item) => item.id === id);
  if (!row) return null;
  return fromShared(row);
}

export async function insertMedia(input: {
  id: string;
  kind: MediaKind;
  filename: string;
  mime: string;
  caption: string;
  width: number | null;
  height: number | null;
  remoteUrl?: string | null;
}): Promise<MediaItem> {
  const createdAt = new Date().toISOString();
  const remoteUrl = safeRemote(input.remoteUrl);
  const saved = await editCatalog((state) => {
    if (state.media.some((item) => item.id === input.id)) return;
    const sortOrder =
      state.media.filter((item) => item.kind === input.kind).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
    state.media.push({
      id: input.id,
      kind: input.kind,
      filename: input.filename,
      mime: input.mime,
      caption: input.caption,
      sortOrder,
      width: input.width,
      height: input.height,
      createdAt,
      remoteUrl,
    });
  });
  if (!saved.media.some((item) => item.id === input.id)) throw new Error("Could not save the shared record");
  const created = await getMedia(input.id);
  if (!created || created.kind !== input.kind) throw new Error("Could not save the shared record");
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO media (id, kind, filename, mime, caption, sort_order, width, height, created_at, remote_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      created.id,
      created.kind,
      created.filename,
      created.mime,
      created.caption,
      created.sortOrder,
      created.width,
      created.height,
      createdAt,
      created.remoteUrl,
    );
  remember();
  return created;
}

export async function updateMedia(id: string, patch: { caption?: string; sortOrder?: number }): Promise<MediaItem | null> {
  const current = await getMedia(id);
  if (!current) return null;
  const caption = patch.caption ?? current.caption;
  const sortOrder = patch.sortOrder ?? current.sortOrder;
  await editCatalog((state) => {
    const row = state.media.find((item) => item.id === id);
    if (!row) return;
    row.caption = caption;
    row.sortOrder = sortOrder;
  });
  getDb().prepare("UPDATE media SET caption = ?, sort_order = ? WHERE id = ?").run(caption, sortOrder, id);
  remember();
  return getMedia(id);
}

export async function reorderMedia(kind: MediaKind, orderedIds: string[]): Promise<MediaItem[]> {
  const state = await shared();
  const existing = state.media.filter((item) => item.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id);
  if (existing.length !== orderedIds.length || existing.some((id) => !orderedIds.includes(id))) {
    throw new Error("order mismatch");
  }
  await editCatalog((next) => {
    orderedIds.forEach((id, index) => {
      const row = next.media.find((item) => item.id === id && item.kind === kind);
      if (row) row.sortOrder = index + 1;
    });
  });
  const update = getDb().prepare("UPDATE media SET sort_order = ? WHERE id = ? AND kind = ?");
  orderedIds.forEach((id, index) => update.run(index + 1, id, kind));
  remember();
  return listMedia();
}

export async function deleteMedia(id: string): Promise<boolean> {
  const current = await getMedia(id);
  if (!current) return false;
  await editCatalog((state) => {
    state.removed = [...(state.removed ?? []), id];
    state.media = state.media.filter((item) => item.id !== id);
  }, [id]);
  getDb().prepare("DELETE FROM media WHERE id = ?").run(id);
  const full = `${MEDIA_DIR}/${current.filename}`;
  if (current.filename && fs.existsSync(full)) fs.unlinkSync(full);
  remember();
  return true;
}

export function getUser(username: string): { username: string; passwordHash: string } | null {
  const row = getDb()
    .prepare("SELECT username, password_hash AS passwordHash FROM users WHERE username = ?")
    .get(username) as { username: string; passwordHash: string } | undefined;
  return row ?? null;
}

export function setPasswordHash(username: string, passwordHash: string): void {
  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?")
    .run(passwordHash, new Date().toISOString(), username);
  remember();
}

export function createSession(token: string, username: string, expiresAt: number): void {
  getDb().prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)").run(token, username, expiresAt);
}

export function getSession(token: string): { username: string } | null {
  const row = getDb().prepare("SELECT username, expires_at FROM sessions WHERE token = ?").get(token) as
    | { username: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return { username: row.username };
}

export function deleteSession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function dataDir(): string {
  return DATA_DIR;
}

const INVITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function partyOf(invite: { name: string; party?: string[] }): string[] {
  const listed = Array.isArray(invite.party)
    ? invite.party.map((item) => cleanName(item)).filter((item): item is string => Boolean(item)).slice(0, 2)
    : [];
  if (listed.length) return listed;
  const name = cleanLabel(invite.name) || cleanName(invite.name);
  return name ? [name] : [];
}

function invitesFrom(state: LiveState): InviteRecord[] {
  return state.invites.map((invite) => {
    const reply = state.rsvps.find((row) => row.inviteId === invite.id);
    const responded = Boolean(reply);
    const names = reply?.names ?? [];
    const party = partyOf(invite);
    return {
      id: invite.id,
      name: invite.name,
      party,
      names,
      responded,
      headcount: responded ? names.length : 0,
    };
  });
}

export async function createInvite(partyInput: string[]): Promise<InviteRecord> {
  const party = partyInput.map((item) => cleanName(item)).filter((item): item is string => Boolean(item)).slice(0, 2);
  const lines = invitationLines(party);
  if (!lines.label) throw new Error("Enter a guest name.");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await editCatalog((state) => {
    state.invites.push({ id, name: lines.label, party, createdAt });
  });
  getDb().prepare("INSERT INTO invites (id, name, created_at) VALUES (?, ?, ?)").run(id, lines.label, createdAt);
  remember();
  return { id, name: lines.label, party, names: [], responded: false, headcount: 0 };
}

export async function ensureInvite(id: string, name: string, partyInput?: string[]): Promise<void> {
  const clean = cleanLabel(name);
  const party = (partyInput ?? []).map((item) => cleanName(item)).filter((item): item is string => Boolean(item)).slice(0, 2);
  if (!clean || !INVITE_ID.test(id)) throw new Error("bad invite");
  await editCatalog((state) => {
    if (state.invites.some((invite) => invite.id === id)) return;
    state.invites.push({ id, name: clean, party: party.length ? party : [clean], createdAt: new Date().toISOString() });
  });
  const db = getDb();
  const existing = db.prepare("SELECT id FROM invites WHERE id = ?").get(id);
  if (!existing) db.prepare("INSERT INTO invites (id, name, created_at) VALUES (?, ?, ?)").run(id, clean, new Date().toISOString());
  remember();
}

export async function getInvite(id: string): Promise<{ id: string; name: string; names: string[] | null } | null> {
  if (!INVITE_ID.test(id)) return null;
  const state = await shared();
  const invite = state.invites.find((item) => item.id === id);
  if (!invite) return null;
  const reply = state.rsvps.find((row) => row.inviteId === id);
  return { id: invite.id, name: invite.name, names: reply ? reply.names : null };
}

export async function saveRsvp(inviteId: string, names: string[]): Promise<{ name: string; names: string[]; headcount: number } | null> {
  const invite = await getInvite(inviteId);
  if (!invite) return null;
  const now = new Date().toISOString();
  await editCatalog((state) => {
    if (!state.invites.some((item) => item.id === inviteId)) {
      state.invites.push({ id: inviteId, name: invite.name, createdAt: now });
    }
    const reply = state.rsvps.find((row) => row.inviteId === inviteId);
    if (reply) {
      reply.names = names;
      reply.updatedAt = now;
    } else {
      state.rsvps.push({ inviteId, names, updatedAt: now });
    }
  });
  getDb()
    .prepare(
      `INSERT INTO rsvps (invite_id, plus_names, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(invite_id) DO UPDATE SET plus_names = excluded.plus_names, updated_at = excluded.updated_at`,
    )
    .run(inviteId, JSON.stringify(names), now);
  remember();
  return { name: invite.name, names, headcount: names.length };
}

export async function deleteInvite(id: string): Promise<boolean> {
  if (!INVITE_ID.test(id)) return false;
  const state = await readLive();
  const inDb = getDb().prepare("SELECT id FROM invites WHERE id = ?").get(id);
  if (!state.invites.some((invite) => invite.id === id) && !inDb) return false;
  getDb().prepare("DELETE FROM rsvps WHERE invite_id = ?").run(id);
  getDb().prepare("DELETE FROM invites WHERE id = ?").run(id);
  await editCatalog((next) => {
    next.invites = next.invites.filter((invite) => invite.id !== id);
    next.rsvps = next.rsvps.filter((reply) => reply.inviteId !== id);
  });
  remember();
  return true;
}

export async function listInvites(): Promise<InviteRecord[]> {
  return invitesFrom(await shared());
}

export async function attendance(): Promise<{ total: number; names: string[] }> {
  const names = (await listInvites())
    .filter((invite) => invite.responded)
    .flatMap((invite) => invite.names);
  return { total: names.length, names };
}
