// Checks every character of every word with a level (old HSK, or HSK 3.0
// in either standard) against hanzi-writer's stroke data (the
// hanzi-writer-data package on jsDelivr, the source the app's writing pad
// loads from) and records the ones it can't write. The words are every
// row in words plus the dataset's HSK 3.0 words not seeded yet, so the
// list is ready before scripts/seed-hsk3.ts --write adds them.
//
// Writes:
//
//   - src/lib/training/writing-excluded.json, which the app reads (the
//     deck builder disables words containing these), and
//   - the writing_excluded table, which get_writing_queue reads, when it
//     exists (20261109120000_writing.sql creates and seeds it).
//
//   pnpm tsx scripts/check-stroke-data.ts
//
// Characters outside the Han script (letters in a word like 卡拉OK) count
// as uncovered too: the pad can only write hanzi.

import { writeFileSync } from "node:fs";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";
import { extractHsk3_2025Level, extractHsk3Level, fetchDataset } from "./lib/readings";

config({ path: ".env.local" });
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

/** hanzi-writer 3.7's default data version (VERSION in its loader). */
const DATA_VERSION = "2.0.1";
const DATA_URL = (char: string) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${DATA_VERSION}/${encodeURIComponent(char)}.json`;
const OUT_FILE = "src/lib/training/writing-excluded.json";
const PAGE_SIZE = 1000;
const CONCURRENCY = 16;
const HANZI = /\p{Script=Han}/u;

async function hasStrokes(char: string): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(DATA_URL(char));
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { strokes?: unknown[] };
      return Array.isArray(data.strokes) && data.strokes.length > 0;
    } catch (error) {
      if (attempt >= 3) throw new Error(`Couldn't check ${char}: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function main() {
  const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SECRET_KEY!);

  // Every word in the table has a level in some standard.
  const seeded: { simplified: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("words")
      .select("simplified")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    seeded.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const inTable = new Set(seeded.map((w) => w.simplified));
  const unseeded = (await fetchDataset())
    .filter((e) => extractHsk3Level(e.level) !== null || extractHsk3_2025Level(e.level) !== null)
    .filter((e) => !inTable.has(e.simplified))
    .map((e) => ({ simplified: e.simplified }));
  const words = [...seeded, ...unseeded];

  const chars = [...new Set(words.flatMap((w) => [...w.simplified]))].sort();
  const notHanzi = chars.filter((c) => !HANZI.test(c));
  const hanzi = chars.filter((c) => HANZI.test(c));

  const missing: string[] = [];
  for (let i = 0; i < hanzi.length; i += CONCURRENCY) {
    const batch = hanzi.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(hasStrokes));
    batch.forEach((c, j) => {
      if (!results[j]) missing.push(c);
    });
  }

  const excluded = [...missing, ...notHanzi].sort();
  const excludedSet = new Set(excluded);
  const affected = words.filter((w) => [...w.simplified].some((c) => excludedSet.has(c)));

  writeFileSync(
    OUT_FILE,
    `${JSON.stringify({ source: `hanzi-writer-data@${DATA_VERSION}`, checked: chars.length, chars: excluded }, null, 2)}\n`,
  );

  // Keep the table in step, when the migration has created it.
  const { error: probeError } = await supabase.from("writing_excluded").select("char").limit(1);
  if (probeError) {
    console.log(`writing_excluded table not found (${probeError.message}); wrote ${OUT_FILE} only.`);
  } else {
    const { error: deleteError } = await supabase.from("writing_excluded").delete().not("char", "in", `(${excluded.map((c) => `"${c}"`).join(",") || '""'})`);
    if (deleteError) throw deleteError;
    if (excluded.length > 0) {
      const { error: upsertError } = await supabase.from("writing_excluded").upsert(excluded.map((char) => ({ char })));
      if (upsertError) throw upsertError;
    }
    console.log(`writing_excluded table synced (${excluded.length} rows).`);
  }

  console.log(
    `Checked ${chars.length} characters in ${words.length} words (${seeded.length} in the table, ${unseeded.length} HSK 3.0 words not seeded yet).`,
  );
  console.log(`No stroke data: ${missing.length} hanzi${missing.length ? ` (${missing.join(" ")})` : ""}.`);
  console.log(`Not hanzi: ${notHanzi.length}${notHanzi.length ? ` (${notHanzi.map((c) => JSON.stringify(c)).join(" ")})` : ""}.`);
  console.log(`${affected.length} words can't be written: ${affected.map((w) => w.simplified).join(" ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
