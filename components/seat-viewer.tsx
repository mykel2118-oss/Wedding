"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { SeatMap, pieceBox, type SeatMark } from "@/components/seat-map";
import type { SeatPiece } from "@/lib/seating";

const ROOM = { x: 0, y: 0, w: 1000, h: 700 };

type View = { scale: number; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x, y, w: Math.max(24, right - x), h: Math.max(24, bottom - y) };
}

function expand(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

function viewFor(width: number, height: number, box: Box, minScale: number): View {
  const fit = Math.min(Math.max(40, width - 20) / box.w, Math.max(40, height - 20) / box.h);
  const scale = Math.max(minScale, Math.min(fit, 2.8));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

function opening(width: number, height: number, pieces: SeatPiece[], marks: SeatMark[], editable: boolean): View {
  if (editable) return viewFor(width, height, ROOM, width < 700 ? 0.72 : 0);
  const whole = viewFor(width, height, ROOM, 0);
  if (whole.scale >= 0.62 || marks.length === 0) return whole;
  const ids = [...new Set(marks.map((mark) => mark.pieceId))];
  const hot = ids.flatMap((id) => {
    const piece = pieces.find((item) => item.id === id);
    return piece ? [piece] : [];
  });
  if (!hot.length) return whole;
  const focus = expand(union(hot.map(pieceBox)), 170);
  const scale = Math.min(0.78, Math.max(0.58, whole.scale * 1.8));
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
}

export function SeatViewer({
  pieces,
  marks = [],
  selectedId = null,
  editable = false,
  svgRef,
  onBackgroundPointerDown,
  onPiecePointerDown,
  onHandlePointerDown,
  onPointerMove,
  onPointerUp,
  onPinchStart,
}: {
  pieces: SeatPiece[];
  marks?: SeatMark[];
  selectedId?: string | null;
  editable?: boolean;
  svgRef?: { current: SVGSVGElement | null };
  onBackgroundPointerDown?: (event: ReactPointerEvent<SVGRectElement>) => void;
  onPiecePointerDown?: (event: ReactPointerEvent<SVGGElement>, id: string) => void;
  onHandlePointerDown?: (event: ReactPointerEvent<SVGCircleElement>, id: string, mode: "resize" | "aim") => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPinchStart?: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const pinchRef = useRef(onPinchStart);
  const seatCursor = useRef(0);
  const touched = useRef(false);
  pinchRef.current = onPinchStart;

  const place = (next: View) => {
    viewRef.current = next;
    const stage = stageRef.current;
    if (stage) stage.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    setReady(true);
  };

  const frameSize = () => {
    const frame = frameRef.current;
    return { width: frame?.clientWidth ?? 0, height: frame?.clientHeight ?? 0 };
  };

  useLayoutEffect(() => {
    let live = true;
    const run = () => {
      if (!live) return;
      const { width, height } = frameSize();
      if (width < 40 || height < 40) {
        requestAnimationFrame(run);
        return;
      }
      place(opening(width, height, pieces, marks, editable));
    };
    run();
    return () => {
      live = false;
    };
    // The first drawing is the one a guest should see. Later edits keep the view where they left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onResize = () => {
      if (touched.current) return;
      const { width, height } = frameSize();
      if (width < 40 || height < 40) return;
      place(opening(width, height, pieces, marks, editable));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pieces, marks, editable]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let pinch: { dist: number; scale: number; mx: number; my: number; x: number; y: number } | null = null;
    let pan: { x: number; y: number; px: number; py: number } | null = null;

    const local = (touch: Touch) => {
      const rect = frame.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const onShape = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(".seat-piece, .seat-handle-hit"));

    const start = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        const a = local(event.touches[0]);
        const b = local(event.touches[1]);
        const current = viewRef.current;
        pinch = {
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          scale: current.scale,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
          x: current.x,
          y: current.y,
        };
        pan = null;
        pinchRef.current?.();
        event.preventDefault();
        return;
      }
      if (onShape(event.target)) return;
      const point = local(event.touches[0]);
      pan = { x: viewRef.current.x, y: viewRef.current.y, px: point.x, py: point.y };
    };

    const move = (event: TouchEvent) => {
      if (event.touches.length >= 2 && pinch) {
        event.preventDefault();
        const a = local(event.touches[0]);
        const b = local(event.touches[1]);
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const scale = Math.max(0.28, Math.min(3.2, pinch.scale * (dist / pinch.dist)));
        const roomX = (pinch.mx - pinch.x) / pinch.scale;
        const roomY = (pinch.my - pinch.y) / pinch.scale;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        touched.current = true;
        place({ scale, x: mx - roomX * scale, y: my - roomY * scale });
        return;
      }
      if (!pan || event.touches.length !== 1) return;
      event.preventDefault();
      const point = local(event.touches[0]);
      if (Math.hypot(point.x - pan.px, point.y - pan.py) > 3) touched.current = true;
      place({ ...viewRef.current, x: pan.x + (point.x - pan.px), y: pan.y + (point.y - pan.py) });
    };

    const end = () => {
      pinch = null;
      pan = null;
    };

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const current = viewRef.current;
      const scale = Math.max(0.28, Math.min(3.2, current.scale * (event.deltaY < 0 ? 1.08 : 0.92)));
      const roomX = (px - current.x) / current.scale;
      const roomY = (py - current.y) / current.scale;
      touched.current = true;
      place({ scale, x: px - roomX * scale, y: py - roomY * scale });
    };

    frame.addEventListener("touchstart", start, { passive: false });
    frame.addEventListener("touchmove", move, { passive: false });
    frame.addEventListener("touchend", end);
    frame.addEventListener("touchcancel", end);
    frame.addEventListener("wheel", wheel, { passive: false });
    return () => {
      frame.removeEventListener("touchstart", start);
      frame.removeEventListener("touchmove", move);
      frame.removeEventListener("touchend", end);
      frame.removeEventListener("touchcancel", end);
      frame.removeEventListener("wheel", wheel);
    };
  }, []);

  function mouseDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".seat-piece, .seat-handle-hit")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = viewRef.current;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) touched.current = true;
      place({ ...viewRef.current, x: origin.x + (ev.clientX - startX), y: origin.y + (ev.clientY - startY) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function showRoom() {
    const { width, height } = frameSize();
    touched.current = true;
    place(viewFor(width, height, ROOM, 0));
  }

  function showSeat() {
    const ids = [...new Set(marks.map((mark) => mark.pieceId))];
    if (!ids.length) return;
    const id = ids[seatCursor.current % ids.length];
    seatCursor.current += 1;
    const piece = pieces.find((item) => item.id === id);
    if (!piece) return;
    const { width, height } = frameSize();
    touched.current = true;
    const box = expand(pieceBox(piece), 150);
    const next = viewFor(width, height, box, 0.75);
    if (next.scale <= 1.15) {
      place(next);
      return;
    }
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    place({ scale: 1.15, x: width / 2 - cx * 1.15, y: height / 2 - cy * 1.15 });
  }

  function zoomBy(factor: number) {
    const { width, height } = frameSize();
    const current = viewRef.current;
    const scale = Math.max(0.28, Math.min(3.2, current.scale * factor));
    const roomX = (width / 2 - current.x) / current.scale;
    const roomY = (height / 2 - current.y) / current.scale;
    touched.current = true;
    place({ scale, x: width / 2 - roomX * scale, y: height / 2 - roomY * scale });
  }

  return (
    <div className="seat-viewer">
      <div
        className={ready ? "seat-viewport is-ready" : "seat-viewport"}
        ref={frameRef}
        onPointerDown={mouseDown}
      >
        <div className="seat-stage" ref={stageRef}>
          <SeatMap
            pieces={pieces}
            marks={marks}
            selectedId={selectedId}
            editable={editable}
            svgRef={svgRef}
            onBackgroundPointerDown={onBackgroundPointerDown}
            onPiecePointerDown={onPiecePointerDown}
            onHandlePointerDown={onHandlePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      </div>
      <div className="seat-controls">
        {marks.length ? (
          <button type="button" onClick={showSeat}>
            Your seat
          </button>
        ) : null}
        <button type="button" onClick={showRoom}>
          Whole room
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          −
        </button>
      </div>
      <p className="seat-hint">
        {editable
          ? "Drag a shape to move it. Drag the empty floor to look around. Pinch, or use the buttons, to see it larger."
          : "Drag to move around the room. Pinch, or use the buttons, to see your seat larger."}
      </p>
    </div>
  );
}
