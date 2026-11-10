import type { PointerEvent, Ref } from "react";
import type { SeatPiece } from "@/lib/seating";
import { seatPlace } from "@/lib/seating";

export type SeatMark = { pieceId: string; name: string };

export type SeatBox = { x: number; y: number; w: number; h: number };

type Props = {
  pieces: SeatPiece[];
  marks?: SeatMark[];
  selectedId?: string | null;
  editable?: boolean;
  svgRef?: Ref<SVGSVGElement>;
  onBackgroundPointerDown?: (event: PointerEvent<SVGRectElement>) => void;
  onPiecePointerDown?: (event: PointerEvent<SVGGElement>, id: string) => void;
  onHandlePointerDown?: (event: PointerEvent<SVGCircleElement>, id: string, mode: "resize" | "aim") => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
};

export function pieceBox(piece: SeatPiece): SeatBox {
  if (piece.kind === "arrow") {
    const x2 = piece.x + piece.w;
    const y2 = piece.y + piece.h;
    return { x: Math.min(piece.x, x2), y: Math.min(piece.y, y2), w: Math.abs(piece.w) || 24, h: Math.abs(piece.h) || 24 };
  }
  return { x: piece.x, y: piece.y, w: piece.w, h: piece.h };
}

function drawnLine(piece: SeatPiece): { text: string; size: number } | null {
  if (piece.kind === "arrow") return piece.text ? { text: piece.text, size: 22 } : null;
  if (piece.kind === "text") return piece.text ? { text: piece.text, size: Math.max(20, Math.min(48, piece.h * 0.66)) } : null;
  const text = piece.seat ? piece.text || piece.table : piece.table || piece.text;
  if (!text) return null;
  const innerW = piece.kind === "ellipse" ? piece.w * 0.66 : piece.w * 0.84;
  const innerH = piece.h * 0.7;
  const size = Math.min(42, innerH * 0.72, innerW / Math.max(1, text.length * 0.54));
  if (size < 12) return null;
  return { text, size };
}

function chairBack(piece: SeatPiece) {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  const rx = Math.max(8, piece.w / 2 - 7);
  const ry = Math.max(8, piece.h / 2 - 7);
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)];
  };
  const [x1, y1] = point(-150);
  const [x2, y2] = point(-30);
  return `M ${x1} ${y1} A ${rx} ${ry} 0 0 0 ${x2} ${y2}`;
}

export function SeatMap({
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
}: Props) {
  const named = new Map<string, string[]>();
  for (const mark of marks) {
    const list = named.get(mark.pieceId) ?? [];
    list.push(mark.name);
    named.set(mark.pieceId, list);
  }
  const ordered = [...pieces.filter((piece) => !named.has(piece.id)), ...pieces.filter((piece) => named.has(piece.id))];
  const selected = pieces.find((piece) => piece.id === selectedId) ?? null;

  return (
    <svg
      ref={svgRef}
      className={editable ? "seat-map seat-map-edit" : "seat-map"}
      viewBox="0 0 1000 700"
      role="group"
      aria-label={editable ? "Seating map editor" : "Seating map"}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <pattern id="seat-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(43,34,28,0.09)" strokeWidth="1" />
        </pattern>
        <marker id="seat-arrowhead" markerWidth="16" markerHeight="16" refX="13" refY="8" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L15,8 L1,15 Z" fill="#2b221c" />
        </marker>
      </defs>
      <rect className="seat-board" width="1000" height="700" fill="#f3eadc" onPointerDown={onBackgroundPointerDown} />
      {editable ? <rect width="1000" height="700" fill="url(#seat-grid)" pointerEvents="none" /> : null}
      <rect className="seat-frame" x="18" y="18" width="964" height="664" rx="22" pointerEvents="none" />
      <rect className="seat-frame-inner" x="28" y="28" width="944" height="644" rx="16" pointerEvents="none" />
      {ordered.map((piece) => (
        <Piece
          key={piece.id}
          piece={piece}
          names={named.get(piece.id) ?? []}
          editable={editable}
          onPiecePointerDown={onPiecePointerDown}
        />
      ))}
      {editable && selected ? <Handles piece={selected} onHandlePointerDown={onHandlePointerDown} /> : null}
    </svg>
  );
}

