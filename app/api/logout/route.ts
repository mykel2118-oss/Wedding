import { NextResponse } from "next/server";
import { clearSession, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not sign out." }, { status: 403 });
  await clearSession(req);
  return NextResponse.json({ ok: true });
}
