// Fills words.pinyin_plain and words.pinyin_num (scripts/lib/pinyin.ts).
// Needs supabase/migrations/20261101120000_dictionary_search.sql.
//
//   pnpm exec tsx scripts/backfill-search.ts           dry run
//   pnpm exec tsx scripts/backfill-search.ts --write   update the database
//
// Only rows whose values differ are written, so it is safe to re-run.
// Search columns aren't covered by gloss_status, so reviewed rows are
// filled too.
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { searchFields } from "./lib/pinyin";

const WRITE = hasFlag("--write");

interface Row {
  id: number;
  simplified: string;
  pinyin: string;
  pinyin_numeric: string | null;
  pinyin_plain?: string | null;
  pinyin_num?: string | null;
}

async function main() {
  const admin = createAdminClient();

  let columnsExist = true;
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const run = (cols: string) =>
      admin.from("words").select(cols).order("id").range(from, from + 999);
    let { data, error } = columnsExist
      ? await run("id, simplified, pinyin, pinyin_numeric, pinyin_plain, pinyin_num")
      : await run("id, simplified, pinyin, pinyin_numeric");
    if (error?.code === "42703" && columnsExist) {
      columnsExist = false;
      ({ data, error } = await run("id, simplified, pinyin, pinyin_numeric"));
    }
    if (error) throw error;
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  if (!columnsExist) {
    console.log("Note: pinyin_plain / pinyin_num don't exist yet; run the dictionary_search migration first.");
    if (WRITE) process.exit(1);
  }

  const updates = rows
    .map((r) => ({ row: r, fields: searchFields(r) }))
    .filter(
      ({ row, fields }) =>
        row.pinyin_plain !== fields.pinyin_plain || row.pinyin_num !== fields.pinyin_num,
    );
  const emptyPlain = updates.filter(({ fields }) => !fields.pinyin_plain);
  const emptyNum = updates.filter(({ fields }) => !fields.pinyin_num);

  console.log(`Words:            ${rows.length}`);
  console.log(`To fill/update:   ${updates.length}`);
  console.log(`Empty plain/num:  ${emptyPlain.length} / ${emptyNum.length}`);
  console.log("Samples:");
  for (const s of ["准备", "旅游", "东西", "女人", "绿色", "嗯"]) {
    const u = rows.find((r) => r.simplified === s);
    if (u) {
      const f = searchFields(u);
      console.log(`  ${s.padEnd(3, "　")} ${u.pinyin.padEnd(10)} -> ${f.pinyin_plain} | ${u.pinyin_numeric} -> ${f.pinyin_num}`);
    }
  }

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  let written = 0;
  const failed: number[] = [];
  await mapLimit(updates, 10, async ({ row, fields }) => {
    const { error } = await admin.from("words").update(fields).eq("id", row.id);
    if (error) failed.push(row.id);
    else written++;
  });
  console.log(`\nWrote ${written} rows.${failed.length ? ` Failed ids: ${failed.join(", ")}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
