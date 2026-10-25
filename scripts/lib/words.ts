import type { createAdminClient } from "./admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface WordRow {
  id: number;
  simplified: string;
  traditional: string | null;
  pinyin: string;
  pinyin_numeric: string | null;
  hsk_level: number;
  meanings: string[];
  classifiers: string[] | null;
  gloss: string | null;
  gloss_status: "auto" | "reviewed";
}

const BASE =
  "id, simplified, traditional, pinyin, pinyin_numeric, hsk_level, meanings, classifiers";

/**
 * All words (optionally only some old-HSK levels), in id order.
 * `migrated` is false when the learning_core migration hasn't been applied
 * yet (no gloss columns): rows then read as gloss null, status 'auto'.
 */
export async function fetchWords(
  admin: Admin,
  levels?: number[],
): Promise<{ words: WordRow[]; migrated: boolean }> {
  let migrated = true;
  const words: WordRow[] = [];

  for (let from = 0; ; from += 1000) {
    const run = (columns: string) => {
      let q = admin.from("words").select(columns).order("id").range(from, from + 999);
      if (levels) q = q.in("hsk_level", levels);
      return q;
    };

    let { data, error } = migrated
      ? await run(`${BASE}, gloss, gloss_status`)
      : await run(BASE);
    // 42703: undefined column.
    if (error?.code === "42703" && migrated) {
      migrated = false;
      ({ data, error } = await run(BASE));
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
