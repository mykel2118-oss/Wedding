import { BannerPicture } from "@/components/banner-picture";
import { Countdown } from "@/components/countdown";
import { Gallery } from "@/components/gallery";
import { InvitationMusic } from "@/components/invitation-music";
import { Reveal } from "@/components/reveal";
import { RsvpCard } from "@/components/rsvp-card";
import { SaveTheDate } from "@/components/save-the-date";
import { ensureInvite, getHome, getInvite, listMedia } from "@/lib/db";
import { readGuest } from "@/lib/guest-token";
import { MARK, WEDDING_PLACE } from "@/lib/mark";
import type { MediaItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME_FIRST: MediaItem = {
  id: "home-banner",
  kind: "photo",
  caption: "",
  sortOrder: 0,
  width: 2720,
  height: 1536,
  mime: "image/png",
  src: "/photos/home-banner.png",
};

function SectionBreak() {
  return (
    <div className="section-break" aria-hidden="true">
      <span />
    </div>
  );
}

const STORY = [
  {
    id: "39e1fd09-91bd-4e61-9ea8-481543d66601",
    kicker: "The first photograph",
    title: "Ordinary dates",
    body: "This is the first photograph of the two of you together, an ordinary date that still feels like the beginning.",
  },
  {
    id: "f8a8acff-b946-4304-9ece-e9f885a52ca4",
    kicker: "Vegas",
    title: "Nights that stayed out",
    body: "You stayed out in Vegas for Ying's birthday.",
    flip: true,
  },
  {
    id: "63e42b4f-ad26-419b-8a6e-22ce1f0a25a1",
    kicker: "The proposal",
    title: "A gold evening",
    body: "On a gold evening in Vegas, Kel proposed to Ying.",
  },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams;
  const token = typeof params.guest === "string" ? params.guest : "";
  const parsed = token ? readGuest(token) : null;
  if (parsed) await ensureInvite(parsed.id, parsed.name, parsed.party);
  const guest = parsed ? await getInvite(parsed.id) : null;
  const items = await listMedia();
  const home = await getHome();
  const byId = new Map(items.map((item) => [item.id, item]));
  const bannerMedia = home.banner ? byId.get(home.banner) ?? null : null;
  const hero: MediaItem = bannerMedia ?? HOME_FIRST;
  const catalogPhotos = items.filter((item) => item.kind === "photo" && item.id !== HOME_FIRST.id && item.id !== hero.id);
  const photos = hero.kind === "photo" ? [hero, ...catalogPhotos] : catalogPhotos;

  return (
    <main>
      <section className="hero wrap-wide">
        <div className="hero-copy">
          <p className="eyebrow">The wedding of</p>
          <h1 className="hero-title">
            Ying <span className="amp">&</span> kel
          </h1>
          <Countdown />
          <p className="when">
            <span>Saturday</span>
            <span className="when-dot" aria-hidden="true">
              ·
            </span>
            <span>10 April 2027</span>
            <span className="when-dot" aria-hidden="true">
              ·
            </span>
            <span>{WEDDING_PLACE}</span>
          </p>
          <RsvpCard
            token={parsed ? token : null}
            name={parsed?.name ?? null}
            initialNames={guest?.names ?? (parsed?.party.length ? parsed.party : null)}
          />
          <SaveTheDate />
          <p className="lede">A private book of dating, the long middle, and the evening that became an engagement.</p>
        </div>
        <figure className="hero-photo">
          {hero.kind === "video" ? (
            <BannerPicture
              src={hero.src}
              still={hero.poster ?? null}
              alt={hero.caption || "Ying and Kel"}
              width={hero.width}
              height={hero.height}
            />
          ) : (
            <img
              src={hero.src}
              alt={hero.caption || "Ying and Kel"}
              width={hero.width ?? undefined}
              height={hero.height ?? undefined}
            />
          )}
          {hero.caption ? <figcaption>{hero.caption}</figcaption> : null}
        </figure>
      </section>

      {home.dressCode ? (
        <section className="wrap detail-band" id="dress">
          <Reveal>
            <header className="section-head">
              <h2>Dress code</h2>
            </header>
            <p className="detail-copy">{home.dressCode}</p>
          </Reveal>
        </section>
      ) : null}

      {home.honored.length ? (
        <section className="wrap detail-band" id="honored">
          <Reveal>
            <header className="section-head">
              <h2 className="honored-title">Parents and honored guests</h2>
            </header>
            <ul className="honored-list">
              {home.honored.map((person) => (
                <li key={person}>{person}</li>
              ))}
            </ul>
          </Reveal>
        </section>
      ) : null}

      <SectionBreak />
      <section className="wrap story" id="story">
        <Reveal>
          <header className="section-head">
            <span className="idx" aria-hidden="true">
              02
            </span>
            <h2>How we got here</h2>
          </header>
        </Reveal>
        {STORY.map((chapter, index) => {
          const featureId = home.features[index];
          const photo = featureId ? byId.get(featureId) : null;
          return (
            <Reveal key={chapter.id}>
              <article className={chapter.flip ? "chapter flip" : "chapter"}>
                <div className="chapter-copy">
                  <p className="eyebrow">{chapter.kicker}</p>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.body}</p>
                </div>
                {photo ? (
                  <figure className="chapter-photo">
                    {photo.kind === "video" ? (
                      <video src={photo.src} autoPlay muted loop playsInline preload="metadata" />
                    ) : (
                      <img
                        src={photo.src}
                        alt={photo.caption || chapter.title}
                        width={photo.width ?? undefined}
                        height={photo.height ?? undefined}
                        loading="lazy"
                      />
                    )}
                    {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                  </figure>
                ) : null}
              </article>
            </Reveal>
          );
        })}
      </section>

      <SectionBreak />
      <section className="wrap gallery-section" id="gallery">
        <Reveal>
          <header className="section-head">
            <span className="idx" aria-hidden="true">
              03
            </span>
            <div>
              <h2>Photographs</h2>
              <p className="section-note">
                {photos.length > 4
                  ? "Four in each row. One row moves to the right, the next to the left. Open any of them."
                  : photos.length === 1
                    ? "One photograph. Open it."
                    : `${photos.length} photographs. Open any of them.`}
              </p>
            </div>
          </header>
        </Reveal>
        <Reveal>
          <Gallery items={photos} />
        </Reveal>
      </section>

      {home.address ? (
        <>
          <SectionBreak />
          <section className="wrap detail-band" id="venue">
            <Reveal>
              <header className="section-head">
                <h2>The venue</h2>
              </header>
              <p className="detail-copy">{home.address}</p>
              <div className="venue-photos">
                <img src="/venue/inside.jpg" alt="Inside the venue" />
                <img src="/venue/outside.jpg" alt="The front of the venue" />
              </div>
              <a
                className="text-button venue-maps"
                href={`https://maps.google.com/maps?q=${encodeURIComponent(home.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in maps
              </a>
            </Reveal>
          </section>
        </>
      ) : null}

      {home.musicUrl ? <InvitationMusic src={home.musicUrl} /> : null}

      <footer className="site-footer">
        <p className="brand-footer">{MARK}</p>
        <p>10 April 2027 · {WEDDING_PLACE}</p>
      </footer>
    </main>
  );
}
