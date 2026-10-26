// Writing practice: styles, grading a recall, and which words can be
// written at all. Safe on server and client.

import excluded from "./writing-excluded.json";

/** trace: trace the word over its outline, then write it from memory.
 *  recall: write it from memory only. */
export type WritingStyle = "trace" | "recall";

/** The builder's style control. */
export const WRITING_STYLE_LABELS: Record<WritingStyle, string> = {
  trace: "Trace first",
  recall: "Recall only",
};

/** The session top bar's control. */
export const WRITING_STYLE_SHORT: Record<WritingStyle, string> = {
  trace: "Trace",
  recall: "Recall",
};

export function parseWritingStyle(value: unknown): WritingStyle | null {
  return value === "trace" || value === "recall" ? value : null;
}

/** reviews.mode for a saved recall. Only a recall is ever saved. */
export const WRITING_MODE = "writing_recall";

/** Misses on one stroke before hanzi-writer shows its hint. A hint in
 *  Recall (this one included) makes the word Still learning. */
export const TRACE_HINT_AFTER = 1;
export const RECALL_HINT_AFTER = 3;

/** Mistakes a recall may have and still be Got it: 15% of the word's
 *  strokes, at least 1. */
export function allowedMistakes(totalStrokes: number) {
  return Math.max(1, Math.round(totalStrokes * 0.15));
}

export interface RecallResult {
  mistakes: number;
  totalStrokes: number;
  /** The Hint button, or hanzi-writer's own hint after RECALL_HINT_AFTER
   *  misses on a stroke. */
  usedHint: boolean;
  /** "I don't know". */
  gaveUp: boolean;
}

/** Got it: within the allowed mistakes, with no hint and no giving up. */
export function recallGotIt(result: RecallResult) {
  return !result.gaveUp && !result.usedHint && result.mistakes <= allowedMistakes(result.totalStrokes);
}

const HANZI = /\p{Script=Han}/u;

/** Characters with no stroke data (scripts/check-stroke-data.ts). */
const EXCLUDED: ReadonlySet<string> = new Set(excluded.chars);

/** Whether the writing pad can write every character of the word. */
export function isWritable(simplified: string) {
  const chars = [...simplified];
  return chars.length > 0 && chars.every((c) => HANZI.test(c) && !EXCLUDED.has(c));
}

/** How a card is shown when it's a writing card: Trace first (a new card,
 *  or a first showing in Trace practice) or Recall only. */
export interface WritingShowing {
  trace: boolean;
}
