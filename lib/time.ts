export const WEDDING_TIME_ZONE = "America/Los_Angeles";

/** Start of 10 April 2027 in America/Los_Angeles. */
export function weddingTargetMs(now = Date.now()): number {
  return zonedTimeToUtc(2027, 4, 10, 0, 0, 0, WEDDING_TIME_ZONE, now);
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  elapsed: boolean;
};

export function countdownParts(nowMs: number, targetMs = weddingTargetMs(nowMs)): CountdownParts {
  const delta = targetMs - nowMs;
  if (delta <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, elapsed: true };
  }
  const total = Math.floor(delta / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds, elapsed: false };
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - utcMs;
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
  hintMs: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - zoneOffsetMs(guess, timeZone);
  utc = guess - zoneOffsetMs(utc, timeZone);
  // One more pass settles the spring-forward gap if the hint is far away.
  utc = guess - zoneOffsetMs(utc, timeZone);
  void hintMs;
  return utc;
}
