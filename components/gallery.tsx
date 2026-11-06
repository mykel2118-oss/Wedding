"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MediaItem } from "@/lib/types";

const ROW_SIZE = 4;

function rowsOf(items: MediaItem[]) {
  const rows: MediaItem[][] = [];
  for (let index = 0; index < items.length; index += ROW_SIZE) rows.push(items.slice(index, index + ROW_SIZE));
  return rows;
}

function Shots({
  group,
  items,
  tabbable,
  eager,
  onOpen,
}: {
  group: MediaItem[];
  items: MediaItem[];
  tabbable: boolean;
  eager: boolean;
  onOpen: (index: number) => void;
}) {
  return group.map((item) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    return (
      <figure key={item.id} className="shot">
        <div
          role="button"
          tabIndex={tabbable ? 0 : -1}
          className="shot-open"
          onClick={() => onOpen(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(index);
            }
          }}
          aria-label={item.caption || "Open"}
        >
          {item.kind === "video" ? (
            <video src={item.src} muted playsInline preload="metadata" />
          ) : (
            <img
              src={item.src}
              alt={item.caption || "Photograph"}
              width={item.width ?? undefined}
              height={item.height ?? undefined}
              loading={eager ? "eager" : "lazy"}
            />
          )}
        </div>
        {item.caption ? <figcaption>{item.caption}</figcaption> : null}
      </figure>
    );
  });
}

export function Gallery({ items }: { items: MediaItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [hold, setHold] = useState(false);
  const hover = useRef(false);
  const pressing = useRef(false);
  const rows = rowsOf(items);

  function syncHold() {
    setHold(hover.current || pressing.current);
  }

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((index) => (index === null ? index : (index + 1) % items.length));
      if (event.key === "ArrowLeft") {
        setOpen((index) => (index === null ? index : (index - 1 + items.length) % items.length));
      }
    };
    document.documentElement.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, items.length]);

  const current = open === null ? null : items[open];
  const paused = hold || open !== null;

  return (
    <>
      <div
        className={paused ? "gallery-rows is-paused" : "gallery-rows"}
        aria-label="Photographs"
        onMouseEnter={() => {
          hover.current = true;
          syncHold();
        }}
        onMouseLeave={() => {
          hover.current = false;
          syncHold();
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          pressing.current = true;
          syncHold();
        }}
        onPointerUp={() => {
          pressing.current = false;
          syncHold();
        }}
        onPointerCancel={() => {
          pressing.current = false;
          syncHold();
        }}
      >
        {rows.map((group, rowIndex) => {
          const moving = group.length === ROW_SIZE;
          const toTheRight = rowIndex % 2 === 0;
          return (
            <div className="gallery-row" key={group[0]?.id ?? rowIndex}>
              <div className={`gallery-row-track${moving ? (toTheRight ? " is-ltr" : " is-rtl") : " is-short"}`}>
                <div className={moving ? "gallery-set" : "gallery-set is-short"} style={{ "--shots": group.length } as CSSProperties}>
                  <Shots group={group} items={items} tabbable eager={rowIndex === 0} onOpen={setOpen} />
                </div>
                {moving ? (
                  <div className="gallery-set" aria-hidden="true">
                    <Shots group={group} items={items} tabbable={false} eager={false} onOpen={setOpen} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {current ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={current.caption || "Photograph"}>
          <button type="button" className="lightbox-backdrop" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="lightbox-frame">
            {current.kind === "video" ? (
              <video src={current.src} controls autoPlay playsInline />
            ) : (
              <img src={current.src} alt={current.caption || "Photograph"} />
            )}
            <div className="lightbox-bar">
              <p>{current.caption}</p>
              <div className="lightbox-actions">
                <button type="button" onClick={() => setOpen((open! - 1 + items.length) % items.length)}>
                  Previous
                </button>
                <button type="button" onClick={() => setOpen((open! + 1) % items.length)}>
                  Next
                </button>
                <button type="button" onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
