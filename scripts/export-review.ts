// Exports words for hand review.
//
//   pnpm exec tsx scripts/export-review.ts 1                       old HSK level 1
//   pnpm exec tsx scripts/export-review.ts --standard hsk3-2025    2025 levels 1 to 4
//   pnpm exec tsx scripts/export-review.ts --standard hsk3-2025 2  2025 level 2
//
// Old HSK writes scripts/output/hsk<level>-review.csv with every word of
// the level. The 2025 syllabus (needs the hsk3_2025 migration and
// scripts/seed-hsk3.ts) writes scripts/output/hsk3-2025-<level>-review.csv,
// one file per level, with only the words whose gloss_status is still
// 'auto': the words already reviewed by old HSK level are left out.
//
// Fill in new_gloss where the gloss should change, then load it with
// scripts/import-review.ts. Every row in the file is marked reviewed on
// import, so delete rows you haven't looked at. auto_gloss is what
// clean-glosses.ts would produce, as a starting point (useful before the
// gloss column is filled); import ignores it.
import { createAdminClient } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { buildGloss } from "./lib/gloss";
import { fetchWords, type WordRow } from "./lib/words";

const HEADER = ["id", "hanzi", "pinyin", "level", "raw_meanings", "current_gloss", "auto_gloss", "new_gloss"];
/** 2025 levels exported when none is given: the ones moink teaches first. */
const HSK3_2025_DEFAULT_LEVELS = [1, 2, 3, 4];

function rowsOf(words: WordRow[], level: (w: WordRow) => number | null | undefined) {
  return words.map((w) => [
    w.id,
    w.simplified,
    w.pinyin,
    level(w) ?? "",
    w.meanings.join(" | "),
    w.gloss ?? "",
    buildGloss(w.meanings).gloss,
    "",
  ]);
}

async function exportOld(level: number) {
  const admin = createAdminClient();
  const { words, migrated } = await fetchWords(admin, [level]);
  const path = `scripts/output/hsk${level}-review.csv`;
  writeCsv(path, HEADER, rowsOf(words, (w) => w.hsk_level));
  console.log(`HSK ${level}: ${words.length} words -> ${path}`);
  if (!migrated) {
    console.log("  (migration not applied yet, so current_gloss is empty)");
  }
}

async function exportHsk3_2025(levels: number[]) {
  const admin = createAdminClient();
  for (const level of levels) {
    let words: WordRow[];
    try {
      ({ words } = await fetchWords(admin, [level], "hsk3_2025_level"));
    } catch (err) {
      // 42703: undefined column.
      if ((err as { code?: string }).code === "42703") {
        console.error("No hsk3_2025_level column yet: run 20261116120000_hsk3_2025.sql and scripts/seed-hsk3.ts first.");
        process.exit(1);
      }
      throw err;
    }
    const auto = words.filter((w) => w.gloss_status === "auto");
    const path = `scripts/output/hsk3-2025-${level}-review.csv`;
    writeCsv(path, HEADER, rowsOf(auto, (w) => w.hsk3_2025_level));
    console.log(
      `HSK 3.0 (2025) level ${level}: ${auto.length} words to review -> ${path} (${words.length - auto.length} already reviewed, left out)`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--standard");
  const standard = at === -1 ? "hsk2" : args[at + 1];
  // Everything but the flag and its value.
  const positional = at === -1 ? args : args.filter((_, i) => i !== at && i !== at + 1);
  const level = positional[0] === undefined ? undefined : Number(positional[0]);

  if (standard === "hsk3-2025") {
    if (level !== undefined && !(Number.isInteger(level) && level >= 1 && level <= 7)) {
      console.error("Usage: tsx scripts/export-review.ts --standard hsk3-2025 [2025 level 1-7]");
      process.exit(1);
    }
    await exportHsk3_2025(level === undefined ? HSK3_2025_DEFAULT_LEVELS : [level]);
    return;
  }
  if (standard !== "hsk2" || level === undefined || !Number.isInteger(level) || level < 1 || level > 6) {
    console.error("Usage: tsx scripts/export-review.ts <old HSK level 1-6>");
    console.error("       tsx scripts/export-review.ts --standard hsk3-2025 [2025 level 1-7]");
    process.exit(1);
  }
  await exportOld(level);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
