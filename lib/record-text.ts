/**
 * Pull the wedding record out of a storage reply.
 * The host may add its own HTML page before the JSON, after it, or both.
 */
export function parseRecord(text: string): unknown {
  const pattern = /\{\s*"revision"\s*:/g;
  let best: { revision: number; media: number; value: unknown } | null = null;
  let found = pattern.exec(text);
  while (found) {
    const slice = objectAt(text, found.index);
    if (slice) {
      try {
        const value = JSON.parse(slice) as { revision?: unknown; media?: unknown };
        if (value && typeof value === "object" && Array.isArray(value.media)) {
          const revision = typeof value.revision === "number" ? value.revision : 0;
          const media = value.media.length;
          if (!best || revision > best.revision || (revision === best.revision && media > best.media)) {
            best = { revision, media, value };
          }
        }
      } catch {
        /* this brace was inside the host page; keep looking */
      }
    }
    found = pattern.exec(text);
  }
  if (!best) throw new Error("Could not read the shared record");
  return best.value;
}

function objectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
