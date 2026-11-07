import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeatureDesk } from "@/components/feature-desk";
import { HomeDesk } from "@/components/home-desk";
import { InviteDesk } from "@/components/invite-desk";
import { LibraryDesk } from "@/components/library-desk";
import { readSession } from "@/lib/auth";
import { getHome, listInvites, listMedia } from "@/lib/db";
import { signGuest } from "@/lib/guest-token";
import { MARK } from "@/lib/mark";

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
  const invites = (await listInvites()).map((invite) => ({ ...invite, token: signGuest(invite.id, invite.name, invite.party) }));
  return (
    <main className="desk-page">
      <FeatureDesk initial={home} media={items} />
      <InviteDesk initial={invites} />
      <HomeDesk initial={home} />
      <LibraryDesk initial={items} />
    </main>
  );
}
