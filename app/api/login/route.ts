import { NextResponse } from "next/server";
import { rateLimit, sameOrigin, startSession, verifyLogin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Those details don’t match." }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!rateLimit(`login:${ip}`)) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });
  }
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Those details don’t match." }, { status: 400 });
  }
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  if (!username || !password) {
    return NextResponse.json({ error: "Those details don’t match." }, { status: 401 });
  }
  const ok = await verifyLogin(username, password);
  if (!ok) return NextResponse.json({ error: "Those details don’t match." }, { status: 401 });
  await startSession(username, req);
  return NextResponse.json({ ok: true });
}
