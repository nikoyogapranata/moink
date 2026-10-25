// Builds words.gloss from words.meanings (rules in scripts/lib/gloss.ts).
//
//   pnpm exec tsx scripts/clean-glosses.ts           dry run: report only
//   pnpm exec tsx scripts/clean-glosses.ts --write   update the database
//
// Rows with gloss_status = 'reviewed' are never touched. The dry run writes
// scripts/output/gloss-report.csv: every changed word, then (at the end)
// the words whose senses were all dropped and that keep their first raw
// sense instead.
import { createAdminClient, hasFlag, mapLimit } from "./lib/admin";
import { writeCsv } from "./lib/csv";
import { buildGloss } from "./lib/gloss";
import { fetchWords } from "./lib/words";

const REPORT = "scripts/output/gloss-report.csv";
const WRITE = hasFlag("--write");

async function main() {
  const admin = createAdminClient();
  const { words, migrated } = await fetchWords(admin);

  if (!migrated) {
    console.log(
      "Note: the learning_core migration isn't applied yet (no gloss columns). " +
        "Treating every word as gloss_status 'auto' with no current gloss.",
    );
    if (WRITE) {
      console.error("--write needs the gloss columns. Run the migration first.");
      process.exit(1);
    }
  }

  const reviewed = words.filter((w) => w.gloss_status === "reviewed");
  const candidates = words.filter((w) => w.gloss_status !== "reviewed");

  const updates: { id: number; gloss: string; classifiers?: string[] }[] = [];
  const changedRows: (string | number)[][] = [];
  const fallbackRows: (string | number)[][] = [];
  let classifierAdds = 0;

  for (const w of candidates) {
    const result = buildGloss(w.meanings);
    const existing = w.classifiers ?? [];
    const mergedClassifiers = [...new Set([...existing, ...result.classifiers])];
    const classifiersChanged = mergedClassifiers.length !== existing.length;
    const glossChanged = result.gloss !== (w.gloss ?? "");

    if (!glossChanged && !classifiersChanged) continue;
    if (classifiersChanged) classifierAdds++;

    updates.push({
      id: w.id,
      gloss: result.gloss,
      ...(classifiersChanged ? { classifiers: mergedClassifiers } : {}),
    });

    const row = [
      w.simplified,
      w.pinyin,
      w.hsk_level,
      w.meanings.join(" | "),
      result.gloss,
      result.fallback ? "empty: kept first raw sense" : "",
    ];
    (result.fallback ? fallbackRows : changedRows).push(row);
  }

  writeCsv(
    REPORT,
    ["hanzi", "pinyin", "level", "raw_meanings", "new_gloss", "note"],
    [...changedRows, ...fallbackRows],
  );

  console.log(`Words:                    ${words.length}`);
  console.log(`Skipped (reviewed):       ${reviewed.length}`);
  console.log(`Gloss changed:            ${updates.length}`);
  console.log(`Empty after cleanup:      ${fallbackRows.length} (kept first raw sense)`);
  console.log(`Got classifiers from CL:  ${classifierAdds}`);
  console.log(`Report:                   ${REPORT}`);

  if (!WRITE) {
    console.log("\nDry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  let written = 0;
  const failed: number[] = [];
  await mapLimit(updates, 10, async (u) => {
    const { id, ...fields } = u;
    // The status filter is a second guard: a row reviewed since the read
    // above is left alone.
    const { error } = await admin
      .from("words")
      .update(fields)
      .eq("id", id)
      .eq("gloss_status", "auto");
    if (error) failed.push(id);
    else written++;
  });
  console.log(`\nWrote ${written} rows.${failed.length ? ` Failed: ${failed.join(", ")}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