function Piece({
  piece,
  names,
  editable,
  onPiecePointerDown,
}: {
  piece: SeatPiece;
  names: string[];
  editable: boolean;
  onPiecePointerDown?: (event: PointerEvent<SVGGElement>, id: string) => void;
}) {
  const line = drawnLine(piece);
  const hot = names.length > 0;
  const box = pieceBox(piece);
  const down = editable && onPiecePointerDown ? (event: PointerEvent<SVGGElement>) => onPiecePointerDown(event, piece.id) : undefined;
  const who = names.join(" and ");
  const cx = piece.kind === "arrow" ? piece.x + piece.w / 2 : piece.x + piece.w / 2;
  const cy = piece.kind === "arrow" ? piece.y + piece.h / 2 - 18 : piece.y + piece.h / 2 + (line ? line.size * 0.34 : 0);
  const shapeClass = hot ? "seat-shape is-hot" : piece.seat ? "seat-shape is-chair" : "seat-shape is-table";

  return (
    <g className={hot ? "seat-piece is-hot" : "seat-piece"} data-hot={hot ? "1" : undefined} onPointerDown={down}>
      {hot && piece.kind === "ellipse" ? (
        <ellipse className="seat-halo" cx={piece.x + piece.w / 2} cy={piece.y + piece.h / 2} rx={piece.w / 2 + 10} ry={piece.h / 2 + 10} />
      ) : null}
      {hot && piece.kind !== "ellipse" ? (
        <rect className="seat-halo" x={box.x - 8} y={box.y - 8} width={box.w + 16} height={box.h + 16} rx="18" />
      ) : null}
      {piece.kind === "rect" ? (
        <rect x={piece.x} y={piece.y} width={piece.w} height={piece.h} rx={piece.seat ? 16 : 22} className={shapeClass} />
      ) : null}
      {piece.kind === "ellipse" ? (
        <ellipse cx={piece.x + piece.w / 2} cy={piece.y + piece.h / 2} rx={piece.w / 2} ry={piece.h / 2} className={shapeClass} />
      ) : null}
      {piece.kind === "text" ? <rect className="seat-text-hit" x={piece.x} y={piece.y} width={piece.w} height={piece.h} /> : null}
      {piece.kind === "arrow" ? (
        <>
          <line x1={piece.x} y1={piece.y} x2={piece.x + piece.w} y2={piece.y + piece.h} className="seat-arrow-hit" />
          <line x1={piece.x} y1={piece.y} x2={piece.x + piece.w} y2={piece.y + piece.h} className="seat-arrow" markerEnd="url(#seat-arrowhead)" />
        </>
      ) : null}
      {piece.seat && piece.kind === "ellipse" ? <path className="seat-back" d={chairBack(piece)} /> : null}
      {piece.seat && piece.kind === "rect" ? (
        <path className="seat-back" d={`M ${piece.x + 16} ${piece.y + 18} H ${piece.x + piece.w - 16}`} />
      ) : null}
      {line ? (
        <text className="seat-label" x={cx} y={cy} textAnchor="middle" fontSize={line.size} fontWeight={600} fill="#2b221c">
          {line.text}
        </text>
      ) : null}
      <title>{who ? `${who}. ${seatPlace(piece)}` : seatPlace(piece)}</title>
    </g>
  );
}

function Handles({
  piece,
  onHandlePointerDown,
}: {
  piece: SeatPiece;
  onHandlePointerDown?: (event: PointerEvent<SVGCircleElement>, id: string, mode: "resize" | "aim") => void;
}) {
  const box = pieceBox(piece);
  const mode = piece.kind === "arrow" ? "aim" : "resize";
  const cx = piece.kind === "arrow" ? piece.x + piece.w : box.x + box.w;
  const cy = piece.kind === "arrow" ? piece.y + piece.h : box.y + box.h;
  return (
    <g className="seat-handles">
      <rect className="seat-selected" x={box.x - 6} y={box.y - 6} width={box.w + 12} height={box.h + 12} />
      <circle
        className="seat-handle-hit"
        cx={cx}
        cy={cy}
        r="26"
        onPointerDown={onHandlePointerDown ? (event) => onHandlePointerDown(event, piece.id, mode) : undefined}
      />
      <circle className={mode === "aim" ? "seat-handle seat-handle-aim" : "seat-handle"} cx={cx} cy={cy} r="11" />
    </g>
  );
}
