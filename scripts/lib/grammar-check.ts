// Checks a grammar example against the point's level: segments the hanzi
// into words from the words table and compares their 2025 levels, and
// checks that the pinyin has a syllable for every character.
//
// Segmentation (bidirectional maximum matching, numbers with 点 分 个) is
// src/lib/grammar/segment.ts, shared with the lesson pages.
//
// Levels are the words table's 2025 levels, lowered to N for words in a
// level N word list of the grammar syllabus (杯 is a level 1 名量词, 没 a
// level 1 否定副词, with no 2025 level in words).
//
// An example fails when it uses a word above the point's level, or a
// character that's in no word of the table; names (src/lib/grammar/
// names.ts) and numbers (一 二 ... 万 亿, 两) are exempt. A word in the
// table with no 2025 level is a warning, not a failure: the 2025 lists
// leave out some everyday words.
import { NAMES } from "../../src/lib/grammar/names";
import { segment, type Lexicon } from "../../src/lib/grammar/segment";
import { readSource } from "./grammar";
import { toPinyinPlain } from "./pinyin";
import type { WordRow } from "./words";

export type { Lexicon };

const HAN = /\p{Script=Han}/u;

export function buildLexicon(words: Pick<WordRow, "simplified" | "hsk3_2025_level">[]): Lexicon {
  const level = new Map<string, number | null>();
  let maxLength = 1;
  for (const w of words) {
    const l = w.hsk3_2025_level ?? null;
    const had = level.get(w.simplified);
    level.set(w.simplified, had == null ? l : l == null ? had : Math.min(had, l));
    maxLength = Math.max(maxLength, [...w.simplified].length);
  }
  // The syllabus word lists: a word listed at level N is level N at most.
  for (const p of readSource().points) {
    for (const form of p.items.flatMap((i) => i.forms)) {
      const had = level.get(form);
      level.set(form, had == null ? p.level : Math.min(had, p.level));
      maxLength = Math.max(maxLength, [...form].length);
    }
  }
  return { level, maxLength, names: [...NAMES] };
}

/** Every pinyin syllable, plain (ü as v): the initials with the finals
 *  they take, and the zero-initial spellings (a, er, yi, wu ...). */
const SYLLABLES = (() => {
  const basic = ["a", "o", "e", "ai", "ei", "ao", "ou", "an", "en", "ang", "eng", "ong"];
  const iFinals = ["i", "ia", "ie", "iao", "iu", "ian", "in", "iang", "ing", "iong"];
  const uFinals = ["u", "ua", "uo", "uai", "ui", "uan", "un", "uang"];
  const vFinals = ["v", "ve", "van", "vn"];
  const set = new Set([
    ...basic,
    "er",
    ...["i", "a", "e", "ao", "ou", "an", "in", "ang", "ing", "ong", "u", "ue", "uan", "un"].map((f) => "y" + f),
    ...["u", "a", "o", "ai", "ei", "an", "en", "ang", "eng"].map((f) => "w" + f),
  ]);
  for (const c of ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "zh", "ch", "sh", "r", "z", "c", "s"]) {
    // g k h and the sibilants take no i finals; the sibilants take bare i.
    const finals = [...basic, ...uFinals, ..."gkh".includes(c) ? [] : /^[zcsr]/.test(c) ? ["i"] : iFinals];
    if (c === "n" || c === "l") finals.push("v", "ve");
    for (const f of finals) set.add(c + f);
  }
  // j q x take i and ü finals, ü written u.
  for (const c of ["j", "q", "x"]) for (const f of [...iFinals, ...vFinals.map((f) => f.replace("v", "u"))]) set.add(c + f);
  return set;
})();
const LONGEST_SYLLABLE = Math.max(...[...SYLLABLES].map((s) => s.length));

/** Syllables in the pinyin: each chunk of letters split greedily, longest
 *  syllable first, "r" after a syllable counted as erhua ("yìdiǎnr" -> 2
 *  syllables, 1 erhua). `bad` lists chunks that don't split. */
export function countSyllables(pinyin: string) {
  const plain = pinyin
    .normalize("NFC")
    .toLowerCase()
    .replace(/u:/g, "ü");
  const chunks = toPinyinPlainKeepGaps(plain).match(/[a-z]+/g) ?? [];
  let syllables = 0;
  let erhua = 0;
  const bad: string[] = [];
  for (const chunk of chunks) {
    let found = 0;
    let r = 0;
    let i = 0;
    while (i < chunk.length) {
      let n = Math.min(LONGEST_SYLLABLE, chunk.length - i);
      for (; n >= 1; n--) if (SYLLABLES.has(chunk.slice(i, i + n))) break;
      if (n) {
        found++;
        i += n;
      } else if (chunk[i] === "r" && found) {
        r++;
        i++;
      } else break;
    }
    if (i < chunk.length) {
      bad.push(chunk);
      continue;
    }
    syllables += found;
    erhua += r;
  }
  return { syllables, erhua, bad };
}

/** Tone marks off and ü as v, keeping spaces and punctuation as gaps. */
function toPinyinPlainKeepGaps(s: string) {
  return s
    .split(/([^\p{L}]+)/u)
    .map((part) => (/^\p{L}+$/u.test(part) ? (toPinyinPlain(part) ?? "") : " "))
    .join("");
}

export interface ExampleInput {
  hanzi: string;
  pinyin: string;
}

export interface CheckResult {
  maxWordLevel: number | null;
  /** Words above the point's level, and characters in no word. */
  failures: string[];
  /** Words in the table with no 2025 level. */
  warnings: string[];
  /** Pinyin that doesn't fit the hanzi. */
  pinyinFlags: string[];
}

export function checkExample(example: ExampleInput, pointLevel: number, lex: Lexicon): CheckResult {
  const tokens = segment(example.hanzi, lex);
  const leveled = tokens.filter((t) => t.kind === "word");
  const maxWordLevel = leveled.length ? Math.max(...leveled.map((t) => t.level!)) : null;
  const failures = [
    ...leveled.filter((t) => t.level! > pointLevel).map((t) => `${t.text} (level ${t.level === 7 ? "7-9" : t.level})`),
    ...tokens.filter((t) => t.kind === "unknown").map((t) => `${t.text} (not in words)`),
  ];
  const warnings = tokens.filter((t) => t.kind === "unleveled").map((t) => `${t.text} (no 2025 level)`);

  // Digits or Latin letters in the hanzi have no fixed syllable count, so
  // the pinyin isn't compared.
  const pinyinFlags: string[] = [];
  if (!/[0-9A-Za-z０-９]/.test(example.hanzi)) {
    const chars = [...example.hanzi].filter((c) => HAN.test(c)).length;
    const { syllables, erhua, bad } = countSyllables(example.pinyin);
    if (bad.length) pinyinFlags.push(`not pinyin: ${bad.join(", ")}`);
    else if (syllables + erhua !== chars) {
      pinyinFlags.push(`${syllables} syllables${erhua ? ` + ${erhua} erhua` : ""} for ${chars} characters`);
    }
  }
  return { maxWordLevel, failures, warnings, pinyinFlags };
}
