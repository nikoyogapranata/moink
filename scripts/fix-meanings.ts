// Replaces the stored reading data of three words whose rows came from the
// wrong dataset reading. Each lists the same pinyin more than once, told
// apart only by the traditional character:
//
//   药 yào   stored 葯 "leaf of the iris"   should be 藥 "medicine"
//   当 dāng  stored 噹 "(onom.) dong"       should be 當 "to act as; when; should"
//   咸 xián  stored 咸 "all; everyone"      should be 鹹 "salted; salty"
//
//   pnpm exec tsx scripts/fix-meanings.ts           dry run
//   pnpm exec tsx scripts/fix-meanings.ts --write   update the database
//
// Their glosses are already reviewed, so fix-readings.ts skips them; this
// script updates them directly. It sets meanings, and traditional and
// classifiers too, since those come from the same reading. gloss and
// gloss_status are left alone. The right reading is picked by
// READING_OVERRIDES (scripts/lib/reading-overrides.ts), the same entries a
// fresh seed uses.
import { createAdminClient, hasFlag } from "./lib/admin";
import {
  assertOverridesValid,
  chooseReading,
  extractHskLevel,
  fetchDataset,
} from "./lib/readings";

const TARGETS: { id: number; hanzi: string }[] = [
  { id: 4220, hanzi: "药" },
  { id: 733, hanzi: "当" },
  { id: 3900, hanzi: "咸" },
];

const WRITE = hasFlag("--write");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function main() {
  const admin = createAdminClient();
  const entries = await fetchDataset();
  assertOverridesValid(entries);

  const { data: rows, error } = await admin
    .from("words")
    .select("id, simplified, pinyin, traditional, meanings, classifiers")
    .in("id", TARGETS.map((t) => t.id));
  if (error) throw error;

  const updates: { id: number; fields: { meanings: string[]; traditional: string | null; classifiers: string[] } }[] = [];
  let problems = 0;

  for (const target of TARGETS) {
    const row = rows?.find((r) => r.id === target.id);
    const entry = entries.find(
      (e) => e.simplified === target.hanzi && extractHskLevel(e.level) !== null,
    );
    const choice = entry && chooseReading(entry);

    if (!row || row.simplified !== target.hanzi) {
      console.error(`${target.hanzi} (id ${target.id}): row missing or id holds ${row?.simplified ?? "nothing"}`);
      problems++;
      continue;
    }
    if (!choice?.overridden) {
      console.error(`${target.hanzi}: no reading override applies; add one to reading-overrides.ts`);
      problems++;
      continue;
    }
    // These fixes keep the pinyin; a different pinyin means the wrong row
    // or override.
    if (choice.reading.pinyin !== row.pinyin) {
      console.error(`${target.hanzi}: stored pinyin ${row.pinyin} but the override picks ${choice.reading.pinyin}`);
      problems++;
      continue;
    }

    const fields = {
      meanings: choice.reading.meanings,
      traditional: choice.reading.traditional,
      classifiers: choice.reading.classifiers,
    };
    console.log(`\n${target.hanzi} ${row.pinyin} (id ${row.id})`);
    if (same(row.meanings, fields.meanings) && same(row.traditional, fields.traditional) && same(row.classifiers ?? [], fields.classifiers)) {
      console.log("  already correct");
      continue;
    }
    console.log(`  meanings     ${JSON.stringify(row.meanings)}\n            -> ${JSON.stringify(fields.meanings)}`);
    console.log(`  traditional  ${row.traditional} -> ${fields.traditional}`);
    console.log(`  classifiers  ${JSON.stringify(row.classifiers ?? [])} -> ${JSON.stringify(fields.classifiers)}`);
    updates.push({ id: row.id, fields });
  }

  console.log(`\n${updates.length} row(s) to update${problems ? `, ${problems} problem(s)` : ""}.`);
  if (problems) process.exit(1);
  if (!WRITE) {
    console.log("Dry run. Nothing was written. Re-run with --write to update the database.");
    return;
  }

  for (const { id, fields } of updates) {
    const { error: updateError } = await admin.from("words").update(fields).eq("id", id);
    if (updateError) {
      console.error(`id ${id} failed:`, updateError.message);
      process.exit(1);
    }
  }
  console.log(`Updated ${updates.length} row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
