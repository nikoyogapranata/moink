import type { createAdminClient } from "./admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface WordRow {
  id: number;
  simplified: string;
  traditional: string | null;
  pinyin: string;
  pinyin_numeric: string | null;
  /** Old HSK level; null for a word that's only in HSK 3.0. */
  hsk_level: number | null;
  /** 2025 syllabus level; only read with levelColumn "hsk3_2025_level". */
  hsk3_2025_level?: number | null;
  meanings: string[];
  classifiers: string[] | null;
  gloss: string | null;
  gloss_status: "auto" | "reviewed";
}

const BASE =
  "id, simplified, traditional, pinyin, pinyin_numeric, hsk_level, meanings, classifiers";

/** Which level `levels` filters on: old HSK, or the 2025 syllabus (which
 *  needs the hsk3_2025 migration). */
export type LevelColumn = "hsk_level" | "hsk3_2025_level";

/**
 * All words (optionally only some levels of `levelColumn`), in id order.
 * `migrated` is false when the learning_core migration hasn't been applied
 * yet (no gloss columns): rows then read as gloss null, status 'auto'.
 */
export async function fetchWords(
  admin: Admin,
  levels?: number[],
  levelColumn: LevelColumn = "hsk_level",
): Promise<{ words: WordRow[]; migrated: boolean }> {
  let migrated = true;
  const words: WordRow[] = [];
  const base = levelColumn === "hsk_level" ? BASE : `${BASE}, ${levelColumn}`;

  for (let from = 0; ; from += 1000) {
    const run = (columns: string) => {
      let q = admin.from("words").select(columns).order("id").range(from, from + 999);
      if (levels) q = q.in(levelColumn, levels);
      return q;
    };

    let { data, error } = migrated
      ? await run(`${base}, gloss, gloss_status`)
      : await run(base);
    // 42703: undefined column.
    if (error?.code === "42703" && migrated) {
      migrated = false;
      ({ data, error } = await run(base));
    }
    if (error) throw error;

    const page = (data ?? []) as unknown as Partial<WordRow>[];
    for (const w of page) {
      words.push({
        ...(w as WordRow),
        gloss: w.gloss ?? null,
        gloss_status: w.gloss_status ?? "auto",
      });
    }
    if (page.length < 1000) break;
  }

  return { words, migrated };
}
