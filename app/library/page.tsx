import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeatureDesk } from "@/components/feature-desk";
import { GuestDesk } from "@/components/guest-desk";
import { HomeDesk } from "@/components/home-desk";
import { InviteDesk } from "@/components/invite-desk";
import { LibraryDesk } from "@/components/library-desk";
import { SeatDesk } from "@/components/seat-desk";
import { readSession } from "@/lib/auth";
import { getHome, listInvites, listMedia } from "@/lib/db";
import { listGuestPhotos } from "@/lib/guest-photos";
import { signGuest } from "@/lib/guest-token";
import { readLive } from "@/lib/live";
import { MARK } from "@/lib/mark";
import { emptySeating, peopleReadyToSeat } from "@/lib/seating";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Library · ${MARK}`,
  robots: { index: false, follow: false },
};

export default async function LibraryPage() {
  const session = await readSession();
  if (!session) redirect("/private");
  const items = await listMedia();
  const home = await getHome();
  const guestPhotos = await listGuestPhotos();
  const invites = (await listInvites()).map((invite) => ({ ...invite, token: signGuest(invite.id, invite.name, invite.party) }));
  let seating = emptySeating();
  try {
    seating = (await readLive()).seating;
  } catch {
    seating = emptySeating();
  }
  return (
    <main className="desk-page">
      <FeatureDesk initial={home} media={items} />
      <GuestDesk initial={guestPhotos} />
      <InviteDesk initial={invites} />
      <SeatDesk initial={seating} people={peopleReadyToSeat(invites, seating)} />
      <HomeDesk initial={home} />
      <LibraryDesk initial={items} />
    </main>
  );
}
