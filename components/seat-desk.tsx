"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { SeatViewer } from "@/components/seat-viewer";
import {
  clampPiece,
  seatPlace,
  type SeatAssignment,
  type SeatKind,
  type SeatPerson,
  type SeatPiece,
  type SeatingPlan,
} from "@/lib/seating";

type Drag = {
  id: string;
  mode: "move" | "resize" | "aim";
  px: number;
  py: number;
  origin: SeatPiece;
};

function chairLabel(piece: SeatPiece, index: number, assignments: SeatAssignment[]) {
  const place = [piece.table, piece.text].filter(Boolean).join(", ") || `Chair ${index + 1}`;
  const who = assignments.filter((row) => row.pieceId === piece.id).map((row) => row.name);
  return who.length ? `${place} — ${who.join(", ")}` : place;
}

export function SeatDesk({ initial, people }: { initial: SeatingPlan; people: SeatPerson[] }) {
  const [pieces, setPieces] = useState(initial.pieces);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pendingMove = useRef<SeatPiece | null>(null);
  const paint = useRef(0);
  const current = pieces.find((piece) => piece.id === selected) ?? null;
  const chairs = pieces.filter((piece) => piece.seat);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (!selected) return;
      if (event.key === "Delete") {
        event.preventDefault();
        remove(selected);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const delta =
        event.key === "ArrowLeft"
          ? [-step, 0]
          : event.key === "ArrowRight"
            ? [step, 0]
            : event.key === "ArrowUp"
              ? [0, -step]
              : event.key === "ArrowDown"
                ? [0, step]
                : null;
      if (!delta) return;
      event.preventDefault();
      setPieces((prev) =>
        prev.map((piece) => (piece.id === selected ? clampPiece({ ...piece, x: piece.x + delta[0], y: piece.y + delta[1] }) : piece)),
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function pointOf(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }

  function add(kind: SeatKind) {
    const id = crypto.randomUUID();
    const n = pieces.length;
    const x = 70 + (n % 8) * 26;
    const y = 64 + (n % 5) * 24;
    const piece: SeatPiece =
      kind === "arrow"
        ? { id, kind, x, y, w: 170, h: 36, text: "", table: "", seat: false }
        : kind === "text"
          ? { id, kind, x, y, w: 180, h: 40, text: "Label", table: "", seat: false }
          : kind === "ellipse"
            ? { id, kind, x, y, w: 96, h: 96, text: "", table: "", seat: true }
            : { id, kind, x, y, w: 220, h: 130, text: "", table: "", seat: false };
    setPieces((prev) => [...prev, clampPiece(piece)]);
    setSelected(id);
    setNote("");
    setError("");
  }

  function patch(id: string, next: Partial<SeatPiece>) {
    setPieces((prev) => prev.map((piece) => (piece.id === id ? clampPiece({ ...piece, ...next }) : piece)));
    if (next.seat === false) setAssignments((prev) => prev.filter((row) => row.pieceId !== id));
    setNote("");
  }

  function remove(id: string) {
    setPieces((prev) => prev.filter((piece) => piece.id !== id));
    setAssignments((prev) => prev.filter((row) => row.pieceId !== id));
    setSelected((currentId) => (currentId === id ? null : currentId));
    setNote("");
  }

  function order(forward: boolean) {
    if (!selected) return;
    setPieces((prev) => {
      const index = prev.findIndex((piece) => piece.id === selected);
      if (index < 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(index, 1);
      if (!item) return prev;
      if (forward) next.push(item);
      else next.unshift(item);
      return next;
    });
    setNote("");
  }

  function assign(person: SeatPerson, pieceId: string) {
    setAssignments((prev) => {
      const rest = prev.filter((row) => !(row.inviteId === person.inviteId && row.name.toLowerCase() === person.name.toLowerCase()));
      if (!pieceId) return rest;
      return [...rest, { inviteId: person.inviteId, name: person.name, pieceId }];
    });
    setNote("");
  }

  function startDrag(event: PointerEvent, id: string, mode: Drag["mode"]) {
    const piece = pieces.find((item) => item.id === id);
    if (!piece) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointOf(event);
    drag.current = { id, mode, px: point.x, py: point.y, origin: piece };
    setSelected(id);
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function commitMove() {
    const next = pendingMove.current;
    pendingMove.current = null;
    if (!next) return;
    setPieces((prev) => prev.map((piece) => (piece.id === next.id ? next : piece)));
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active) return;
    const point = pointOf(event);
    const dx = point.x - active.px;
    const dy = point.y - active.py;
    const moved =
      active.mode === "move"
        ? clampPiece({ ...active.origin, x: active.origin.x + dx, y: active.origin.y + dy })
        : clampPiece({ ...active.origin, w: active.origin.w + dx, h: active.origin.h + dy });
    pendingMove.current = moved;
    if (paint.current) return;
    paint.current = requestAnimationFrame(() => {
      paint.current = 0;
      commitMove();
    });
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (paint.current) cancelAnimationFrame(paint.current);
    paint.current = 0;
    commitMove();
    if (!drag.current) return;
    drag.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/seating", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pieces, assignments }),
      });
      const data = (await res.json().catch(() => null)) as { seating?: SeatingPlan; error?: string } | null;
      if (!res.ok || !data?.seating) {
        setError(data?.error || "Could not save the seating.");
        return;
      }
      setPieces(data.seating.pieces);
      setAssignments(data.seating.assignments);
      setNote("Saved.");
    } catch {
      setError("Could not save the seating.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="desk-section" id="seating">
      <h2>Seating</h2>
      <p className="seat-lead">
        Draw the room with a rectangle, a circle, words, or an arrow. Name the table and the chair, mark each chair, then give every guest a seat. The words on a shape are what every guest can see. A guest’s own name appears only from their invitation.
      </p>
      <div className="seat-tools">
        <button type="button" className="seat-tool" onClick={() => add("rect")}>
          Rectangle
        </button>
        <button type="button" className="seat-tool" onClick={() => add("ellipse")}>
          Circle
        </button>
        <button type="button" className="seat-tool" onClick={() => add("text")}>
          Text
        </button>
        <button type="button" className="seat-tool" onClick={() => add("arrow")}>
          Arrow
        </button>
      </div>
      <div className="seat-editor">
        <SeatViewer
          pieces={pieces}
          selectedId={selected}
          editable
          svgRef={svgRef}
          onPinchStart={() => {
            drag.current = null;
          }}
          onBackgroundPointerDown={() => setSelected(null)}
          onPiecePointerDown={(event, id) => startDrag(event, id, "move")}
          onHandlePointerDown={(event, id, mode) => startDrag(event, id, mode)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        />
        <aside className="seat-fields">
          {current ? (
            <>
              <label className="seat-field">
                <span>Table</span>
                <input value={current.table} maxLength={48} onChange={(event) => patch(current.id, { table: event.target.value })} />
              </label>
              <label className="seat-field">
                <span>{current.kind === "text" || current.kind === "arrow" ? "Words" : "Chair"}</span>
                <input value={current.text} maxLength={48} onChange={(event) => patch(current.id, { text: event.target.value })} />
              </label>
              <label className="seat-check">
                <input
                  type="checkbox"
                  checked={current.seat}
                  onChange={(event) => patch(current.id, { seat: event.target.checked })}
                />
                This is a chair
              </label>
              <p className="form-note">{current.seat ? seatPlace(current) : "Not a chair yet. Check the box to assign a guest here."}</p>
              <div className="seat-field-actions">
                <button type="button" className="text-button" onClick={() => order(true)}>
                  Bring forward
                </button>
                <button type="button" className="text-button" onClick={() => order(false)}>
                  Send back
                </button>
                <button type="button" className="text-button danger" onClick={() => remove(current.id)}>
                  Remove
                </button>
              </div>
            </>
          ) : (
            <p className="form-note">Select a shape to name it. A circle starts as a chair. A rectangle starts as a table. Drag a shape to move it, and drag the gold dot to change its size. Arrow keys nudge the selected shape.</p>
          )}
        </aside>
      </div>
      <h3 className="seat-assign-title">Assign a seat</h3>
      <p className="form-note">A name appears here the first time that guest opens their invitation.</p>
      {people.length === 0 ? (
        <p className="form-note">A guest’s name appears here after they open their invitation. Then you can give each person a chair.</p>
      ) : (
        <ul className="seat-people">
          {people.map((person) => {
            const chosen = assignments.find((row) => row.inviteId === person.inviteId && row.name.toLowerCase() === person.name.toLowerCase());
            return (
              <li key={`${person.inviteId}-${person.name}`}>
                <label className="seat-field">
                  <span>{person.name}</span>
                  <select value={chosen?.pieceId ?? ""} onChange={(event) => assign(person, event.target.value)}>
                    <option value="">No seat yet</option>
                    {chairs.map((chair, index) => (
                      <option key={chair.id} value={chair.id}>
                        {chairLabel(chair, index, assignments)}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {chairs.length === 0 ? <p className="form-note">Mark a shape as a chair before a guest can be seated there.</p> : null}
      <div className="seat-save">
        <button type="button" className="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save the map"}
        </button>
        {note ? <p className="form-note" aria-live="polite">{note}</p> : null}
        {error ? <p className="form-error" aria-live="polite">{error}</p> : null}
      </div>
    </section>
  );
}
