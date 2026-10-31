// Rewrites dataset spellings left in stored pinyin the way the seed now
// reads the dataset (storedToned / storedNumeric in scripts/lib/pinyin.ts):
// CC-CEDICT's "u:" for ü (略 lu:è -> lüè) and the neutral-tone dot
// (闺女 guī ˙nu: -> guī nü).
//
//   pnpm exec tsx scripts/fix-pinyin-spelling.ts           dry run: report only
//   pnpm exec tsx scripts/fix-pinyin-spelling.ts --write   update the database
//
// Touches only the pinyin fields: pinyin, pinyin_numeric, and the search
// columns pinyin_plain / pinyin_num (written only where they change).
// Meanings and glosses are left alone, so reviewed rows are fixed too.
// words.sort_az follows by itself (a generated column). Before writing,
// every new value is checked against the reading a fresh seed would store
// (chooseReading), so the table and a reseed agree.
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { searchFields, storedNumeric, storedToned } from "./lib/pinyin";
import { assertOverridesValid, chooseReading, fetchDataset, isSeededEntry } from "./lib/readings";

const REPORT = "scripts/output/pinyin-spelling-fixes.csv";
const WRITE = hasFlag("--write");

const FIELDS = ["pinyin", "pinyin_numeric", "pinyin_plain", "pinyin_num"] as const;
type Field = (typeof FIELDS)[number];
interface PinyinFields {
  pinyin: string;
  pinyin_numeric: string | null;
  pinyin_plain: string | null;
  pinyin_num: string | null;
}

interface Row extends PinyinFields {
  id: number;
  simplified: string;
}

async function fetchRows(admin: ReturnType<typeof createAdminClient>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("words")
      .select("id, simplified, pinyin, pinyin_numeric, pinyin_plain, pinyin_num")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const admin = createAdminClient();
  const [entries, rows] = await Promise.all([fetchDataset(), fetchRows(admin)]);
  assertOverridesValid(entries);
  const bySimplified = new Map(entries.filter(isSeededEntry).map((e) => [e.simplified, e]));

  const fixes: { row: Row; patch: Partial<PinyinFields> }[] = [];
  const seedDisagrees: string[] = [];
  for (const row of rows) {
    const pinyin = storedToned(row.pinyin);
    const pinyin_numeric = storedNumeric(row.pinyin_numeric);
    if (pinyin === row.pinyin && pinyin_numeric === row.pinyin_numeric) continue;

    const next: PinyinFields = { pinyin, pinyin_numeric, ...searchFields({ pinyin, pinyin_numeric }) };
    const patch = Object.fromEntries(FIELDS.filter((f) => next[f] !== row[f]).map((f) => [f, next[f]]));
    fixes.push({ row, patch });

    const entry = bySimplified.get(row.simplified);
    const seeded = entry && chooseReading(entry)?.reading;
    if (!seeded || seeded.pinyin !== pinyin || seeded.pinyin_numeric !== pinyin_numeric) {
      seedDisagrees.push(
        `${row.simplified}: fixed ${pinyin} | ${pinyin_numeric}, a seed would store ${seeded ? `${seeded.pinyin} | ${seeded.pinyin_numeric}` : "nothing (not in the dataset)"}`,
      );
    }
  }

  writeCsv(
    REPORT,
    ["id", "hanzi", "field", "old", "new"],
    fixes.flatMap(({ row, patch }) =>
      (Object.keys(patch) as Field[]).map((f) => [row.id, row.simplified, f, row[f], patch[f]]),
    ),
  );

  console.log(`Words:            ${rows.length}`);
  console.log(`Words to change:  ${fixes.length}`);
  for (const f of FIELDS) {
    console.log(`  ${f.padEnd(15)} ${fixes.filter(({ patch }) => f in patch).length}`);
  }
  for (const { row, patch } of fixes) {
    const changes = (Object.keys(patch) as Field[]).map((f) => `${f} ${row[f]} -> ${patch[f]}`).join(", ");
    console.log(`  ${row.simplified}  (id ${row.id})  ${changes}`);
  }
  console.log(`Report:           ${REPORT}`);

  if (seedDisagrees.length) {
    console.error(`\n${seedDisagrees.length} fix(es) don't match what a fresh seed stores; nothing was written:`);
    for (const line of seedDisagrees) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log("Every fix matches what a fresh seed stores.");

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  let written = 0;
  const failed: string[] = [];
  await mapLimit(fixes, 10, async ({ row, patch }) => {
    // Guard: a row whose pinyin changed since the read above is left alone.
    const { error, count } = await admin
      .from("words")
      .update(patch, { count: "exact" })
      .eq("id", row.id)
      .eq("pinyin", row.pinyin);
    if (error || count !== 1) failed.push(row.simplified);
    else written++;
  });
  console.log(`\nWrote ${written} rows.${failed.length ? ` Failed or changed since read: ${failed.join(" ")}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
