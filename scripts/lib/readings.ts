// The raw dataset (drkameleon/complete-hsk-vocabulary) and the choice of
// which reading of a word to store. Shared by seed-words.ts, seed-hsk3.ts
// and fix-readings.ts so a fresh seed and a repaired table agree.
//
// A dataset entry can have several readings ("forms"), and the first is
// often not the everyday one: 白 lists Bái "surname Bai" before bái
// "white", 听 lists yǐn "smile (archaic)" before tīng "to listen".
import { isJunkSense } from "./gloss";
import { storedNumeric, storedToned } from "./pinyin";
import { MEANINGS_OVERRIDES, READING_OVERRIDES } from "./reading-overrides";

export const SOURCE_URL =
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json";

export interface SourceForm {
  traditional?: string;
  transcriptions?: { pinyin?: string; numeric?: string };
  meanings?: string[];
  classifiers?: string[];
}

export interface SourceEntry {
  simplified: string;
  radical?: string;
  level?: string[];
  frequency?: number;
  pos?: string[];
  forms?: SourceForm[];
}

export async function fetchDataset(): Promise<SourceEntry[]> {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const entries = (await res.json()) as SourceEntry[];
  console.log(`Fetched ${entries.length} entries`);
  return entries;
}

const OLD_LEVEL_RE = /^old-([1-6])$/;

