"use client";

import { useLayoutEffect, useState } from "react";
import { playBannerFilm } from "@/components/banner-picture";
import { startInvitationMusic } from "@/components/invitation-music";

const OPEN_MS = 2700;
const HANDOFF_MS = 520;

export function Envelope() {
  const [phase, setPhase] = useState<"closed" | "opening" | "revealing" | "gone">("closed");

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("intro-done")) {
      setPhase("gone");
      return;
    }
    root.classList.add("envelope-lock");
    return () => root.classList.remove("envelope-lock");
  }, []);

  function open() {
    if (phase !== "closed") return;
    playBannerFilm();
    startInvitationMusic();
    setPhase("opening");
    const reduced = document.documentElement.classList.contains("reduce-motion");
    const phone = window.matchMedia("(max-width: 860px)").matches;
    const openFor = reduced ? 240 : phone ? 2600 : OPEN_MS;
    const handoff = reduced ? 80 : HANDOFF_MS;
    window.setTimeout(() => {
      document.documentElement.classList.add("envelope-open");
      setPhase("revealing");
      window.setTimeout(() => {
        document.documentElement.classList.remove("envelope-lock");
        setPhase("gone");
      }, handoff);
    }, openFor);
  }

  if (phase === "gone") return null;

  const className = ["envelope", phase === "opening" || phase === "revealing" ? "is-opening" : "", phase === "revealing" ? "is-revealing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="dialog" aria-label="You are invited">
      <button type="button" className="envelope-photo" onClick={open} aria-label="Open the invitation">
        <svg className="envelope-photo-defs" aria-hidden="true">
          <clipPath id="envelope-pocket-clip" clipPathUnits="objectBoundingBox">
            <path fillRule="evenodd" d="M0 0 H1 V1 H0 Z M0 0 L0.5 0.5 L1 0 Z" />
          </clipPath>
        </svg>
        <span className="envelope-photo-lining" aria-hidden="true">
          <img src="/envelope/pocket.jpg?v=5" alt="" />
        </span>
        <span className="envelope-photo-paper-window" aria-hidden="true">
          <span className="envelope-photo-paper">
            <span>You are invited</span>
          </span>
        </span>
        <span className="envelope-photo-sheet envelope-photo-pocket" aria-hidden="true">
          <img src="/envelope/pocket.jpg?v=5" alt="" />
        </span>
        <span className="envelope-photo-sheet envelope-photo-flap" aria-hidden="true">
          <span className="envelope-photo-flap-paper">
            <img src="/envelope/mobile.jpg?v=6" alt="" />
          </span>
          <span className="envelope-photo-seal">
            <img src="/envelope/mobile.jpg?v=6" alt="" />
          </span>
        </span>
        <span className="envelope-photo-hint">tap to open</span>
      </button>
      <div className="envelope-stage">
        <svg className="envelope-vines envelope-vines-left" viewBox="0 0 160 800" aria-hidden="true">
          <Vines />
        </svg>
        <svg className="envelope-vines envelope-vines-right" viewBox="0 0 160 800" aria-hidden="true">
          <Vines />
        </svg>
        <div className="envelope-light" aria-hidden="true" />
        <p className="envelope-kicker">You are invited</p>
        <div className="envelope-mail">
          <div className="envelope-slot">
            <div className="envelope-card">
              <p>You are invited</p>
              <span />
            </div>
          </div>
          <div className="envelope-lining" aria-hidden="true" />
          <div className="envelope-pocket" aria-hidden="true" />
          <div className="envelope-flap">
            <div className="envelope-flap-shape" aria-hidden="true" />
            <button type="button" className="seal" onClick={open} aria-label="Open the invitation">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path d="M32 50 V16" />
                <path d="M32 42c-6-2-12-6-16-14" />
                <path d="M32 42c6-2 12-6 16-14" />
                <path d="M32 34c-5-1-10-4-13-10" />
                <path d="M32 34c5-1 10-4 13-10" />
                <path d="M32 26c-4-1-7-3-9-7" />
                <path d="M32 26c4-1 7-3 9-7" />
                <path d="M32 16c-2 3-2 5 0 7 2-2 2-4 0-7z" />
              </svg>
            </button>
          </div>
          <button type="button" className="envelope-open-hint" onClick={open}>
            tap to open
          </button>
        </div>
      </div>
    </div>
  );
}

function Vines() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M80 0c8 40 6 70-8 100" />
      <path d="M72 36c18 6 28 4 36-8" />
      <path d="M70 58c-16 8-24 6-30-6" />
      <path d="M68 78c14 8 22 6 28-8" />
      <path d="M40 90c10 50 4 90-18 130" />
      <path d="M36 130c16 4 24 2 30-10" />
      <path d="M30 156c-14 8-20 6-26-8" />
      <path d="M110 20c12 46 4 86-16 120" />
      <path d="M108 60c14 6 22 4 28-8" />
      <path d="M100 90c-12 8-18 6-22-8" />
      <path d="M20 200c14 54 6 100-10 150" />
      <path d="M22 250c16 4 22 2 26-10" />
      <path d="M18 280c-12 6-16 4-18-8" />
      <path d="M130 160c8 48-2 90-20 130" />
      <path d="M124 210c14 4 20 2 24-10" />
      <path d="M118 240c-12 6-16 4-18-8" />
    </g>
  );
}
