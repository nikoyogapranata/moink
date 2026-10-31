// Checks the grammar examples in the database (as import-grammar.ts does
// on import) and keeps grammar_examples.max_word_level up to date: run it
// after words levels change.
//
//   pnpm exec tsx scripts/check-grammar-examples.ts [--level N]           dry run: report
//   pnpm exec tsx scripts/check-grammar-examples.ts [--level N] --write   also set max_word_level
//
// Reports, per example: words above the point's level or in no word
// (failures), words with no 2025 level (warnings), and pinyin whose
// syllables don't fit the hanzi (flags). See lib/grammar-check.ts.
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { EXAMPLE_COLUMNS, POINT_COLUMNS, STANDARD, levelArg, levelName, selectAll } from "./lib/grammar";
import { buildLexicon, checkExample } from "./lib/grammar-check";
import { fetchWords } from "./lib/words";

const WRITE = hasFlag("--write");

async function main() {
  const level = levelArg();
  const admin = createAdminClient();
  const points = await selectAll(admin, "grammar_points", POINT_COLUMNS, "id", { standard: STANDARD, ...(level ? { level } : {}) });
  const examples = await selectAll(admin, "grammar_examples", EXAMPLE_COLUMNS, "id");
  if (points === null || examples === null) {
    console.error("No grammar tables yet: run 20261228120000_grammar.sql first.");
    process.exit(1);
  }
  const pointOf = new Map(points.map((p) => [p.id, p]));
  const mine = examples.filter((e) => pointOf.has(e.point_id));

  const { words } = await fetchWords(admin, undefined, "hsk3_2025_level");
  const lex = buildLexicon(words);

  const changes: { id: number; max_word_level: number | null }[] = [];
  let failed = 0;
  let flagged = 0;
  let warned = 0;
  for (const e of mine) {
    const p = pointOf.get(e.point_id)!;
    const r = checkExample(e, p.level, lex);
    if (r.maxWordLevel !== e.max_word_level) changes.push({ id: e.id, max_word_level: r.maxWordLevel });
    if (!r.failures.length && !r.pinyinFlags.length && !r.warnings.length) continue;
    console.log(`${levelName(p.level)}#${p.sort_order} ${p.name_zh} [${e.sort_order}] ${e.hanzi}`);
    if (r.failures.length) console.log(`  x above level ${levelName(p.level)}: ${r.failures.join(", ")}`);
    if (r.pinyinFlags.length) console.log(`  ! pinyin ${r.pinyinFlags.join("; ")}: ${e.pinyin}`);
    if (r.warnings.length) console.log(`  ! ${r.warnings.join(", ")}`);
    failed += r.failures.length ? 1 : 0;
    flagged += r.pinyinFlags.length ? 1 : 0;
    warned += r.warnings.length ? 1 : 0;
  }

  console.log(`\nExamples checked: ${mine.length}${level ? ` (level ${levelName(level)})` : ""}`);
  console.log(`Failed (word above level or unknown): ${failed}`);
  console.log(`Pinyin flagged: ${flagged}`);
  console.log(`With unleveled words: ${warned}`);
  console.log(`max_word_level to update: ${changes.length}`);

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to set max_word_level.");
    return;
  }
  let updated = 0;
  await mapLimit(changes, 10, async (c) => {
    const { error } = await admin.from("grammar_examples").update({ max_word_level: c.max_word_level }).eq("id", c.id);
    if (error) console.error(`Example ${c.id} failed:`, error);
    else updated++;
  });
  console.log(`Updated max_word_level on ${updated} of ${changes.length} examples.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
