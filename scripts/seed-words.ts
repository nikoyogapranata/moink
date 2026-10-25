import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  assertOverridesValid,
  chooseReading,
  extractHskLevel,
  fetchDataset,
  type SourceEntry,
} from "./lib/readings";

config({ path: ".env.local" });
config();

console.log("env present:", {
  NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
});

const BATCH_SIZE = 500;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role key) in .env.local",
  );
  process.exit(1);
}

interface WordRow {
  simplified: string;
  traditional: string | null;
  radical: string | null;
  hsk_level: number;
  frequency: number | null;
  pinyin: string;
  pinyin_numeric: string | null;
  pos: string[];
  meanings: string[];
  classifiers: string[];
}

// HSK 3.0 tags in the dataset: "new-1" to "new-6", and "new-7" for the
// combined bands 7-9 (stored as 7). The dataset also has "newest-1" to
// "newest-7", which its README doesn't document; they're ignored here.
const NEW_LEVEL_RE = /^new-([1-7])$/;

function extractHsk3Level(level: string[]): number | null {
  for (const tag of level) {
    const match = NEW_LEVEL_RE.exec(tag);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

// Optional step, run on its own with --fill-hsk3 (needs the learning_core
// migration for the hsk3_level column). Sets hsk3_level on the existing
// rows from the dataset's new-N tags, matched by simplified (unique in the
// table). Doesn't insert anything; words without a new-N tag keep null.
async function fillHsk3(entries: SourceEntry[]) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byLevel = new Map<number, string[]>();
  for (const entry of entries) {
    if (extractHskLevel(entry.level) === null) continue;
    const hsk3 = extractHsk3Level(entry.level ?? []);
    if (hsk3 === null) continue;
    byLevel.set(hsk3, [...(byLevel.get(hsk3) ?? []), entry.simplified]);
  }

  let updated = 0;
  for (const [hsk3, words] of [...byLevel].sort((a, b) => a[0] - b[0])) {
    for (let i = 0; i < words.length; i += 200) {
      const chunk = words.slice(i, i + 200);
      const { error, count } = await supabase
        .from("words")
        .update({ hsk3_level: hsk3 }, { count: "exact" })
        .in("simplified", chunk);
      if (error) {
        console.error(`hsk3_level ${hsk3}, chunk ${i / 200 + 1} failed:`, error);
        continue;
      }
      updated += count ?? 0;
    }
    console.log(`hsk3_level ${hsk3}: ${words.length} words`);
  }
  console.log(`Done. Set hsk3_level on ${updated} rows.`);
}

async function main() {
  const entries = await fetchDataset();
  assertOverridesValid(entries);

  if (process.argv.includes("--fill-hsk3")) {
    await fillHsk3(entries);
    return;
  }

  const rows: WordRow[] = [];
  let skippedEmpty = 0;
  let noUsableReading = 0;

  for (const entry of entries) {
    const hskLevel = extractHskLevel(entry.level);
    if (hskLevel === null) continue;

    // Not simply forms[0]: that is often a surname, variant or archaic
    // reading (白 "surname Bai", 听 yǐn). See scripts/lib/readings.ts.
    const choice = chooseReading(entry);
    if (!choice) {
      skippedEmpty++;
      continue;
    }
    if (!choice.usable) noUsableReading++;

    rows.push({
      simplified: entry.simplified,
      radical: entry.radical ?? null,
      hsk_level: hskLevel,
      frequency: entry.frequency ?? null,
      pos: entry.pos ?? [],
      ...choice.reading,
    });
  }

  console.log(
    `Filtered to ${rows.length} HSK (old-1..old-6) rows (${skippedEmpty} skipped for empty pinyin/meanings, ${noUsableReading} with no usable reading kept as is)`,
  );

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from("words")
      .insert(batch, { count: "exact" });

    if (error) {
      console.error(
        `Batch ${i / BATCH_SIZE + 1} (rows ${i}-${i + batch.length - 1}) failed:`,
        error,
      );
      continue;
    }

    inserted += count ?? batch.length;
    console.log(
      `Inserted batch ${i / BATCH_SIZE + 1}: ${inserted}/${rows.length}`,
    );
  }

  console.log(
    `Done. Fetched ${entries.length}, filtered ${rows.length}, inserted ${inserted}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
