export type SeatKind = "rect" | "ellipse" | "text" | "arrow";

export type SeatPiece = {
  id: string;
  kind: SeatKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  table: string;
  seat: boolean;
};

export type SeatAssignment = {
  inviteId: string;
  name: string;
  pieceId: string;
};

export type SeatingPlan = {
  pieces: SeatPiece[];
  assignments: SeatAssignment[];
};

export type SeatPerson = {
  inviteId: string;
  name: string;
};

const KINDS = new Set<SeatKind>(["rect", "ellipse", "text", "arrow"]);
const ID = /^[A-Za-z0-9-]{8,80}$/;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.max(min, Math.min(max, n));
  return Math.round((clamped + Number.EPSILON) * 10) / 10;
}

export function emptySeating(): SeatingPlan {
  return { pieces: [], assignments: [] };
}

export function asSeating(value: unknown, people?: SeatPerson[]): SeatingPlan {
  const row = value && typeof value === "object" ? (value as { pieces?: unknown; assignments?: unknown }) : {};
  const pieces: SeatPiece[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(row.pieces) ? row.pieces : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const kind = typeof raw.kind === "string" ? raw.kind : "";
    if (!ID.test(id) || seen.has(id) || !KINDS.has(kind as SeatKind)) continue;
    seen.add(id);
    const arrow = kind === "arrow";
    pieces.push({
      id,
      kind: kind as SeatKind,
      x: num(raw.x, -400, 1400, 40),
      y: num(raw.y, -400, 1100, 40),
      w: num(raw.w, arrow ? -1200 : 16, arrow ? 1200 : 900, arrow ? 120 : 80),
      h: num(raw.h, arrow ? -900 : 16, arrow ? 900 : 700, arrow ? 0 : 56),
      text: clean(raw.text, 48),
      table: clean(raw.table, 48),
      seat: raw.seat === true,
    });
    if (pieces.length >= 180) break;
  }

  const chairs = new Set(pieces.filter((piece) => piece.seat).map((piece) => piece.id));
  const known = new Map<string, string>();
  if (people) {
    for (const person of people) {
      const name = clean(person.name, 60);
      if (!ID.test(person.inviteId) || !name) continue;
      known.set(`${person.inviteId}\n${name.toLowerCase()}`, name);
    }
  }

  const assignments: SeatAssignment[] = [];
  const used = new Set<string>();
  const rows = Array.isArray(row.assignments) ? row.assignments : [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const inviteId = typeof raw.inviteId === "string" ? raw.inviteId : "";
    const name = clean(raw.name, 60);
    const pieceId = typeof raw.pieceId === "string" ? raw.pieceId : "";
    if (!ID.test(inviteId) || !name || !chairs.has(pieceId)) continue;
    const key = `${inviteId}\n${name.toLowerCase()}`;
    if (used.has(key)) continue;
    if (people && !known.has(key)) continue;
    used.add(key);
    assignments.push({ inviteId, name: people ? known.get(key) || name : name, pieceId });
    if (assignments.length >= 400) break;
  }

  return { pieces, assignments };
}

export function clampPiece(piece: SeatPiece): SeatPiece {
  return asSeating({ pieces: [piece], assignments: [] }).pieces[0] ?? piece;
}

export type SeatGroup = {
  inviteId: string;
  label: string;
  names: string[];
};

function sameName(a: string, b: string) {
  return a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name.trim();
}

export function seatGroups(invites: { id: string; party: string[]; names: string[] }[]): SeatGroup[] {
  const groups: SeatGroup[] = [];
  for (const invite of invites) {
    const names: string[] = [];
    for (const raw of [...invite.party, ...invite.names]) {
      const name = raw.trim().replace(/\s+/g, " ");
      if (!name || names.some((item) => sameName(item, name))) continue;
      names.push(name);
    }
    if (!names.length) continue;
    const lasts = names.map(lastName);
    const shared = lasts.every((item) => sameName(item, lasts[0]));
    groups.push({ inviteId: invite.id, label: shared ? `${lasts[0]} Family` : names.join(" and "), names });
  }
  return groups;
}

/** One full name, or the family name, finds that whole invitation. */
export function groupsForName(groups: SeatGroup[], query: string): SeatGroup[] {
  const wanted = query.trim().replace(/\s+/g, " ").toLowerCase().replace(/^the\s+/, "");
  if (!wanted) return [];
  return groups.filter((group) => {
    if (group.label.toLowerCase() === wanted) return true;
    if (group.names.some((name) => sameName(name, wanted))) return true;
    const lasts = group.names.map(lastName);
    const shared = lasts.length > 0 && lasts.every((item) => sameName(item, lasts[0]));
    if (!shared) return false;
    const last = lasts[0].toLowerCase();
    return wanted === last || wanted === `${last} family`;
  });
}

export function peopleReadyToSeat(
  invites: { id: string; party: string[]; names: string[]; openedAt?: string; responded?: boolean }[],
  plan: SeatingPlan,
): SeatPerson[] {
  const visible = invites.filter(
    (invite) => Boolean(invite.openedAt) || invite.responded || plan.assignments.some((row) => row.inviteId === invite.id),
  );
  const people = peopleFromInvites(visible);
  for (const row of plan.assignments) {
    if (people.some((person) => person.inviteId === row.inviteId && sameName(person.name, row.name))) continue;
    people.push({ inviteId: row.inviteId, name: row.name });
  }
  return people;
}

export function peopleFromInvites(invites: { id: string; party: string[]; names: string[] }[]): SeatPerson[] {
  const out: SeatPerson[] = [];
  const seen = new Set<string>();
  for (const invite of invites) {
    const names = [...invite.party];
    for (const extra of invite.names) {
      if (!names.some((item) => item.toLowerCase() === extra.toLowerCase())) names.push(extra);
    }
    for (const name of names) {
      const key = `${invite.id}\n${name.toLowerCase()}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ inviteId: invite.id, name });
    }
  }
  return out;
}

function placeWord(kind: "Table" | "Chair", value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  const lead = kind === "Chair" ? "chair|seat" : "table";
  const prefixed = text.match(new RegExp(`^(?:${lead})\\b[\\s:-]*(.*)$`, "i"));
  if (prefixed) {
    const rest = prefixed[1].trim();
    return rest ? `${kind} ${rest}` : kind;
  }
  if (/^\d+[a-z]?$/i.test(text)) return `${kind} ${text}`;
  return text;
}

export function seatPlace(piece: SeatPiece): string {
  const table = placeWord("Table", piece.table);
  const chair = placeWord("Chair", piece.text);
  if (table && chair) return `${table}, ${chair}`;
  return table || chair || "Your seat";
}

export function seatsFor(plan: SeatingPlan, inviteId: string): { name: string; piece: SeatPiece; place: string }[] {
  const out: { name: string; piece: SeatPiece; place: string }[] = [];
  for (const assignment of plan.assignments) {
    if (assignment.inviteId !== inviteId) continue;
    const piece = plan.pieces.find((item) => item.id === assignment.pieceId && item.seat);
    if (!piece) continue;
    out.push({ name: assignment.name, piece, place: seatPlace(piece) });
  }
  return out;
}
