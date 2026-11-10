import { NextResponse } from "next/server";
import { readSession, sameOrigin } from "@/lib/auth";
import { saveHome } from "@/lib/db";
import { storyBanner, storyFeatures } from "@/lib/features";
import { cleanName } from "@/lib/names";
import type { HomeDetails } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Could not save that." }, { status: 403 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let body: { address?: unknown; dressCode?: unknown; honored?: unknown; backgroundOpacity?: unknown; panelOpacity?: unknown; banner?: unknown; features?: unknown };
  try {
    body = (await req.json()) as { address?: unknown; dressCode?: unknown; honored?: unknown; backgroundOpacity?: unknown; panelOpacity?: unknown; banner?: unknown; features?: unknown };
  } catch {
    return NextResponse.json({ error: "Could not save that." }, { status: 400 });
  }
  const patch: { address?: string; dressCode?: string; honored?: string[]; backgroundOpacity?: number; panelOpacity?: number; banner?: string | null; features?: HomeDetails["features"] } = {};
  if (body.address !== undefined) {
    if (typeof body.address !== "string") return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    patch.address = body.address;
  }
  if (body.dressCode !== undefined) {
    if (typeof body.dressCode !== "string") return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    patch.dressCode = body.dressCode;
  }
  if (body.honored !== undefined) {
    if (!Array.isArray(body.honored)) return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    const names: string[] = [];
    for (const item of body.honored) {
      const name = cleanName(item);
      if (!name || names.includes(name)) continue;
      names.push(name);
    }
    patch.honored = names;
  }
  if (body.backgroundOpacity !== undefined) {
    if (typeof body.backgroundOpacity !== "number" || !Number.isInteger(body.backgroundOpacity) || body.backgroundOpacity < 0 || body.backgroundOpacity > 100) {
      return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    }
    patch.backgroundOpacity = body.backgroundOpacity;
  }
  if (body.panelOpacity !== undefined) {
    if (typeof body.panelOpacity !== "number" || !Number.isInteger(body.panelOpacity) || body.panelOpacity < 0 || body.panelOpacity > 100) {
      return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    }
    patch.panelOpacity = body.panelOpacity;
  }
  if (body.banner !== undefined) {
    if (body.banner !== null && typeof body.banner !== "string") return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    const banner = storyBanner(body.banner);
    if (body.banner !== null && banner === null) return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    patch.banner = banner;
  }
  if (body.features !== undefined) {
    if (!Array.isArray(body.features) || body.features.length !== 3) {
      return NextResponse.json({ error: "Could not save that." }, { status: 400 });
    }
    patch.features = storyFeatures(body.features);
  }
  try {
    const home = await saveHome(patch);
    return NextResponse.json({ home });
  } catch (error) {
    console.error("home save failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not save that." }, { status: 400 });
  }
}
