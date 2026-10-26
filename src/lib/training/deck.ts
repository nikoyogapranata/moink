// Flashcard directions and the deck builder's sets, shared by the hub,
// the deck page and both sessions. Safe on server and client.

import type { QueueWord } from "./queue";

/** Hanzi first (recognition) or meaning first (the reverse). */
export type Direction = "hanzi" | "meaning";

export const DIRECTION_LABELS: Record<Direction, string> = {
  hanzi: "Hanzi first",
  meaning: "Meaning first",
};

export function parseDirection(value: unknown): Direction | null {
  return value === "hanzi" || value === "meaning" ? value : null;
}

/** reviews.mode for a scheduled answer in this direction. Both update the
 *  same recognition card. */
export type ReviewMode = "flashcard" | "flashcard_reverse";

export function reviewMode(direction: Direction): ReviewMode {
  return direction === "hanzi" ? "flashcard" : "flashcard_reverse";
}

export function isReviewMode(value: unknown): value is ReviewMode {
  return value === "flashcard" || value === "flashcard_reverse";
}

export const HSK_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type DeckSet = "mine" | "due" | `hsk${(typeof HSK_LEVELS)[number]}`;

export const DECK_SETS: { id: DeckSet; label: string }[] = [
  { id: "mine", label: "My words" },
  { id: "due", label: "Due soon" },
  ...HSK_LEVELS.map((n) => ({ id: `hsk${n}` as const, label: `HSK ${n}` })),
];

export function parseDeckSet(value: unknown): DeckSet | null {
  return DECK_SETS.find((s) => s.id === value)?.id ?? null;
}

/** The HSK set for a profile's target level (old HSK, 1 to 6). */
export function hskSet(level: number | null): DeckSet {
  const n = Math.min(Math.max(Math.round(level ?? 1), 1), 6);
  return `hsk${n as (typeof HSK_LEVELS)[number]}`;
}

/** "Due soon": recognition cards due within this window. */
export const DUE_SOON_MS = 3 * 24 * 60 * 60_000;

/** Grid order everywhere in the builder, and a deck's order when it isn't
 *  shuffled: by old-HSK level, then id. */
export function byGridOrder(a: QueueWord, b: QueueWord) {
  return a.hsk_level - b.hsk_level || a.id - b.id;
}

/** Most words one deck can hold (every HSK word is about 5,000). */
export const MAX_DECK_WORDS = 6000;

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
