import type { Metadata } from "next";
import { GuestCamera } from "@/components/guest-camera";
import { MARK } from "@/lib/mark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Camera · ${MARK}`,
  robots: { index: false, follow: false },
};

export default function CameraPage() {
  return <GuestCamera />;
}
