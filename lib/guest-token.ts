import crypto from "node:crypto";
import { cleanLabel, cleanName } from "./names";

const SECRET = "e37f8882808a217c1b5f338c0b3562e9cf6b64522a436b622c4c5fa78c30bfcc";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signGuest(id: string, name: string, party?: string[]): string {
  const people = (party?.length ? party : [name]).slice(0, 2);
  const body = Buffer.from(JSON.stringify({ id, name, party: people }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readGuest(token: string): { id: string; name: string; party: string[] } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      id?: unknown;
      name?: unknown;
      party?: unknown;
    };
    const party = Array.isArray(payload.party)
      ? payload.party.map((item) => cleanName(item)).filter((item): item is string => Boolean(item)).slice(0, 2)
      : [];
    const name = cleanLabel(payload.name) || (party.length ? party.join(" and ") : null);
    if (!name || typeof payload.id !== "string" || !UUID.test(payload.id)) return null;
    return { id: payload.id, name, party: party.length ? party : [name] };
  } catch {
    return null;
  }
}
