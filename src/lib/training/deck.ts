// Flashcard directions and the deck builder's sets, shared by the hub,
// the deck page and both sessions. Safe on server and client.

import { byLevel, levelLabel, STANDARD_LEVELS, type HskStandard } from "@/lib/hsk";
import type { Skill } from "@/lib/supabase/database.types";

import type { QueueItem, QueueWord } from "./queue";

/** Hanzi first (recognition) or meaning first (the reverse). */
export type Direction = "hanzi" | "meaning";

export const DIRECTION_LABELS: Record<Direction, string> = {
  hanzi: "Hanzi first",
  meaning: "Meaning first",
};

export function parseDirection(value: unknown): Direction | null {
  return value === "hanzi" || value === "meaning" ? value : null;
}

/** reviews.mode for a scheduled answer: a flashcard in either direction,
 *  a quiz or listening question in one of its formats, or a writing
 *  recall. */
export type ReviewMode =
  | "flashcard"
  | "flashcard_reverse"
  | "quiz_meaning"
  | "quiz_hanzi"
  | "quiz_pinyin"
  | "listen_hanzi"
  | "listen_meaning"
  | "writing_recall";

const REVIEW_MODES: readonly ReviewMode[] = [
  "flashcard",
  "flashcard_reverse",
  "quiz_meaning",
  "quiz_hanzi",
  "quiz_pinyin",
  "listen_hanzi",
  "listen_meaning",
  "writing_recall",
];

/** The card a mode's answer updates: a recall updates the writing card,
 *  everything else the recognition card. */
export function skillOf(mode: ReviewMode): Skill {
  return mode === "writing_recall" ? "writing" : "recognition";
}

export function reviewMode(direction: Direction): ReviewMode {
  return direction === "hanzi" ? "flashcard" : "flashcard_reverse";
}

export function isReviewMode(value: unknown): value is ReviewMode {
  return REVIEW_MODES.includes(value as ReviewMode);
}

/** Every level a deck set can name, in either standard (7 is HSK 3.0's
 *  bands 7 to 9). */
export const HSK_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

export type DeckSet = "mine" | "due" | `hsk${(typeof HSK_LEVELS)[number]}`;

/** The builder's sets for a standard: My words, Due soon, then each of
 *  the standard's levels (HSK 1 to 6, plus 7–9 in HSK 3.0). */
export function deckSets(standard: HskStandard): { id: DeckSet; label: string }[] {
  return [
    { id: "mine", label: "My words" },
    { id: "due", label: "Due soon" },
    ...STANDARD_LEVELS[standard].map((n) => ({ id: `hsk${n}` as DeckSet, label: levelLabel(n, standard) })),
  ];
}

/** `value` when it's one of the standard's sets, else null. */
export function parseDeckSet(value: unknown, standard: HskStandard): DeckSet | null {
  return deckSets(standard).find((s) => s.id === value)?.id ?? null;
}

/** `value` when it's a set in either standard (what a saved deck may
 *  hold; the builder falls back when it isn't one of the current
 *  standard's), else null. */
export function parseAnyDeckSet(value: unknown): DeckSet | null {
  return parseDeckSet(value, "hsk2") ?? parseDeckSet(value, "hsk3");
}

/** The level an "hskN" set names, or null for My words and Due soon. */
export function deckSetLevel(set: DeckSet): number | null {
  return set.startsWith("hsk") ? Number(set.slice(3)) : null;
}

/** The HSK set for a profile's target level in its standard. */
export function hskSet(level: number | null, standard: HskStandard): DeckSet {
  const levels = STANDARD_LEVELS[standard];
  const n = Math.min(Math.max(Math.round(level ?? 1), 1), levels[levels.length - 1]);
  return `hsk${n as (typeof HSK_LEVELS)[number]}`;
}

/** "Due soon": recognition cards due within this window. */
export const DUE_SOON_MS = 3 * 24 * 60 * 60_000;

/** Grid order everywhere in the builder, and a deck's order when it isn't
 *  shuffled: by level in the standard (words without one last), then id. */
export function byGridOrder(standard: HskStandard): (a: QueueWord, b: QueueWord) => number {
  return byLevel(standard);
}

/** A copy of `items` in grid order. */
export function inGridOrder(items: readonly QueueItem[], standard: HskStandard) {
  const order = byGridOrder(standard);
  return [...items].sort((a, b) => order(a.word, b.word));
}

/** Most words one deck can hold (every HSK word is about 5,000). */
export const MAX_DECK_WORDS = 6000;

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
