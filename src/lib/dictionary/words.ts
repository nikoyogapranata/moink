import type { Tables } from "@/lib/supabase/database.types";

/** A row in the dictionary list. */
export interface WordListItem {
  id: number;
  simplified: string;
  pinyin: string;
  gloss: string | null;
  hsk_level: number;
  hsk3_level: number | null;
}

/** Everything the word panel shows. */
export type WordDetail = Pick<
  Tables<"words">,
  | "id"
  | "simplified"
  | "traditional"
  | "pinyin"
  | "gloss"
  | "meanings"
  | "classifiers"
  | "hsk_level"
  | "hsk3_level"
  | "radical"
>;

export const WORD_DETAIL_COLUMNS =
  "id, simplified, traditional, pinyin, gloss, meanings, classifiers, hsk_level, hsk3_level, radical";

export const WORD_LIST_COLUMNS = "id, simplified, pinyin, gloss, hsk_level, hsk3_level";

/** Level filter: "1" to "4", "5" for 5 and above, or "all". */
export type LevelFilter = "1" | "2" | "3" | "4" | "5" | "all";

export const LEVEL_FILTERS: { value: LevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "1", label: "HSK 1" },
  { value: "2", label: "HSK 2" },
  { value: "3", label: "HSK 3" },
  { value: "4", label: "HSK 4" },
  { value: "5", label: "5+" },
];

export function parseLevel(value: string | null | undefined): LevelFilter | null {
  return LEVEL_FILTERS.some((l) => l.value === value) ? (value as LevelFilter) : null;
}

/** The filter that matches an hsk_level_target (5 and 6 both map to 5+). */
export function levelForTarget(target: number | null): LevelFilter {
  if (!target || target < 1) return "1";
  return target >= 5 ? "5" : (String(target) as LevelFilter);
}

export function levelLabel(level: LevelFilter) {
  if (level === "all") return "All levels";
  return level === "5" ? "HSK 5+" : `HSK ${level}`;
}

export const numberFormat = new Intl.NumberFormat("en-US");

const HANZI = /\p{Script=Han}/u;

/** The hanzi in a word, in order, skipping anything else (digits, ...). */
export function hanziOf(word: string) {
  return [...word].filter((c) => HANZI.test(c));
}

/** Links to /dictionary/[id] carry the list state so "back" restores it. */
export function listQuery(q: string, level: LevelFilter | null) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (level) params.set("level", level);
  const s = params.toString();
  return s ? `?${s}` : "";
}
