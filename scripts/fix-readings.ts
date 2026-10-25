// Repairs words stored under the wrong reading. The original seed kept the
// dataset's first reading, which for ~150 words is a surname, a variant
// note or an archaic sense (白 as "surname Bai", 听 as yǐn "smile").
//
//   pnpm exec tsx scripts/fix-readings.ts           dry run: report only
//   pnpm exec tsx scripts/fix-readings.ts --write   update the database
//
// Re-reads each word's dataset entry, picks its reading with the same
// rule as the seed (scripts/lib/readings.ts), and where that differs from
// what's stored, updates every field that comes from the reading: pinyin,
// pinyin_numeric, traditional, meanings and classifiers. When the gloss
// columns exist, an 'auto' gloss is rebuilt from the new meanings so it
// isn't left describing the old reading. Rows with gloss_status =
// 'reviewed' are never touched. Words with no usable reading are left as
// they are and listed.
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { buildGloss } from "./lib/gloss";
import { searchFields } from "./lib/pinyin";
import {
  assertOverridesValid,
  chooseReading,
  extractHskLevel,
  fetchDataset,
  type Reading,
} from "./lib/readings";
import { fetchWords, type WordRow } from "./lib/words";

const REPORT = "scripts/output/reading-fixes.csv";
const WRITE = hasFlag("--write");

const sameList = (a: readonly string[] | null, b: readonly string[] | null) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

function differs(word: WordRow, r: Reading) {
  return (
    word.pinyin !== r.pinyin ||
    (word.pinyin_numeric ?? null) !== r.pinyin_numeric ||
    (word.traditional ?? null) !== r.traditional ||
    !sameList(word.meanings, r.meanings) ||
    !sameList(word.classifiers, r.classifiers)
  );
}

async function main() {
  const admin = createAdminClient();
  const [entries, { words, migrated }] = await Promise.all([
    fetchDataset(),
    fetchWords(admin),
  ]);
  assertOverridesValid(entries);

  // The search columns come from the dictionary_search migration; fill
  // them alongside a fixed reading once they exist.
  const { error: probe } = await admin.from("words").select("pinyin_plain").limit(1);
  const hasSearchColumns = !probe;
  if (!migrated) {
    console.log(
      "Note: the learning_core migration isn't applied yet (no gloss columns), " +
        "so no row counts as reviewed and no gloss is rebuilt.",
    );
  }

  // Stored words all came from old-HSK entries; simplified is unique.
  const bySimplified = new Map(
    entries
      .filter((e) => extractHskLevel(e.level) !== null)
      .map((e) => [e.simplified, e]),
  );

  const fixes: { word: WordRow; reading: Reading }[] = [];
  const noUsable: WordRow[] = [];
  const notInDataset: WordRow[] = [];
  let skippedReviewed = 0;

  for (const word of words) {
    const entry = bySimplified.get(word.simplified);
    if (!entry) {
      notInDataset.push(word);
      continue;
    }
    const choice = chooseReading(entry);
    if (!choice || !choice.usable) {
      noUsable.push(word);
      continue;
    }
    if (!differs(word, choice.reading)) continue;
    if (word.gloss_status === "reviewed") {
      skippedReviewed++;
      continue;
    }
    fixes.push({ word, reading: choice.reading });
  }

  writeCsv(
    REPORT,
    ["hanzi", "level", "old_pinyin", "new_pinyin", "old_first_meaning", "new_first_meaning"],
    fixes.map(({ word, reading }) => [
      word.simplified,
      word.hsk_level,
      word.pinyin,
      reading.pinyin,
      word.meanings[0] ?? "",
      reading.meanings[0] ?? "",
    ]),
  );

  const pinyinChanged = fixes.filter(({ word, reading }) => word.pinyin !== reading.pinyin).length;
  console.log(`Words:                       ${words.length}`);
  console.log(`Reading fixes:               ${fixes.length} (pinyin changes in ${pinyinChanged})`);
  console.log(`  by level:                  ${[1, 2, 3, 4, 5, 6].map((l) => `HSK ${l}: ${fixes.filter((f) => f.word.hsk_level === l).length}`).join(", ")}`);
  console.log(`Skipped (reviewed):          ${skippedReviewed}`);
  console.log(`No usable reading (unchanged): ${noUsable.length}`);
  for (const w of noUsable) {
    console.log(`  ${w.simplified}  ${w.pinyin}  HSK ${w.hsk_level}  ${w.meanings.join(" | ")}`);
  }
  if (notInDataset.length) {
    console.log(`Not found in the dataset:    ${notInDataset.map((w) => w.simplified).join(" ")}`);
  }
  console.log(`Report:                      ${REPORT}`);

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  let written = 0;
  const failed: string[] = [];
  await mapLimit(fixes, 10, async ({ word, reading }) => {
    const fields = {
      ...reading,
      ...(migrated ? { gloss: buildGloss(reading.meanings).gloss } : {}),
      ...(hasSearchColumns ? searchFields(reading) : {}),
    };
    let query = admin.from("words").update(fields).eq("id", word.id);
    // Second guard: a row reviewed since the read above is left alone.
    if (migrated) query = query.eq("gloss_status", "auto");
    const { error } = await query;
    if (error) failed.push(word.simplified);
    else written++;
  });
  console.log(`\nWrote ${written} rows.${failed.length ? ` Failed: ${failed.join(" ")}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
