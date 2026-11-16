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

function shownText(piece: SeatPiece) {
  if (piece.kind === "arrow" || piece.kind === "text") return piece.text.trim();
  if (piece.seat) {
    const text = piece.text.trim();
    const numbered = text.match(/^(?:chair|seat)\s+(\S+)$/i);
    return (numbered ? numbered[1] : text) || piece.table.trim();
  }
  return (piece.table || piece.text).trim();
}

function drawnLine(piece: SeatPiece): { text: string; size: number } | null {
  if (piece.kind === "arrow") return piece.text ? { text: piece.text, size: 22 } : null;
  if (piece.kind === "text") return piece.text ? { text: piece.text, size: Math.max(20, Math.min(48, piece.h * 0.66)) } : null;
  const text = shownText(piece);
  if (!text) return null;
  const innerW = (piece.kind === "ellipse" ? piece.w * 0.62 : piece.w * 0.8) - 6;
  const innerH = piece.h * 0.62;
  const size = Math.min(40, innerH, innerW / Math.max(1, text.length * 0.58));
  if (size < 13) return null;
  return { text, size };
}

function openSide(piece: SeatPiece, pieces: SeatPiece[]) {
  const box = pieceBox(piece);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const room = { up: box.y - 8, down: 692 - (box.y + box.h), left: box.x - 8, right: 992 - (box.x + box.w) };
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    const next = pieceBox(other);
    const overlapX = Math.min(box.x + box.w, next.x + next.w) - Math.max(box.x, next.x);
    const overlapY = Math.min(box.y + box.h, next.y + next.h) - Math.max(box.y, next.y);
    if (overlapX > -12) {
      if (next.y + next.h <= cy) room.up = Math.min(room.up, box.y - (next.y + next.h));
      if (next.y >= cy) room.down = Math.min(room.down, next.y - (box.y + box.h));
    }
    if (overlapY > -12) {
      if (next.x + next.w <= cx) room.left = Math.min(room.left, box.x - (next.x + next.w));
      if (next.x >= cx) room.right = Math.min(room.right, next.x - (box.x + box.w));
    }
  }
  return (Object.entries(room) as [keyof typeof room, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

function chairCrest(piece: SeatPiece) {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  const rx = piece.w / 2 + 7;
  const ry = piece.h / 2 + 7;
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)];
  };
  const [x1, y1] = point(206);
  const [x2, y2] = point(334);
  return `M ${x1} ${y1} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;
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
        <marker id="seat-you-head" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1,1 L13,7 L1,13 Z" fill="#8c6a3d" />
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
          pieces={pieces}
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
  pieces,
  names,
  editable,
  onPiecePointerDown,
}: {
  piece: SeatPiece;
  pieces: SeatPiece[];
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
      {piece.seat && piece.kind === "ellipse" ? <path className="seat-crest" d={chairCrest(piece)} /> : null}
      {piece.seat && piece.kind === "rect" ? (
        <rect className="seat-crest-bar" x={piece.x + 10} y={piece.y - 16} width={Math.max(12, piece.w - 20)} height={10} rx="5" />
      ) : null}
      {line ? (
        <text className="seat-label" x={cx} y={cy} textAnchor="middle" fontSize={line.size} fontWeight={600} fill="#2b221c">
          {line.text}
        </text>
      ) : null}
      {hot && !editable ? <YouArrow piece={piece} side={openSide(piece, pieces)} /> : null}
      <title>{who ? `${who}. ${seatPlace(piece)}` : seatPlace(piece)}</title>
    </g>
  );
}

function YouArrow({ piece, side }: { piece: SeatPiece; side: "up" | "down" | "left" | "right" }) {
  const box = pieceBox(piece);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const gap = 16;
  const len = 36;
  const tipX = side === "left" ? box.x - gap : side === "right" ? box.x + box.w + gap : cx;
  const tipY = side === "up" ? box.y - gap : side === "down" ? box.y + box.h + gap : cy;
  const tailX = side === "left" ? tipX - len : side === "right" ? tipX + len : cx;
  const tailY = side === "up" ? tipY - len : side === "down" ? tipY + len : cy;
  const textX = side === "left" ? tailX - 8 : side === "right" ? tailX + 8 : cx;
  const textY = side === "up" ? tailY - 8 : side === "down" ? tailY + 24 : cy + 8;
  const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
  return (
    <g className="seat-you" pointerEvents="none">
      <text className="seat-you-label" x={textX} y={textY} textAnchor={anchor}>
        You
      </text>
      <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} className="seat-you-arrow" markerEnd="url(#seat-you-head)" />
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
