import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { saveHome } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not remove that music." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  try {
    const home = await saveHome({ musicUrl: null });
    return NextResponse.json({ home });
  } catch (error) {
    console.error("music remove failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not remove that music." }, { status: 400 });
  }
}
