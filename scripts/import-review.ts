// Loads a reviewed CSV from scripts/export-review.ts back into words.
//
//   pnpm exec tsx scripts/import-review.ts scripts/output/hsk1-review.csv           dry run
//   pnpm exec tsx scripts/import-review.ts scripts/output/hsk1-review.csv --write   update
//
// For every row in the file: gloss = new_gloss when it's filled, and
// gloss_status = 'reviewed' either way (so clean-glosses.ts leaves the row
// alone from then on). Only the id and new_gloss columns are read.
// Save from Excel as "CSV UTF-8" so the hanzi survive.
import { existsSync } from "node:fs";

import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { readCsv } from "./lib/csv";

const WRITE = hasFlag("--write");

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!path || !existsSync(path)) {
    console.error("Usage: tsx scripts/import-review.ts <path to edited CSV> [--write]");
    process.exit(1);
  }

  const rows = readCsv(path);
  if (rows.length > 0 && !("id" in rows[0] && "new_gloss" in rows[0])) {
    console.error("The CSV needs id and new_gloss columns (as written by export-review.ts).");
    process.exit(1);
  }

  const updates: { id: number; gloss?: string }[] = [];
  const badIds: string[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) {
      badIds.push(row.id);
      continue;
    }
    const gloss = row.new_gloss.trim();
    updates.push(gloss ? { id, gloss } : { id });
  }

  const withGloss = updates.filter((u) => u.gloss !== undefined).length;
  console.log(`Rows in file:          ${rows.length}`);
  console.log(`New gloss filled:      ${withGloss}`);
  console.log(`Marked reviewed only:  ${updates.length - withGloss}`);
  if (badIds.length) console.log(`Skipped (bad id):      ${badIds.length} (${badIds.slice(0, 10).join(", ")})`);

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  const admin = createAdminClient();
  let written = 0;
  const missing: number[] = [];
  const failed: number[] = [];
  await mapLimit(updates, 10, async ({ id, gloss }) => {
    const { data, error } = await admin
      .from("words")
      .update(gloss !== undefined ? { gloss, gloss_status: "reviewed" } : { gloss_status: "reviewed" })
      .eq("id", id)
      .select("id");
    if (error) failed.push(id);
    else if (!data?.length) missing.push(id);
    else written++;
  });

  console.log(`\nUpdated ${written} rows.`);
  if (missing.length) console.log(`No word with id: ${missing.join(", ")}`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
