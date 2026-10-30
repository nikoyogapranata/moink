// Seeds HSK 3.0: inserts the dataset's HSK 3.0 words that aren't in words
// yet, and sets hsk3_2025_level (and through rank_words_2025,
// sort_order_2025) on every word, old and new.
//
//   pnpm exec tsx scripts/seed-hsk3.ts           dry run: counts and reports
//   pnpm exec tsx scripts/seed-hsk3.ts --write   insert and update
//
// --write needs supabase/migrations/20261116120000_hsk3_2025.sql applied.
//
// Levels (scripts/lib/readings.ts): hsk3_level is the 2021 standard
// (new-*), hsk3_2025_level the 2025 syllabus (newest-*), both 1 to 7 with
// 7 for bands 7 to 9. The dataset's 2025 lists are incomplete at level 6
// (about 6% short) and bands 7 to 9 (about 13% short); levels 1 to 5 are
// within about 3%.
//
// New words go through the same pipeline as the old ones: chooseReading
// with the reading overrides, the search columns, and a gloss from the
// cleaning rules (gloss_status 'auto'). They get hsk_level null and no
// sort_order (that's old HSK's order). Existing words only ever get
// hsk3_2025_level: their readings, glosses and review status are never
// touched. Running it twice changes nothing the second time.
//
// The dry run writes, to scripts/output/:
//   hsk3-new-words.csv          the words it would insert
//   polyphones-hsk3.csv         new words in 2025 levels 1 to 4 with more
//                               than one usable reading (same format as
//                               polyphones.csv), to fill reading-overrides.ts
//   hsk3-gloss-issues.csv       new words in 2025 levels 1 to 4 whose gloss
//                               is empty or a fallback, or that have no
//                               usable reading
//   hsk3-2025-untagged-common.csv  the dataset's 1,000 most frequent words
//                               with no 2025 level, to check by hand
import type { Database } from "../src/lib/supabase/database.types";
import { createAdminClient, hasFlag } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { buildGloss } from "./lib/gloss";
import { searchFields } from "./lib/pinyin";
import {
  assertOverridesValid,
  chooseReading,
  extractHsk3_2025Level,
  extractHsk3Level,
  extractHskLevel,
  fetchDataset,
  isCapitalized,
  isUsableReading,
  readingsOf,
  type SourceEntry,
} from "./lib/readings";

const WRITE = hasFlag("--write");
const OUT = "scripts/output";
const BATCH_SIZE = 500;
const IDS_PER_UPDATE = 200;
/** 2025 levels the reports cover: the ones moink teaches first. */
const REPORT_MAX_LEVEL = 4;
/** "Very common": the dataset's top this many words by frequency. */
const COMMON_TOP = 1000;
const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const levelName = (level: number) => (level === 7 ? "7-9" : String(level));
/** Words per level in the 2025 syllabus, for the coverage line. */
const SYLLABUS_2025 = [300, 200, 500, 1000, 1600, 1800, 5600];

type Admin = ReturnType<typeof createAdminClient>;

interface Existing {
  id: number;
  simplified: string;
  hsk_level: number | null;
  hsk3_2025_level: number | null;
  gloss_status: "auto" | "reviewed";
}

/** Every word's level and review fields. `migrated` is false before the
 *  hsk3_2025 migration (no hsk3_2025_level column): every word then reads
 *  as having no 2025 level. */
async function fetchExisting(admin: Admin): Promise<{ words: Existing[]; migrated: boolean }> {
  let migrated = true;
  const words: Existing[] = [];
  for (let from = 0; ; from += 1000) {
    const run = (columns: string) =>
      admin.from("words").select(columns).order("id").range(from, from + 999);
    let { data, error } = migrated
      ? await run("id, simplified, hsk_level, gloss_status, hsk3_2025_level")
      : await run("id, simplified, hsk_level, gloss_status");
    // 42703: undefined column.
    if (error?.code === "42703" && migrated) {
      migrated = false;
      ({ data, error } = await run("id, simplified, hsk_level, gloss_status"));
    }
    if (error) throw error;
    const page = (data ?? []) as unknown as Partial<Existing>[];
    for (const w of page) words.push({ ...(w as Existing), hsk3_2025_level: w.hsk3_2025_level ?? null });
    if (page.length < 1000) break;
  }
  return { words, migrated };
}

