export function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 60) return null;
  return name;
}

export function cleanLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 140) return null;
  return name;
}

export function familyLine(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || name.trim();
  return `${last} Family`;
}

/** One or two invitation names, and the lines the envelope intro and header use. */
export function invitationLines(party: string[]): { family: string; header: string; label: string } {
  const people = party
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!people.length) return { family: "", header: "", label: "" };
  if (people.length === 1) {
    const last = people[0].split(" ").pop() || people[0];
    return { family: `${last} Family`, header: people[0], label: people[0] };
  }
  const lasts = people.map((item) => item.split(" ").pop() || item);
  const firsts = people.map((item) => item.split(" ")[0] || item);
  const shared = lasts[0].toLowerCase() === lasts[1].toLowerCase();
  return {
    family: shared ? `${lasts[0]} Family` : `${lasts[0]} and ${lasts[1]} Family`,
    header: `${firsts[0]} and ${firsts[1]}`,
    label: `${people[0]} and ${people[1]}`,
  };
}
