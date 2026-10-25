// Exports one old-HSK level for hand review.
//
//   pnpm exec tsx scripts/export-review.ts 1
//
// Writes scripts/output/hsk<level>-review.csv. Fill in new_gloss where the
// gloss should change, then load it with scripts/import-review.ts. Every
// row in the file is marked reviewed on import, so delete rows you haven't
// looked at. auto_gloss is what clean-glosses.ts would produce, as a
// starting point (useful before the gloss column is filled); import
// ignores it.
import { createAdminClient } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { buildGloss } from "./lib/gloss";
import { fetchWords } from "./lib/words";

async function main() {
  const level = Number(process.argv[2]);
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    console.error("Usage: tsx scripts/export-review.ts <old HSK level 1-6>");
    process.exit(1);
  }

  const admin = createAdminClient();
  const { words, migrated } = await fetchWords(admin, [level]);
  const path = `scripts/output/hsk${level}-review.csv`;

  writeCsv(
    path,
    ["id", "hanzi", "pinyin", "level", "raw_meanings", "current_gloss", "auto_gloss", "new_gloss"],
    words.map((w) => [
      w.id,
      w.simplified,
      w.pinyin,
      w.hsk_level,
      w.meanings.join(" | "),
      w.gloss ?? "",
      buildGloss(w.meanings).gloss,
      "",
    ]),
  );

  console.log(`HSK ${level}: ${words.length} words -> ${path}`);
  if (!migrated) {
    console.log("  (migration not applied yet, so current_gloss is empty)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
