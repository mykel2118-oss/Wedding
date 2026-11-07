import { NextResponse } from "next/server";
import { changePassword, readSession, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not update the password." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not update the password." }, { status: 400 });
  }
  const result = await changePassword(session.username, body.currentPassword || "", body.newPassword || "");
  if (result === "weak") {
    return NextResponse.json({ error: "Use at least 7 characters." }, { status: 400 });
  }
  if (result === "bad") {
    return NextResponse.json({ error: "The current password doesn’t match." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
