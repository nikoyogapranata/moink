// Lists old-HSK 1 to 4 words with more than one usable reading, to fill
// scripts/lib/reading-overrides.ts by hand. Reads only the dataset.
//
//   pnpm exec tsx scripts/export-polyphones.ts
//
// Writes scripts/output/polyphones.csv: hanzi, level, the pinyin the
// current rules choose, then one "pinyin: first two meanings" column per
// candidate reading. "Usable" is the same test the reading choice uses (at
// least one sense that isn't a surname, variant, archaic or pronunciation
// note). Capitalized (proper-noun) readings are left out when the word has
// a lowercase usable reading, since the rules never pick them then.
import { writeCsv } from "./lib/csv";
import {
  chooseReading,
  extractHskLevel,
  fetchDataset,
  isCapitalized,
  isUsableReading,
  readingsOf,
} from "./lib/readings";

const REPORT = "scripts/output/polyphones.csv";
const MAX_LEVEL = 4;

async function main() {
  const entries = await fetchDataset();
  const rows: { hanzi: string; level: number; chosen: string; candidates: string[] }[] = [];

  for (const entry of entries) {
    const level = extractHskLevel(entry.level);
    if (level === null || level > MAX_LEVEL) continue;

    let candidates = readingsOf(entry)
      .map(({ reading }) => reading)
      .filter(isUsableReading);
    if (candidates.some((r) => !isCapitalized(r.pinyin))) {
      candidates = candidates.filter((r) => !isCapitalized(r.pinyin));
    }
    // A word counts when its candidates have more than one distinct pinyin.
    if (new Set(candidates.map((r) => r.pinyin)).size < 2) continue;

    rows.push({
      hanzi: entry.simplified,
      level,
      chosen: chooseReading(entry)?.reading.pinyin ?? "",
      candidates: candidates.map((r) => `${r.pinyin}: ${r.meanings.slice(0, 2).join(" / ")}`),
    });
  }

  rows.sort((a, b) => a.level - b.level || a.hanzi.localeCompare(b.hanzi, "zh"));
  const width = Math.max(0, ...rows.map((r) => r.candidates.length));
  writeCsv(
    REPORT,
    ["hanzi", "level", "chosen_pinyin", ...Array.from({ length: width }, (_, i) => `candidate_${i + 1}`)],
    rows.map((r) => [r.hanzi, r.level, r.chosen, ...r.candidates]),
  );

  console.log(`Polyphones in old HSK 1-${MAX_LEVEL}: ${rows.length}`);
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const at = rows.filter((r) => r.level === l);
    console.log(`  HSK ${l}: ${at.length}  ${at.map((r) => r.hanzi).join(" ")}`);
  }
  console.log(`Report: ${REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
