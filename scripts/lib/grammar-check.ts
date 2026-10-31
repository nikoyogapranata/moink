// Checks a grammar example against the point's level: segments the hanzi
// into words from the words table and compares their 2025 levels, and
// checks that the pinyin has a syllable for every character.
//
// Segmentation is longest match first over every word in the table. When
// the longest match has no 2025 level (北京, 没) but splits wholly into
// words that have one, the split is used. Punctuation, digits and Latin
// letters are skipped. A trailing 儿 that isn't a word of its own is erhua
// and joins the word before it (玩儿 -> 玩).
//
// An example fails when it uses a word above the point's level, or a
// character that's in no word of the table; names (scripts/data/grammar/
// names.txt) and numbers (一 二 ... 万 亿, 两) are exempt. A word in the
// table with no 2025 level is a warning, not a failure: the 2025 lists
// leave out some everyday words (没 has none, 没有 is level 1).
import { existsSync, readFileSync } from "node:fs";

import { toPinyinPlain } from "./pinyin";
import type { WordRow } from "./words";

const NAMES_FILE = "scripts/data/grammar/names.txt";
const HAN = /\p{Script=Han}/u;
const NUMERALS = new Set([..."零〇一二三四五六七八九十百千万亿两"]);

export interface Lexicon {
  /** simplified -> lowest 2025 level of its rows, null when none has one. */
  level: Map<string, number | null>;
  maxLength: number;
  names: string[];
  /** Plain pinyin syllables ("zhong", "lv"), from the table's readings. */
  syllables: Set<string>;
}

export function buildLexicon(words: Pick<WordRow, "simplified" | "pinyin" | "hsk3_2025_level">[]): Lexicon {
  const level = new Map<string, number | null>();
  const syllables = new Set<string>();
  let maxLength = 1;
  for (const w of words) {
    const l = w.hsk3_2025_level ?? null;
    const had = level.get(w.simplified);
    level.set(w.simplified, had == null ? l : l == null ? had : Math.min(had, l));
    maxLength = Math.max(maxLength, [...w.simplified].length);
    for (const s of w.pinyin.split(/\s+/)) {
      const plain = toPinyinPlain(s);
      // Erhua ("r", or run on as in "wánr") is counted on its own (see
      // countSyllables), so it stays out of the inventory; "er" is a syllable.
      if (plain && plain.length <= 6 && (!plain.endsWith("r") || plain === "er")) syllables.add(plain);
    }
  }
  const names = existsSync(NAMES_FILE)
    ? readFileSync(NAMES_FILE, "utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
    : [];
  return { level, maxLength, names, syllables };
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

export function segment(hanzi: string, lex: Lexicon): Token[] {
  const chars = [...hanzi];
  const tokens: Token[] = [];
  for (let i = 0; i < chars.length; ) {
    if (!HAN.test(chars[i])) {
      i++;
      continue;
    }
    const rest = chars.slice(i).join("");
    const name = lex.names.find((n) => rest.startsWith(n));
    if (name) {
      tokens.push({ text: name, kind: "name", level: null });
      i += [...name].length;
      continue;
    }

    let n = Math.min(lex.maxLength, chars.length - i);
    for (; n >= 1; n--) if (lex.level.has(chars.slice(i, i + n).join(""))) break;

    if (n === 0) {
      const c = chars[i];
      const prev = tokens[tokens.length - 1];
      if (c === "儿" && prev && prev.kind !== "number") prev.text += c;
      else tokens.push({ text: c, kind: NUMERALS.has(c) ? "number" : "unknown", level: null });
      i++;
      continue;
    }

    const piece = chars.slice(i, i + n);
    const text = piece.join("");
    const level = lex.level.get(text) ?? null;
    if ([...text].every((c) => NUMERALS.has(c))) {
      tokens.push({ text, kind: "number", level: null });
    } else if (level != null) {
      tokens.push({ text, kind: "word", level });
    } else {
      // No 2025 level: use leveled parts when there are (erhua 玩儿 -> 玩).
      const base = piece[piece.length - 1] === "儿" && piece.length > 1 ? piece.slice(0, -1) : piece;
      const parts = splitLeveled(base, lex);
      if (parts) {
        if (base !== piece) parts[parts.length - 1].text += "儿";
        tokens.push(...parts);
      } else {
        tokens.push({ text, kind: "unleveled", level: null });
      }
    }
    i += n;
  }
  return tokens;
}

/** Syllables in the pinyin: each chunk of letters split into the fewest
 *  syllables of the inventory, "r" after a syllable counted as erhua
 *  ("yìdiǎnr" -> 2 syllables, 1 erhua). `bad` lists chunks that don't
 *  split. */
export function countSyllables(pinyin: string, lex: Lexicon) {
  const plain = pinyin
    .normalize("NFC")
    .toLowerCase()
    .replace(/u:/g, "ü");
  const chunks = toPinyinPlainKeepGaps(plain).match(/[a-z]+/g) ?? [];
  let syllables = 0;
  let erhua = 0;
  const bad: string[] = [];
  for (const chunk of chunks) {
    // best[i]: fewest pieces for chunk[0..i), and how many are erhua.
    const best: ({ pieces: number; erhua: number } | null)[] = [{ pieces: 0, erhua: 0 }];
    for (let i = 1; i <= chunk.length; i++) {
      best[i] = null;
      for (let j = Math.max(0, i - 6); j < i; j++) {
        const from = best[j];
        if (!from) continue;
        const piece = chunk.slice(j, i);
        const isErhua = piece === "r" && j > 0;
        if (!isErhua && !lex.syllables.has(piece) && !(piece === "r" && chunk === "r")) continue;
        const next = { pieces: from.pieces + 1, erhua: from.erhua + (piece === "r" ? 1 : 0) };
        if (!best[i] || next.pieces < best[i]!.pieces) best[i] = next;
      }
    }
    const end = best[chunk.length];
    if (!end) {
      bad.push(chunk);
      continue;
    }
    syllables += end.pieces - end.erhua;
    erhua += end.erhua;
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
    const { syllables, erhua, bad } = countSyllables(example.pinyin, lex);
    if (bad.length) pinyinFlags.push(`not pinyin: ${bad.join(", ")}`);
    else if (syllables + erhua !== chars) {
      pinyinFlags.push(`${syllables} syllables${erhua ? ` + ${erhua} erhua` : ""} for ${chars} characters`);
    }
  }
  return { maxWordLevel, failures, warnings, pinyinFlags };
}
