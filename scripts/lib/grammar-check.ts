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
// names.ts) and numbers (一 二 ... 万 亿, 两) are exempt, and so are a
// point's allow_words. A word in the table with no 2025 level is a warning,
// not a failure: the 2025 lists leave out some everyday words.
//
// Some compounds are often two words side by side (他才能去 is 才+能, not
// 才能 "talent"). Above the point's level, one of these counts as its
// characters when every one of them is a word within the level.
import { NAMES } from "../../src/lib/grammar/names";
import { segment, type Lexicon, type Token } from "../../src/lib/grammar/segment";
import { readSource } from "./grammar";
import { toPinyinPlain } from "./pinyin";
import type { WordRow } from "./words";

export type { Lexicon };

const HAN = /\p{Script=Han}/u;

const AMBIGUOUS_COMPOUNDS = new Set(
  "才能 再说 要点 本地 难得 个人 他人 好学 要好 学会 别看 穿着 都会 好说 别说 书写 天才 得了 把手 机关".split(" "),
);

/** `tokens` with each ambiguous compound above `maxLevel` split into its
 *  characters, when all of them are words within it. */
function splitAmbiguous(tokens: Token[], maxLevel: number, lex: Lexicon): Token[] {
  return tokens.flatMap((t) => {
    if (t.kind !== "word" || t.level! <= maxLevel || !AMBIGUOUS_COMPOUNDS.has(t.text)) return [t];
    const parts = [...t.text].map((text): Token => ({ text, kind: "word", level: lex.level.get(text) ?? null }));
    return parts.every((p) => p.level != null && p.level <= maxLevel) ? parts : [t];
  });
}

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

/** Splits a chunk of letters into syllables, longest first, backtracking
 *  when the rest won't split (jinguan: jing+uan fails, so jin+guan). An "r"
 *  after a syllable that starts no syllable that fits is erhua. Null when
 *  the chunk doesn't split. */
function splitChunk(chunk: string) {
  // Positions the rest of the chunk is known not to split from.
  const dead = new Set<number>();
  const from = (i: number): { syllables: number; erhua: number } | null => {
    if (i === chunk.length) return { syllables: 0, erhua: 0 };
    if (dead.has(i)) return null;
    for (let n = Math.min(LONGEST_SYLLABLE, chunk.length - i); n >= 1; n--) {
      if (!SYLLABLES.has(chunk.slice(i, i + n))) continue;
      const rest = from(i + n);
      if (rest) return { ...rest, syllables: rest.syllables + 1 };
    }
    if (chunk[i] === "r" && i > 0) {
      const rest = from(i + 1);
      if (rest) return { ...rest, erhua: rest.erhua + 1 };
    }
    dead.add(i);
    return null;
  };
  return from(0);
}

/** Syllables in the pinyin, from splitChunk on each chunk of letters
 *  ("yìdiǎnr" -> 2 syllables, 1 erhua). `bad` lists chunks that don't
 *  split. */
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
    const split = splitChunk(chunk);
    if (!split) {
      bad.push(chunk);
      continue;
    }
    syllables += split.syllables;
    erhua += split.erhua;
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

/** `allowWords` are the point's allow_words: they can't fail the check, but
 *  still count towards maxWordLevel, the words' real level. */
export function checkExample(example: ExampleInput, pointLevel: number, lex: Lexicon, allowWords: string[] = []): CheckResult {
  const tokens = splitAmbiguous(segment(example.hanzi, lex), pointLevel, lex);
  // Erhua joins its token (玩儿), which 玩 in the list also covers.
  const allowed = (t: Token) => allowWords.includes(t.text) || (t.text.endsWith("儿") && allowWords.includes(t.text.slice(0, -1)));
  const leveled = tokens.filter((t) => t.kind === "word");
  const maxWordLevel = leveled.length ? Math.max(...leveled.map((t) => t.level!)) : null;
  const failures = [
    ...leveled.filter((t) => t.level! > pointLevel && !allowed(t)).map((t) => `${t.text} (level ${t.level === 7 ? "7-9" : t.level})`),
    ...tokens.filter((t) => t.kind === "unknown" && !allowed(t)).map((t) => `${t.text} (not in words)`),
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