/** Old HSK (2.0) level from the entry's tags, or null if it has none. */
export function extractHskLevel(level: string[] | undefined): number | null {
  for (const tag of level ?? []) {
    const match = OLD_LEVEL_RE.exec(tag);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

// HSK 3.0 tags. "new-1" to "new-6", and "new-7" for the combined bands 7
// to 9, are the 2021 standard (GF0025-2021), stored in words.hsk3_level.
// "newest-1" to "newest-7" are the 2025 exam syllabus (added to the dataset
// in February 2026, "matching 2026 syllabus"; its README doesn't document
// them), stored in words.hsk3_2025_level. Both are per level, not
// cumulative: a word has at most one tag of each.
//
// The newest-* lists are incomplete at the top: against the syllabus's
// 300, 200, 500, 1,000, 1,600, 1,800 and 5,600 words, the dataset has 294,
// 197, 487, 972, 1,547, 1,684 and 4,876. Levels 1 to 5 are within about
// 3% (homographs the syllabus lists twice, like 好 hǎo / hào, account for
// most of that); level 6 is 6% short and bands 7 to 9 about 13% short.
const HSK3_2021_RE = /^new-([1-7])$/;
const HSK3_2025_RE = /^newest-([1-7])$/;

function levelFrom(level: string[] | undefined, re: RegExp): number | null {
  for (const tag of level ?? []) {
    const match = re.exec(tag);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

/** HSK 3.0 level in the 2021 standard (7 = bands 7 to 9), or null. */
export const extractHsk3Level = (level: string[] | undefined) => levelFrom(level, HSK3_2021_RE);

/** HSK 3.0 level in the 2025 syllabus (7 = bands 7 to 9), or null. */
export const extractHsk3_2025Level = (level: string[] | undefined) => levelFrom(level, HSK3_2025_RE);

/** True for a word moink seeds: any old HSK, 2021 or 2025 level. */
export const isSeededEntry = (entry: SourceEntry) =>
  extractHskLevel(entry.level) !== null ||
  extractHsk3Level(entry.level) !== null ||
  extractHsk3_2025Level(entry.level) !== null;

/** The fields a word takes from its chosen reading. */
export interface Reading {
  pinyin: string;
  pinyin_numeric: string | null;
  traditional: string | null;
  meanings: string[];
  classifiers: string[];
}

export interface ReadingChoice {
  reading: Reading;
  /** Index into entry.forms. */
  formIndex: number;
  /** False when every reading is junk (surname, variant, archaic, ...);
   *  the reading is then just the first one with pinyin and meanings. */
  usable: boolean;
  /** True when READING_OVERRIDES picked it. */
  overridden: boolean;
  /** True when MEANINGS_OVERRIDES replaced its meanings. */
  meaningsOverridden: boolean;
}

// A few readings keep CC-CEDICT's spelling (略 lu:è, 闺女 guī ˙nu:); they're
// stored the way every other word is (lüè, guī nü; scripts/lib/pinyin.ts).
function toReading(form: SourceForm): Reading {
  return {
    pinyin: storedToned(form.transcriptions?.pinyin ?? ""),
    pinyin_numeric: storedNumeric(form.transcriptions?.numeric ?? null),
    traditional: form.traditional ?? null,
    meanings: form.meanings ?? [],
    classifiers: form.classifiers ?? [],
  };
}

// Capitalized pinyin marks a proper noun (a surname or place name).
const CAPITALIZED = /^[A-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ]/;

export const isCapitalized = (pinyin: string) => CAPITALIZED.test(pinyin);

// Overrides are compared as the dataset writes pinyin: same tone marks,
// same case; only Unicode form and spacing are normalized.
const samePinyin = (a: string, b: string) =>
  a.normalize("NFC").replace(/\s+/g, " ").trim() ===
  b.normalize("NFC").replace(/\s+/g, " ").trim();

/** The entry's readings that have pinyin and meanings, in dataset order. */
export function readingsOf(entry: SourceEntry) {
  return (entry.forms ?? [])
    .map((form, formIndex) => ({ formIndex, reading: toReading(form) }))
    .filter(({ reading }) => reading.pinyin !== "" && reading.meanings.length > 0);
}

export const isUsableReading = (reading: Reading) =>
  reading.meanings.some((sense) => !isJunkSense(sense));

export class ReadingOverrideError extends Error {}

/**
 * Pick the reading to store. READING_OVERRIDES wins when it names the
 * word; otherwise the first reading with at least one usable sense,
 * preferring lowercase pinyin over capitalized. Readings without pinyin or
 * meanings are never chosen. Returns null when the entry has no reading
 * with pinyin and meanings at all. Throws ReadingOverrideError when an
 * override matches none of the word's readings. MEANINGS_OVERRIDES then
 * replaces the chosen reading's meanings, for a word whose dataset
 * readings all lack its HSK sense.
 */
export function chooseReading(entry: SourceEntry): ReadingChoice | null {
  const choice = chooseDatasetReading(entry);
  const meanings = MEANINGS_OVERRIDES[entry.simplified];
  if (!choice || !meanings) return choice;
  return { ...choice, reading: { ...choice.reading, meanings }, usable: true, meaningsOverridden: true };
}

function chooseDatasetReading(entry: SourceEntry): ReadingChoice | null {
  const forms = readingsOf(entry);

  const override = READING_OVERRIDES[entry.simplified];
  if (override !== undefined) {
    const want = typeof override === "string" ? { pinyin: override } : override;
    const matches = forms.filter(
      ({ reading }) =>
        samePinyin(reading.pinyin, want.pinyin) &&
        (!("traditional" in want) || reading.traditional === want.traditional),
    );
    // Some words list the same pinyin twice (a real sense and a "variant
    // of" note); take the usable one.
    const pick = matches.find(({ reading }) => isUsableReading(reading)) ?? matches[0];
    if (!pick) {
      const label = "traditional" in want ? `${want.pinyin} [${want.traditional}]` : want.pinyin;
      throw new ReadingOverrideError(
        `${entry.simplified}: override "${label}" matches none of its readings (${forms.map(({ reading }) => `${reading.pinyin} [${reading.traditional ?? "-"}]`).join(", ") || "none"})`,
      );
    }
    return { ...pick, usable: true, overridden: true, meaningsOverridden: false };
  }

  if (forms.length === 0) return null;
  const usable = forms.filter(({ reading }) => isUsableReading(reading));
  const pick = usable.find(({ reading }) => !isCapitalized(reading.pinyin)) ?? usable[0];

  return pick
    ? { ...pick, usable: true, overridden: false, meaningsOverridden: false }
    : { ...forms[0], usable: false, overridden: false, meaningsOverridden: false };
}

/**
 * Check every override against the dataset before a script changes
 * anything: each must name a seeded word (old HSK, or an HSK 3.0 level in
 * either standard; isSeededEntry) and match one of its readings. Prints
 * every problem and exits, so a typo can't slip through.
 */
export function assertOverridesValid(entries: SourceEntry[]) {
  const seeded = new Map(entries.filter(isSeededEntry).map((e) => [e.simplified, e]));
  const problems: string[] = [];
  for (const hanzi of Object.keys(MEANINGS_OVERRIDES)) {
    if (!seeded.has(hanzi)) problems.push(`${hanzi}: meanings override for a word that's not an old HSK or HSK 3.0 word in the dataset`);
    else if (MEANINGS_OVERRIDES[hanzi].length === 0) problems.push(`${hanzi}: meanings override is empty`);
  }
  for (const hanzi of Object.keys(READING_OVERRIDES)) {
    const entry = seeded.get(hanzi);
    if (!entry) {
      problems.push(`${hanzi}: not an old HSK or HSK 3.0 word in the dataset`);
      continue;
    }
    try {
      chooseReading(entry);
    } catch (err) {
      if (err instanceof ReadingOverrideError) problems.push(err.message);
      else throw err;
    }
  }
  if (problems.length > 0) {
    console.error(`\nThe overrides have ${problems.length} problem(s), nothing was done:`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("Fix scripts/lib/reading-overrides.ts and run again.");
    process.exit(1);
  }
  const count = Object.keys(READING_OVERRIDES).length;
  if (count > 0) console.log(`Reading overrides: ${count}, all match a dataset reading.`);
  const meaningsCount = Object.keys(MEANINGS_OVERRIDES).length;
  if (meaningsCount > 0) console.log(`Meanings overrides: ${meaningsCount}, all for seeded words.`);
}
