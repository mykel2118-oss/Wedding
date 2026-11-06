"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { MARK } from "@/lib/mark";

export function Header() {
  const [brand, setBrand] = useState(MARK);

  useLayoutEffect(() => {
    const invite = document.documentElement.dataset.invite?.replace(/\s+/g, " ").trim();
    if (invite) setBrand(invite);
  }, []);

  return (
    <header className="site-header">
      <Link href="/" className="brand" id="brand-slot">
        {brand}
      </Link>
      <nav className="nav" aria-label="Sections">
        <Link href="/#story">Story</Link>
        <Link href="/#gallery">Gallery</Link>
        <Link href="/#venue">Ceremony & reception</Link>
        <Link href="/#rsvp">RSVP</Link>
      </nav>
    </header>
  );
}
