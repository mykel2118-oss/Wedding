import type { Metadata } from "next";
import Link from "next/link";
import { listGuestPhotos } from "@/lib/guest-photos";
import { MARK } from "@/lib/mark";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Guest photos · ${MARK}`,
  description: "Photographs taken by the people invited to Ying & kel.",
};

export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams;
  const token = typeof params.guest === "string" ? params.guest : "";
  const photos = await listGuestPhotos();
  const cameraHref = token ? `/camera?guest=${encodeURIComponent(token)}` : "/camera";
  return (
    <main>
      <section className="wrap gallery-section guest-album">
        <header className="section-head">
          <div>
            <h1>Guest photos</h1>
            <p className="section-note">Photographs from the people who were invited.</p>
          </div>
        </header>
        <p className="guest-camera-link">
          <Link className="button" href={cameraHref}>
            Take a photograph
          </Link>
        </p>
        {photos.length === 0 ? (
          <p className="empty-line">None yet. They will gather here from the wedding.</p>
        ) : (
          <ul className="guest-grid">
            {photos.map((photo) => (
              <li key={photo.id}>
                <figure>
                  <img
                    src={photo.src}
                    alt={`Taken by ${photo.name}`}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                  />
                  <figcaption>Taken by {photo.name}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
