import type { HomeDetails } from "./types";

/** The photographs already in the three large story spots. */
export const DEFAULT_FEATURES: HomeDetails["features"] = [
  "39e1fd09-91bd-4e61-9ea8-481543d66601",
  "f8a8acff-b946-4304-9ece-e9f885a52ca4",
  "63e42b4f-ad26-419b-8a6e-22ce1f0a25a1",
];

const FEATURE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Null keeps the original wide photograph at the top of the page. */
export function storyBanner(value: unknown): string | null {
  if (typeof value !== "string" || !FEATURE_ID.test(value)) return null;
  return value;
}

export function storyFeatures(value: unknown): HomeDetails["features"] {
  if (!Array.isArray(value) || value.length !== 3) return [...DEFAULT_FEATURES];
  return value.map((item, index) => {
    if (item === null) return null;
    if (typeof item === "string" && FEATURE_ID.test(item)) return item;
    return DEFAULT_FEATURES[index];
  }) as HomeDetails["features"];
}
