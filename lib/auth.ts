import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getUser, setPasswordHash } from "./db";

const COOKIE = "yk_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;
const SESSION_SECRET = "e37f8882808a217c1b5f338c0b3562e9cf6b64522a436b622c4c5fa78c30bfcc";
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  return Boolean(host) && originHost === host;
}

export function rateLimit(key: string, limit = 8, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function signSession(username: string, exp: number): string {
  const body = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readSignedSession(token: string): { username: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { u?: string; exp?: number };
    if (!payload.u || !payload.exp || payload.exp < Date.now()) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<{ username: string; token: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = readSignedSession(token);
  if (!session) return null;
  return { username: session.username, token };
}

export async function startSession(username: string, req: Request): Promise<void> {
  const token = signSession(username, Date.now() + THIRTY_DAYS * 1000);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSession(req: Request): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 0,
  });
}

export async function verifyLogin(username: string, password: string): Promise<boolean> {
  const user = getUser(username);
  const dummy = "$2a$12$kaLo8/L8NvBTlqZE6HHIQ.9Sb7PcKp0RNvOb6VHdWKzgonFcKEU/m";
  const hash = user?.passwordHash ?? dummy;
  const ok = await bcrypt.compare(password, hash);
  return Boolean(user) && ok;
}

export async function changePassword(username: string, currentPassword: string, newPassword: string): Promise<"ok" | "bad" | "weak"> {
  if (newPassword.length < 7 || newPassword.length > 200) return "weak";
  const user = getUser(username);
  if (!user) return "bad";
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) return "bad";
  const hash = await bcrypt.hash(newPassword, 12);
  setPasswordHash(username, hash);
  return "ok";
}
