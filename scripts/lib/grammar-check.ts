// Checks a grammar example against the point's level: segments the hanzi
// into words from the words table and compares their 2025 levels, and
// checks that the pinyin has a syllable for every character.
//
// Segmentation is bidirectional maximum matching over every word in the
// table: longest match first, from the left and from the right. When the
// two disagree (说明+天 / 说+明天), the split with fewer characters in no
// word wins, then fewer words with no 2025 level, then the lower highest
// word level, then fewer words. When a match has no 2025 level (北京, 没)
// but splits wholly into words that have one, the split is used.
// Punctuation, digits and Latin letters are skipped. A trailing 儿 that
// isn't a word of its own is erhua and joins the word before it (玩儿 ->
// 玩).
//
// A number followed by 点, 分 or 个 is a number (十点, 一个: not 个人),
// before any matching, unless together they start a word with a 2025
// level (十分 "very") and don't follow another such number (十点十分).
//
// Levels are the words table's 2025 levels, lowered to N for words in a
// level N word list of the grammar syllabus (杯 is a level 1 名量词, 没 a
// level 1 否定副词, with no 2025 level in words).
//
// An example fails when it uses a word above the point's level, or a
// character that's in no word of the table; names (scripts/data/grammar/
// names.txt) and numbers (一 二 ... 万 亿, 两) are exempt. A word in the
// table with no 2025 level is a warning, not a failure: the 2025 lists
// leave out some everyday words.
import { existsSync, readFileSync } from "node:fs";

import { readSource } from "./grammar";
import { toPinyinPlain } from "./pinyin";
import type { WordRow } from "./words";

const NAMES_FILE = "scripts/data/grammar/names.txt";
const HAN = /\p{Script=Han}/u;
const NUMERALS = new Set([..."零〇一二三四五六七八九十百千万亿两"]);
/** Measures that make a number with the numerals before them. */
const NUMBER_MEASURES = new Set([..."点分个"]);

