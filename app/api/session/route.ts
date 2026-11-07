import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  return NextResponse.json({ username: session?.username ?? null });
}
