import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

console.log("env present:", {
  NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
});

const SOURCE_URL =
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json";
const BATCH_SIZE = 500;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role key) in .env.local",
  );
  process.exit(1);
}

interface SourceForm {
  traditional?: string;
  transcriptions?: { pinyin?: string; numeric?: string };
  meanings?: string[];
  classifiers?: string[];
}

interface SourceEntry {
  simplified: string;
  radical?: string;
  level?: string[];
  frequency?: number;
  pos?: string[];
  forms?: SourceForm[];
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

const OLD_LEVEL_RE = /^old-([1-6])$/;

function extractHskLevel(level: string[]): number | null {
  for (const tag of level) {
    const match = OLD_LEVEL_RE.exec(tag);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const entries = (await res.json()) as SourceEntry[];
  console.log(`Fetched ${entries.length} entries`);

  const rows: WordRow[] = [];
  let skippedEmpty = 0;

  for (const entry of entries) {
    if (!entry.level?.some((tag) => OLD_LEVEL_RE.test(tag))) continue;

    const hskLevel = extractHskLevel(entry.level);
    if (hskLevel === null) continue;

    const form = entry.forms?.[0];
    const pinyin = form?.transcriptions?.pinyin ?? "";
    const meanings = form?.meanings ?? [];

    if (pinyin === "" || meanings.length === 0) {
      skippedEmpty++;
      continue;
    }

    rows.push({
      simplified: entry.simplified,
      traditional: form?.traditional ?? null,
      radical: entry.radical ?? null,
      hsk_level: hskLevel,
      frequency: entry.frequency ?? null,
      pinyin,
      pinyin_numeric: form?.transcriptions?.numeric ?? null,
      pos: entry.pos ?? [],
      meanings,
      classifiers: form?.classifiers ?? [],
    });
  }

  console.log(
    `Filtered to ${rows.length} HSK (old-1..old-6) rows (${skippedEmpty} skipped for empty pinyin/meanings)`,
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
