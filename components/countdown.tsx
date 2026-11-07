"use client";

import { useEffect, useState } from "react";
import { WEDDING_PLACE } from "@/lib/mark";
import { countdownParts, type CountdownParts } from "@/lib/time";

function label(value: number | null, singular: string, plural: string) {
  if (value === 1) return singular;
  return plural;
}

function figure(value: number | null, padded: boolean) {
  if (value === null) return "–";
  return padded ? String(value).padStart(2, "0") : String(value);
}

export function Countdown() {
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      setParts(countdownParts(now));
      timer = window.setTimeout(tick, 1000 - (now % 1000) + 15);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  const days = parts?.days ?? null;
  const hours = parts?.hours ?? null;
  const minutes = parts?.minutes ?? null;
  const seconds = parts?.seconds ?? null;
  const spoken = parts
    ? parts.elapsed
      ? `April 10, 2027 has arrived in ${WEDDING_PLACE}.`
      : `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, and ${parts.seconds} seconds until April 10, 2027, Pacific time`
    : "Counting down to April 10, 2027, Pacific time";

  return (
    <div className="countdown-block">
      <div className="countdown" role="timer" aria-label={spoken}>
        <div className="tick">
          <b>{figure(days, false)}</b>
          <span>{label(days, "day", "days")}</span>
        </div>
        <div className="tick">
          <b>{figure(hours, true)}</b>
          <span>{label(hours, "hour", "hours")}</span>
        </div>
        <div className="tick">
          <b>{figure(minutes, true)}</b>
          <span>{label(minutes, "minute", "minutes")}</span>
        </div>
        <div className="tick">
          <b>{figure(seconds, true)}</b>
          <span>{label(seconds, "second", "seconds")}</span>
        </div>
      </div>
      <p className="countdown-note">
        {parts?.elapsed
          ? "The day is here."
          : "Pacific time, to the first minute of April 10."}
      </p>
    </div>
  );
}
