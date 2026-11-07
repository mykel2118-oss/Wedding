"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MARK } from "@/lib/mark";

const HOLD_MS = 2000;
const DOCK_MS = 980;
const GUEST_DOCK_MS = 1700;

function introKey() {
  const guest = new URLSearchParams(window.location.search).get("guest");
  return `yk-intro:${guest || "home"}`;
}

export function Intro() {
  const markRef = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(MARK);
  const [docking, setDocking] = useState(false);
  const [armed, setArmed] = useState(false);
  const familyRef = useRef("");
  const inviteRef = useRef("");
  const holdStarted = useRef(false);
  const dockStarted = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (root.classList.contains("intro-done") || root.classList.contains("envelope-open")) setArmed(true);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("intro-done")) {
      setGone(true);
      return;
    }
    familyRef.current = root.dataset.family?.replace(/\s+/g, " ").trim().slice(0, 80) || "";
    inviteRef.current = root.dataset.invite?.replace(/\s+/g, " ").trim().slice(0, 80) || "";
    if (familyRef.current) setShown(familyRef.current);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!armed || gone || root.classList.contains("intro-done") || holdStarted.current) return;
    if (familyRef.current && shown !== familyRef.current) return;

    const mark = markRef.current;
    if (!mark) return;
    holdStarted.current = true;
    root.classList.add("intro-lock");

    const fit = () => {
      mark.style.fontSize = "";
      let size = Number.parseFloat(getComputedStyle(mark).fontSize);
      const limit = window.innerWidth * 0.84;
      while (mark.scrollWidth > limit && size > 28) {
        size -= 1;
        mark.style.fontSize = `${size}px`;
      }
    };
    fit();

    let cancelled = false;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        if (inviteRef.current) setShown(inviteRef.current);
        setLeaving(true);
        setDocking(true);
      }, HOLD_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      if (!dockStarted.current) root.classList.remove("intro-lock");
    };
  }, [shown, gone, armed]);

  useLayoutEffect(() => {
    if (!docking || dockStarted.current) return;
    if (inviteRef.current && shown !== inviteRef.current) return;

    const root = document.documentElement;
    const mark = markRef.current;
    if (!mark) return;
    dockStarted.current = true;
    root.classList.add("intro-lock");

    const fit = () => {
      mark.style.fontSize = "";
      let size = Number.parseFloat(getComputedStyle(mark).fontSize);
      const limit = window.innerWidth * 0.84;
      while (mark.scrollWidth > limit && size > 28) {
        size -= 1;
        mark.style.fontSize = `${size}px`;
      }
    };

    const reduced = root.classList.contains("reduce-motion");
    let cancelled = false;
    const timers: number[] = [];
    const duration = inviteRef.current ? GUEST_DOCK_MS : DOCK_MS;

    const finish = () => {
      if (cancelled) return;
      root.classList.add("intro-done");
      root.classList.remove("intro-lock");
      try {
        sessionStorage.setItem(introKey(), "1");
      } catch {
        /* session storage can be blocked; the intro still played */
      }
      setGone(true);
    };

    if (reduced) {
      timers.push(window.setTimeout(finish, 480));
    } else {
      const slot = document.getElementById("brand-slot");
      if (!slot) {
        finish();
      } else {
        fit();
        const first = mark.getBoundingClientRect();
        const slotRect = slot.getBoundingClientRect();
        const slotSize = Number.parseFloat(getComputedStyle(slot).fontSize);
        mark.style.left = `${slotRect.left}px`;
        mark.style.top = `${slotRect.top}px`;
        mark.style.transform = "none";
        mark.style.fontSize = `${slotSize}px`;
        const last = mark.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = first.width / Math.max(last.width, 1);
        const sy = first.height / Math.max(last.height, 1);
        const animation = mark.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
              transformOrigin: "top left",
            },
            { transform: "none", transformOrigin: "top left" },
          ],
          { duration, easing: "cubic-bezier(.72, .02, .18, 1)", fill: "forwards" },
        );
        animation.onfinish = () => finish();
        timers.push(window.setTimeout(finish, duration + 80));
      }
    }

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [docking, shown]);

  if (gone) return null;

  return (
    <>
      <div className={leaving ? "intro-overlay is-leaving" : "intro-overlay"} aria-hidden="true" />
      <div className="intro-mark" ref={markRef} aria-hidden="true">
        {shown}
      </div>
    </>
  );
}
