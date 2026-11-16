import type { Metadata } from "next";
import { GuestCamera } from "@/components/guest-camera";
import { readGuest } from "@/lib/guest-token";
import { MARK } from "@/lib/mark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Camera · ${MARK}`,
  robots: { index: false, follow: false },
};

export default async function CameraPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams;
  const token = typeof params.guest === "string" ? params.guest : "";
  const guest = token ? readGuest(token) : null;
  const initialName = guest?.party[0] || "";
  return <GuestCamera initialName={initialName} />;
}
