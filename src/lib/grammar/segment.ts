// Splits Chinese text into words of the words table, for the grammar
// checker (scripts/lib/grammar-check.ts) and the lesson pages (tappable
// words). No I/O: the caller builds the Lexicon.
//
// Segmentation is bidirectional maximum matching: longest match first,
// from the left and from the right. When the two disagree (说明+天 /
// 说+明天), the split with fewer characters in no word wins, then fewer
// words with no 2025 level, then the lower highest word level, then fewer
// words. When a match has no 2025 level (北京) but splits wholly into
// words that have one, the split is used. Punctuation, digits and Latin
// letters are skipped. A trailing 儿 that isn't a word of its own is erhua
// and joins the word before it (玩儿 -> 玩).
//
// A number followed by 点, 分 or 个 is a number (十点, 一个: not 个人),
// before any matching, unless together they are in a word with a 2025
// level (十分 "very") and don't follow another such number (十点十分).

const NUMERALS = new Set([..."零〇一二三四五六七八九十百千万亿两"]);
/** Measures that make a number with the numerals before them. */
const NUMBER_MEASURES = new Set([..."点分个"]);

export interface Lexicon {
  /** simplified -> lowest 2025 level, null when it has none. */
  level: Map<string, number | null>;
  /** Longest word, in characters. */
  maxLength: number;
  /** Names, longest first: never split, never leveled. */
  names: string[];
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