export interface Lexicon {
  /** simplified -> lowest 2025 level of its rows, null when none has one. */
  level: Map<string, number | null>;
  maxLength: number;
  names: string[];
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
  const names = existsSync(NAMES_FILE)
    ? readFileSync(NAMES_FILE, "utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
    : [];
  return { level, maxLength, names };
}

export interface Token {
  text: string;
  kind: "word" | "unleveled" | "unknown" | "name" | "number";
  level: number | null;
}

/** Leveled words covering all of `chars`, longest first, or null. */
function splitLeveled(chars: string[], lex: Lexicon): Token[] | null {
  const out: Token[] = [];
  for (let i = 0; i < chars.length; ) {
    let found = false;
    for (let n = Math.min(lex.maxLength, chars.length - i); n >= 1; n--) {
      const text = chars.slice(i, i + n).join("");
      const level = lex.level.get(text);
      if (level != null) {
        out.push({ text, kind: "word", level });
        i += n;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return out;
}

/** A run of characters as matching cut it: a name, a word of the table,
 *  or a character in neither. */
interface Piece {
  text: string;
  kind: "name" | "match" | "char";
}

/** Numbers made with 点, 分 or 个 in a run of Han characters: [start, end)
 *  spans, left to right. */
function numberUnits(chars: string[], lex: Lexicon) {
  const units: { start: number; end: number }[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (!NUMERALS.has(chars[i]) || NUMERALS.has(chars[i - 1])) continue;
    let j = i;
    while (NUMERALS.has(chars[j])) j++;
    if (!NUMBER_MEASURES.has(chars[j])) continue;
    // A leveled word over the number and its measure (十分, 有一点儿) keeps
    // it, unless a number comes just before (十点十分).
    let inWord = false;
    for (let k = Math.max(0, i - lex.maxLength + 1); k <= i && !inWord; k++) {
      for (let n = j + 1 - k; n <= lex.maxLength && k + n <= chars.length && !inWord; n++) {
        inWord = lex.level.get(chars.slice(k, k + n).join("")) != null;
      }
    }
    if (inWord && units.at(-1)?.end !== i) continue;
    units.push({ start: i, end: j + 1 });
  }
  return units;
}

/** Longest match first from the left: a name, else the longest word. */
function matchForward(chars: string[], lex: Lexicon): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < chars.length; ) {
    const rest = chars.slice(i).join("");
    const name = lex.names.find((n) => rest.startsWith(n));
    if (name) {
      pieces.push({ text: name, kind: "name" });
      i += [...name].length;
      continue;
    }
    let n = Math.min(lex.maxLength, chars.length - i);
    for (; n >= 1; n--) if (lex.level.has(chars.slice(i, i + n).join(""))) break;
    pieces.push(n ? { text: chars.slice(i, i + n).join(""), kind: "match" } : { text: chars[i], kind: "char" });
    i += n || 1;
  }
  return pieces;
}

/** Longest match first from the right. */
function matchBackward(chars: string[], lex: Lexicon): Piece[] {
  const pieces: Piece[] = [];
  for (let j = chars.length; j > 0; ) {
    const before = chars.slice(0, j).join("");
    const name = lex.names.find((n) => before.endsWith(n));
    if (name) {
      pieces.push({ text: name, kind: "name" });
      j -= [...name].length;
      continue;
    }
    let n = Math.min(lex.maxLength, j);
    for (; n >= 1; n--) if (lex.level.has(chars.slice(j - n, j).join(""))) break;
    pieces.push(n ? { text: chars.slice(j - n, j).join(""), kind: "match" } : { text: chars[j - 1], kind: "char" });
    j -= n || 1;
  }
  return pieces.reverse();
}

/** Tokens for `pieces`, appended to `tokens` (erhua joins the last one). */
function addTokens(pieces: Piece[], lex: Lexicon, tokens: Token[]) {
  for (const { text, kind } of pieces) {
    if (kind === "name") {
      tokens.push({ text, kind: "name", level: null });
    } else if (kind === "char") {
      // Erhua joins the word or number before it (玩儿, 一点儿), not a bare
      // numeral.
      const prev = tokens[tokens.length - 1];
      if (text === "儿" && prev && !NUMERALS.has([...prev.text].at(-1)!)) prev.text += text;
      else tokens.push({ text, kind: NUMERALS.has(text) ? "number" : "unknown", level: null });
    } else if ([...text].every((c) => NUMERALS.has(c))) {
      tokens.push({ text, kind: "number", level: null });
    } else if (lex.level.get(text) != null) {
      tokens.push({ text, kind: "word", level: lex.level.get(text)! });
    } else {
      // No 2025 level: use leveled parts when there are (erhua 玩儿 -> 玩).
      const piece = [...text];
      const base = piece[piece.length - 1] === "儿" && piece.length > 1 ? piece.slice(0, -1) : piece;
      const parts = splitLeveled(base, lex);
      if (parts) {
        if (base !== piece) parts[parts.length - 1].text += "儿";
        tokens.push(...parts);
      } else {
        tokens.push({ text, kind: "unleveled", level: null });
      }
    }
  }
}

/** Lower is better: characters in no word, words with no level, the
 *  highest level, then the number of words. */
function cost(tokens: Token[]) {
  return [
    tokens.filter((t) => t.kind === "unknown").length,
    tokens.filter((t) => t.kind === "unleveled").length,
    Math.max(0, ...tokens.map((t) => t.level ?? 0)),
    tokens.length,
  ];
}

const cheaper = (a: number[], b: number[]) => {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i !== -1 && a[i] < b[i];
};

/** Forward or backward matching of `chars`, whichever splits better. */
function matchBest(chars: string[], lex: Lexicon): Piece[] {
  const forward = matchForward(chars, lex);
  const backward = matchBackward(chars, lex);
  if (forward.map((p) => p.text).join("|") === backward.map((p) => p.text).join("|")) return forward;
  const tokensOf = (pieces: Piece[]) => {
    const tokens: Token[] = [];
    addTokens(pieces, lex, tokens);
    return tokens;
  };
  return cheaper(cost(tokensOf(backward)), cost(tokensOf(forward))) ? backward : forward;
}

export function segment(hanzi: string, lex: Lexicon): Token[] {
  const tokens: Token[] = [];
  // Runs of Han characters, between punctuation, digits and Latin letters.
  for (const run of hanzi.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run];
    let at = 0;
    for (const u of [...numberUnits(chars, lex), { start: chars.length, end: chars.length }]) {
      addTokens(matchBest(chars.slice(at, u.start), lex), lex, tokens);
      if (u.end > u.start) tokens.push({ text: chars.slice(u.start, u.end).join(""), kind: "number", level: null });
      at = u.end;
    }
  }
  return tokens;
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
