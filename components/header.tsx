"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { MARK } from "@/lib/mark";

function withGuest(path: string, guest: string) {
  if (!guest) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const url = new URL(base || "/", "http://wedding.local");
  url.searchParams.set("guest", guest);
  return `${url.pathname}${url.search}${hash}`;
}

export function Header({ owner = false }: { owner?: boolean }) {
  const pathname = usePathname();
  const [brand, setBrand] = useState(MARK);
  const [guest, setGuest] = useState("");

  useLayoutEffect(() => {
    const invite = document.documentElement.dataset.invite?.replace(/\s+/g, " ").trim();
    if (invite) setBrand(invite);
    setGuest(new URLSearchParams(window.location.search).get("guest") || "");
  }, [pathname]);

  return (
    <header className="site-header">
      <Link href={withGuest("/", guest)} className="brand" id="brand-slot">
        {brand}
      </Link>
      <nav className="nav" aria-label="Sections">
        <Link href={withGuest("/#story", guest)}>Story</Link>
        <Link href={withGuest("/#gallery", guest)}>Gallery</Link>
        <Link href={withGuest("/guests", guest)}>Guest photos</Link>
        <Link href={withGuest("/#venue", guest)}>Ceremony & reception</Link>
        <Link href={withGuest("/seats", guest)} aria-current={pathname === "/seats" ? "page" : undefined}>
          Seating
        </Link>
        <Link href={withGuest("/#rsvp", guest)}>RSVP</Link>
        {owner ? <Link href="/library#seating">Edit seating</Link> : null}
      </nav>
    </header>
  );
}
