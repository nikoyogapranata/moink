// HSK standards: which level a word has for a user, how words sort, and
// how levels are labelled. A user studies one standard
// (profiles.hsk_standard):
//
//   hsk2  old HSK 2.0: words.hsk_level 1 to 6, ordered by sort_order
//   hsk3  HSK 3.0, the 2025 syllabus: words.hsk3_2025_level 1 to 7 (7 is
//         bands 7 to 9), ordered by sort_order_2025
//
// The same rules live in SQL as public.word_level and public.word_sort
// (20261123120000_hsk_standard.sql); keep the two in step. A word can have
// no level in a standard (an HSK 3.0-only word in hsk2, or an old word the
// 2025 syllabus dropped): it sorts last and shows no level pill.

export type HskStandard = "hsk2" | "hsk3";

export const HSK_STANDARDS: readonly HskStandard[] = ["hsk3", "hsk2"];

export function isHskStandard(value: unknown): value is HskStandard {
  return value === "hsk2" || value === "hsk3";
}

/** The levels of a standard, in order. */
export const STANDARD_LEVELS: Record<HskStandard, readonly number[]> = {
  hsk2: [1, 2, 3, 4, 5, 6],
  hsk3: [1, 2, 3, 4, 5, 6, 7],
};

export function isLevelOf(standard: HskStandard, level: unknown): level is number {
  return STANDARD_LEVELS[standard].includes(level as number);
}

/** What the settings and onboarding cards call each standard. */
export const STANDARD_INFO: Record<HskStandard, { name: string; short: string; line: string }> = {
  hsk3: { name: "HSK 3.0 (2025)", short: "HSK 3.0", line: "The current exam, from December 2026. 9 levels." },
  hsk2: { name: "HSK 2.0", short: "HSK 2.0", line: "The previous exam. 6 levels." },
};

/** Cumulative vocabulary at each level (official counts): how many words
 *  a learner knows by the end of it. */
export const CUMULATIVE_WORDS: Record<HskStandard, readonly number[]> = {
  hsk2: [150, 300, 600, 1200, 2500, 5000],
  hsk3: [300, 500, 1000, 2000, 3600, 5400, 11000],
};

/** A level's number as people say it: "7–9" for HSK 3.0's top level. */
export function levelNumber(level: number, standard: HskStandard) {
  return standard === "hsk3" && level >= 7 ? "7–9" : String(level);
}

/** "HSK 4", or "HSK 7–9" for HSK 3.0's top level. */
export function levelLabel(level: number, standard: HskStandard) {
  return `HSK ${levelNumber(level, standard)}`;
}

/** The fields a word's level and order come from. sort_order and
 *  sort_order_2025 are optional: lists that don't select them order by
 *  level, then id. */
export interface LeveledWord {
  id: number;
  hsk_level: number | null;
  hsk3_2025_level?: number | null;
  sort_order?: number | null;
  sort_order_2025?: number | null;
}

/** The word's level in `standard`, or null when it has none. */
export function wordLevel(word: LeveledWord, standard: HskStandard): number | null {
  return (standard === "hsk2" ? word.hsk_level : word.hsk3_2025_level) ?? null;
}

/** The word's order within its level in `standard`, or null. */
export function wordSort(word: LeveledWord, standard: HskStandard): number | null {
  return (standard === "hsk2" ? word.sort_order : word.sort_order_2025) ?? null;
}

/** The words table's column for each, for queries. */
export const LEVEL_COLUMN = { hsk2: "hsk_level", hsk3: "hsk3_2025_level" } as const;
export const SORT_COLUMN = { hsk2: "sort_order", hsk3: "sort_order_2025" } as const;

const last = (n: number | null) => n ?? Number.POSITIVE_INFINITY;

/** Sorts by level in `standard` (none last), then order within the level
 *  (none last), then id. */
export function byLevel(standard: HskStandard) {
  return (a: LeveledWord, b: LeveledWord) =>
    last(wordLevel(a, standard)) - last(wordLevel(b, standard)) ||
    last(wordSort(a, standard)) - last(wordSort(b, standard)) ||
    a.id - b.id;
}

/** The level in `to` closest to `level` in `from`, by how many words a
 *  learner knows there: what settings suggests after a switch. */
export function closestLevel(level: number | null, from: HskStandard, to: HskStandard): number {
  if (level === null) return 1;
  if (from === to) return level;
  const known = CUMULATIVE_WORDS[from][level - 1] ?? CUMULATIVE_WORDS[from][0];
  const targets = CUMULATIVE_WORDS[to];
  let best = 0;
  targets.forEach((count, i) => {
    if (Math.abs(count - known) < Math.abs(targets[best] - known)) best = i;
  });
  return best + 1;
}
