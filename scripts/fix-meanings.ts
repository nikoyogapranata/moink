// Replaces the stored reading data of words whose rows came from the
// wrong dataset reading. Each lists the same pinyin more than once, told
// apart only by the traditional character:
//
//   药 yào   stored 葯 "leaf of the iris"   should be 藥 "medicine"
//   当 dāng  stored 噹 "(onom.) dong"       should be 當 "to act as; when; should"
//   咸 xián  stored 咸 "all; everyone"      should be 鹹 "salted; salty"
//   后 hòu   stored 后 "empress; queen"     should be 後 "after; behind; later"
//   考 kǎo   stored 攷 "to beat; to hit"    should be 考 "to test; to take an exam"
//   周 zhōu  stored 周 "to make a circuit"  should be 週 "week"
//   岁 suì   stored 嵗 "variant of 岁"      should be 歲 "years (of age); year"
//   裤子     stored 袴子 "variant of 裤子"  should be 褲子 "trousers; pants"
//   照 zhào  stored 炤 "variant of 照"      should be 照 "according to; to shine"
//   期 qī    stored 朞 "variant of 期"      should be 期 "period; phase"
//   证 zhèng stored 証 "to admonish"        should be 證 "certificate; proof"
//   困 kùn   stored 困 "to trap"            should be 睏 "sleepy; tired"
//   台 tái   stored 檯 "desk; table"        should be 臺 "platform; stage"
//   表 biǎo  stored 表 "exterior surface"   should be 錶 "watch (timepiece)"
//   准 zhǔn  stored 准 "to allow"           should be 準 "accurate; standard"
//            (后, 考, 周, 照, 期, 证, 表 and 准 are HSK 3.0 words, seeded by
//            seed-hsk3.ts)
//
// And some stored with the wrong pinyin, so their pinyin, pinyin_numeric
// and search columns change too:
//
//   正 zhēng "first month of the lunar year"  should be zhèng "straight; main"
//   节 jiē   "see 节骨眼"                     should be jié "joint; section"
//   片 piān  "disk; sheet"                    should be piàn "thin piece; slice"
//   重 chóng "to repeat"                      should be zhòng "heavy"
//   背 bēi   "to carry on the back"           should be bèi "the back; to memorize"
//   嗯 ēn    "(a groaning sound)"             should be èn "OK, yeah; what?"
//
// And one with no dataset reading that has its HSK sense, fixed by
// MEANINGS_OVERRIDES (the same file):
//
//   一块儿   stored "a piece; one yuan"  should be "together; in the same place"
//
//   pnpm exec tsx scripts/fix-meanings.ts           dry run
//   pnpm exec tsx scripts/fix-meanings.ts --write   update the database
//
// Their glosses are already reviewed, so fix-readings.ts skips them; this
// script updates them directly. It sets meanings, and traditional and
// classifiers too, since those come from the same reading (and the pinyin
// fields for a target marked pinyinChange). gloss and
// gloss_status are left alone. The right reading is picked by
// READING_OVERRIDES (scripts/lib/reading-overrides.ts), the same entries a
// fresh seed uses.
import { createAdminClient, hasFlag } from "./lib/admin";
import { searchFields } from "./lib/pinyin";
import {
  assertOverridesValid,
  chooseReading,
  fetchDataset,
  isSeededEntry,
} from "./lib/readings";

/** pinyinChange: the override picks another pinyin, which is the fix. */
const TARGETS: { id: number; hanzi: string; pinyinChange?: true }[] = [
  { id: 4220, hanzi: "药" },
  { id: 733, hanzi: "当" },
  { id: 3900, hanzi: "咸" },
  { id: 6911, hanzi: "后" },
  { id: 7670, hanzi: "考" },
  { id: 11255, hanzi: "周" },
  { id: 3470, hanzi: "岁" },
  { id: 2189, hanzi: "裤子" },
  { id: 11034, hanzi: "照" },
  { id: 8580, hanzi: "期" },
  { id: 11111, hanzi: "证" },
  { id: 2211, hanzi: "困" },
  { id: 3492, hanzi: "台" },
  { id: 5223, hanzi: "表" },
  { id: 11348, hanzi: "准" },
  { id: 4662, hanzi: "正", pinyinChange: true },
  { id: 1905, hanzi: "节", pinyinChange: true },
  { id: 2735, hanzi: "片", pinyinChange: true },
  { id: 4780, hanzi: "重", pinyinChange: true },
  { id: 146, hanzi: "背", pinyinChange: true },
  { id: 2588, hanzi: "嗯", pinyinChange: true },
  { id: 10538, hanzi: "一块儿" },
];

const PINYIN_FIELDS = ["pinyin", "pinyin_numeric", "pinyin_plain", "pinyin_num"] as const;

type Fields = {
  meanings: string[];
  traditional: string | null;
  classifiers: string[];
  pinyin?: string;
  pinyin_numeric?: string | null;
  pinyin_plain?: string | null;
  pinyin_num?: string | null;
};

const WRITE = hasFlag("--write");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function main() {
  const admin = createAdminClient();
  const entries = await fetchDataset();
  assertOverridesValid(entries);

  const { data: rows, error } = await admin
    .from("words")
    .select("id, simplified, pinyin, pinyin_numeric, pinyin_plain, pinyin_num, traditional, meanings, classifiers")
    .in("id", TARGETS.map((t) => t.id));
  if (error) throw error;

  const updates: { id: number; fields: Fields }[] = [];
  let problems = 0;

  for (const target of TARGETS) {
    const row = rows?.find((r) => r.id === target.id);
    // Any seeded word: old HSK, or HSK 3.0 only (后).
    const entry = entries.find((e) => e.simplified === target.hanzi && isSeededEntry(e));
    const choice = entry && chooseReading(entry);

    if (!row || row.simplified !== target.hanzi) {
      console.error(`${target.hanzi} (id ${target.id}): row missing or id holds ${row?.simplified ?? "nothing"}`);
      problems++;
      continue;
    }
    if (!choice?.overridden && !choice?.meaningsOverridden) {
      console.error(`${target.hanzi}: no reading or meanings override applies; add one to reading-overrides.ts`);
      problems++;
      continue;
    }
    // Fixes keep the pinyin unless marked pinyinChange; otherwise a
    // different pinyin means the wrong row or override.
    if (!target.pinyinChange && choice.reading.pinyin !== row.pinyin) {
      console.error(`${target.hanzi}: stored pinyin ${row.pinyin} but the override picks ${choice.reading.pinyin}`);
      problems++;
      continue;
    }

    const fields: Fields = {
      meanings: choice.reading.meanings,
      traditional: choice.reading.traditional,
      classifiers: choice.reading.classifiers,
      // The pinyin and its search forms, as a seed stores them.
      ...(target.pinyinChange
        ? { pinyin: choice.reading.pinyin, pinyin_numeric: choice.reading.pinyin_numeric, ...searchFields(choice.reading) }
        : {}),
    };
    console.log(`\n${target.hanzi} ${row.pinyin} (id ${row.id})`);
    const pinyinSame = !target.pinyinChange || PINYIN_FIELDS.every((k) => same(row[k], fields[k]));
    if (
      pinyinSame &&
      same(row.meanings, fields.meanings) &&
      same(row.traditional, fields.traditional) &&
      same(row.classifiers ?? [], fields.classifiers)
    ) {
      console.log("  already correct");
      continue;
    }
    if (target.pinyinChange) {
      for (const k of PINYIN_FIELDS) console.log(`  ${k.padEnd(15)}${row[k]} -> ${fields[k]}`);
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