type WordInsert = Database["public"]["Tables"]["words"]["Insert"];
/** An insert without hsk_level: null in the table once the migration drops
 *  its NOT NULL. The generated types still say number until the app
 *  handles words without an old HSK level. */
type NewWord = Omit<WordInsert, "hsk_level">;

interface Planned {
  entry: SourceEntry;
  row: NewWord;
  level2021: number | null;
  level2025: number | null;
  /** No reading has a usable sense; the first reading was kept. */
  unusableReading: boolean;
  /** Every sense was dropped; the gloss is the first raw sense. */
  glossFallback: boolean;
}

/** The entry's usable readings with more than one distinct pinyin, as
 *  export-polyphones.ts finds them; empty when there's only one. */
function polyphoneCandidates(entry: SourceEntry) {
  let candidates = readingsOf(entry)
    .map(({ reading }) => reading)
    .filter(isUsableReading);
  if (candidates.some((r) => !isCapitalized(r.pinyin))) {
    candidates = candidates.filter((r) => !isCapitalized(r.pinyin));
  }
  return new Set(candidates.map((r) => r.pinyin)).size < 2 ? [] : candidates;
}

function countBy<T>(items: T[], key: (item: T) => number | null) {
  const counts = new Map<number | null, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function printLevels(title: string, counts: Map<number | null, number>) {
  const parts = LEVELS.map((l) => `${levelName(l)}: ${counts.get(l) ?? 0}`);
  const none = counts.get(null);
  console.log(`  ${title.padEnd(34)} ${parts.join("  ")}${none ? `  none: ${none}` : ""}`);
}

async function main() {
  const entries = await fetchDataset();
  assertOverridesValid(entries);

  const admin = createAdminClient();
  const { words: existing, migrated } = await fetchExisting(admin);
  if (!migrated) {
    console.log("Note: 20261116120000_hsk3_2025.sql isn't applied yet; every word reads as having no 2025 level.");
    if (WRITE) {
      console.error("--write needs the hsk3_2025 migration. Run it first.");
      process.exit(1);
    }
  }
  const bySimplified = new Map(existing.map((w) => [w.simplified, w]));
  const inDataset = new Map(entries.map((e) => [e.simplified, e]));

  // HSK 3.0 words (either standard) and what happens to each.
  const hsk3Entries = entries.filter(
    (e) => extractHsk3Level(e.level) !== null || extractHsk3_2025Level(e.level) !== null,
  );
  const planned: Planned[] = [];
  const noReading: SourceEntry[] = [];
  for (const entry of hsk3Entries) {
    if (bySimplified.has(entry.simplified)) continue;
    const choice = chooseReading(entry);
    if (!choice) {
      noReading.push(entry);
      continue;
    }
    const gloss = buildGloss(choice.reading.meanings);
    const level2021 = extractHsk3Level(entry.level);
    const level2025 = extractHsk3_2025Level(entry.level);
    planned.push({
      entry,
      level2021,
      level2025,
      unusableReading: !choice.usable,
      glossFallback: gloss.fallback || gloss.gloss === "",
      row: {
        simplified: entry.simplified,
        radical: entry.radical ?? null,
        hsk3_level: level2021,
        hsk3_2025_level: level2025,
        frequency: entry.frequency ?? null,
        pos: entry.pos ?? [],
        ...choice.reading,
        // The dataset's classifiers, then any from "CL:" notes (as
        // clean-glosses.ts merges them).
        classifiers: [...new Set([...choice.reading.classifiers, ...gloss.classifiers])],
        ...searchFields(choice.reading),
        gloss: gloss.gloss,
        gloss_status: "auto",
      },
    });
  }

  // 2025 levels for words already in the table: from the dataset, or null
  // when the word has no newest-* tag (so a rerun after a dataset change
  // clears stale levels).
  const updates = existing
    .map((w) => ({ word: w, level: extractHsk3_2025Level(inDataset.get(w.simplified)?.level) }))
    .filter(({ word, level }) => word.hsk3_2025_level !== level);
  const unchanged = existing.filter(
    (w) => extractHsk3_2025Level(inDataset.get(w.simplified)?.level) !== null && !updates.some((u) => u.word === w),
  );

  // ----- Reports -----

  writeCsv(
    `${OUT}/hsk3-new-words.csv`,
    ["hanzi", "pinyin", "level_2025", "level_2021", "frequency", "gloss", "note"],
    [...planned]
      .sort((a, b) => (a.level2025 ?? 99) - (b.level2025 ?? 99) || (a.row.frequency ?? 1e9) - (b.row.frequency ?? 1e9))
      .map((p) => [
        p.row.simplified,
        p.row.pinyin,
        p.level2025 ?? "",
        p.level2021 ?? "",
        p.row.frequency ?? "",
        p.row.gloss ?? "",
        [p.unusableReading && "no usable reading", p.glossFallback && "gloss fallback"].filter(Boolean).join("; "),
      ]),
  );

  const early = planned.filter((p) => p.level2025 !== null && p.level2025 <= REPORT_MAX_LEVEL);
  const polyphones = early
    .map((p) => ({ p, candidates: polyphoneCandidates(p.entry) }))
    .filter(({ candidates }) => candidates.length > 0)
    .sort((a, b) => a.p.level2025! - b.p.level2025! || a.p.row.simplified.localeCompare(b.p.row.simplified, "zh"));
  const width = Math.max(0, ...polyphones.map(({ candidates }) => candidates.length));
  writeCsv(
    `${OUT}/polyphones-hsk3.csv`,
    ["hanzi", "level", "chosen_pinyin", ...Array.from({ length: width }, (_, i) => `candidate_${i + 1}`)],
    polyphones.map(({ p, candidates }) => [
      p.row.simplified,
      p.level2025,
      p.row.pinyin,
      ...candidates.map((r) => `${r.pinyin}: ${r.meanings.slice(0, 2).join(" / ")}`),
    ]),
  );

  const glossIssues = early.filter((p) => p.glossFallback || p.unusableReading);
  writeCsv(
    `${OUT}/hsk3-gloss-issues.csv`,
    ["hanzi", "pinyin", "level_2025", "raw_meanings", "gloss", "note"],
    glossIssues.map((p) => [
      p.row.simplified,
      p.row.pinyin,
      p.level2025,
      (p.row.meanings ?? []).join(" | "),
      p.row.gloss ?? "",
      [p.unusableReading && "no usable reading (first kept)", p.glossFallback && (p.row.gloss ? "every sense dropped: first raw sense kept" : "empty")]
        .filter(Boolean)
        .join("; "),
    ]),
  );

  const common = [...entries]
    .filter((e) => e.frequency != null)
    .sort((a, b) => a.frequency! - b.frequency!)
    .slice(0, COMMON_TOP)
    .filter((e) => extractHsk3_2025Level(e.level) === null);
  writeCsv(
    `${OUT}/hsk3-2025-untagged-common.csv`,
    ["hanzi", "frequency", "pinyin", "level_2021", "old_hsk", "in_words_table"],
    common.map((e) => [
      e.simplified,
      e.frequency,
      chooseReading(e)?.reading.pinyin ?? "",
      extractHsk3Level(e.level) ?? "",
      extractHskLevel(e.level) ?? "",
      bySimplified.has(e.simplified) ? "yes" : "no",
    ]),
  );

  // ----- Summary -----

  const level2025Of = (e: SourceEntry) => extractHsk3_2025Level(e.level);
  const missing = hsk3Entries.filter((e) => !bySimplified.has(e.simplified));
  console.log(`\nWords table: ${existing.length}. Dataset HSK 3.0 words (2021 or 2025): ${hsk3Entries.length}.`);
  console.log("\nPer level (7 = bands 7 to 9):");
  printLevels("2025 syllabus, dataset", countBy(entries.filter((e) => level2025Of(e) !== null), level2025Of));
  console.log(`  ${"2025 syllabus, official".padEnd(34)} ${LEVELS.map((l) => `${levelName(l)}: ${SYLLABUS_2025[l - 1]}`).join("  ")}`);
  printLevels("2025: already in words (update)", countBy(updates.filter((u) => u.level !== null), (u) => u.level));
  printLevels("2025: already in words (as is)", countBy(unchanged, (w) => extractHsk3_2025Level(inDataset.get(w.simplified)?.level)));
  printLevels("2025: new words to insert", countBy(planned.filter((p) => p.level2025 !== null), (p) => p.level2025));
  printLevels("Missing from words, by 2021 level", countBy(missing, (e) => extractHsk3Level(e.level)));
  printLevels("Missing from words, by 2025 level", countBy(missing, level2025Of));
  const cleared = updates.filter((u) => u.level === null).length;
  if (cleared) console.log(`  2025 level cleared (no newest-* tag any more): ${cleared}`);

  const reviewRows = LEVELS.slice(0, REPORT_MAX_LEVEL).map((l) => {
    const old = existing.filter(
      (w) => w.gloss_status === "auto" && extractHsk3_2025Level(inDataset.get(w.simplified)?.level) === l,
    ).length;
    const fresh = planned.filter((p) => p.level2025 === l).length;
    return `${l}: ${old + fresh} (${fresh} new, ${old} old not reviewed)`;
  });

  console.log(`\nInsert: ${planned.length} new words (${planned.filter((p) => p.level2025 === null).length} with a 2021 level only).`);
  console.log(`  Skipped, no reading with pinyin and meanings: ${noReading.length}${noReading.length ? ` (${noReading.map((e) => e.simplified).join(" ")})` : ""}`);
  console.log(`  No usable reading (first kept): ${planned.filter((p) => p.unusableReading).length}`);
  console.log(`  Gloss empty or fallback: ${planned.filter((p) => p.glossFallback).length}`);
  console.log(`Update hsk3_2025_level on existing words: ${updates.length}`);
  console.log(`\n2025 levels 1-${REPORT_MAX_LEVEL}, new words: polyphones ${polyphones.length}, gloss issues ${glossIssues.length}.`);
  console.log(`Review rows per 2025 level after seeding (gloss_status auto): ${reviewRows.join("; ")}`);
  console.log(`Top ${COMMON_TOP} by frequency with no 2025 level: ${common.length}`);
  console.log(
    "\nNote: the dataset's 2025 lists are incomplete at level 6 (about 6% short of 1,800) and bands 7-9 " +
      "(about 13% short of 5,600). Levels 1 to 5 are within about 3%.",
  );
  console.log(`Reports: ${OUT}/hsk3-new-words.csv, polyphones-hsk3.csv, hsk3-gloss-issues.csv, hsk3-2025-untagged-common.csv`);

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to insert and update.");
    return;
  }

  // ----- Write -----

  let inserted = 0;
  for (let i = 0; i < planned.length; i += BATCH_SIZE) {
    const batch = planned.slice(i, i + BATCH_SIZE).map((p) => p.row);
    const { error, count } = await admin
      .from("words")
      .insert(batch as WordInsert[], { count: "exact" });
    if (error) {
      console.error(`Insert batch ${i / BATCH_SIZE + 1} failed:`, error);
      continue;
    }
    inserted += count ?? batch.length;
  }
  console.log(`\nInserted ${inserted} of ${planned.length} words.`);

  // Grouped by level: one request per level and chunk of ids.
  let updated = 0;
  const byLevel = new Map<number | null, number[]>();
  for (const { word, level } of updates) byLevel.set(level, [...(byLevel.get(level) ?? []), word.id]);
  for (const [level, ids] of byLevel) {
    for (let i = 0; i < ids.length; i += IDS_PER_UPDATE) {
      const { error, count } = await admin
        .from("words")
        .update({ hsk3_2025_level: level }, { count: "exact" })
        .in("id", ids.slice(i, i + IDS_PER_UPDATE));
      if (error) console.error(`Update to 2025 level ${level} failed:`, error);
      else updated += count ?? 0;
    }
  }
  console.log(`Set hsk3_2025_level on ${updated} of ${updates.length} existing words.`);

  const { data: ranked, error: rankError } = await admin.rpc("rank_words_2025");
  if (rankError) console.error("rank_words_2025 failed:", rankError);
  else console.log(`sort_order_2025 changed on ${ranked} words.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
