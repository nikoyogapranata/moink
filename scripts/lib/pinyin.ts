// Search forms of pinyin, stored in words.pinyin_plain / words.pinyin_num.
// public.pinyin_plain() and public.pinyin_num() in
// supabase/migrations/20261101120000_dictionary_search.sql do the same to
// a search query; keep the two in step (the same character map).
//
//   pinyin_plain  "zhǔn bèi"   -> "zhunbei"   (lowercase, no tones, no spaces)
//   pinyin_num    "zhun3 bei4" -> "zhun3bei4" (lowercase, no spaces)
//
// ü is written "v" in both (lǚ -> "lv", lü3 -> "lv3"), the usual way to
// type it, so "lvyou" and "lv3you2" find 旅游.

import { toPinyinPlain, untone } from "../../src/lib/pinyin";

export { toPinyinPlain };

export function toPinyinNum(numeric: string | null | undefined) {
  if (!numeric) return null;
  const s = untone(numeric.normalize("NFC").toLowerCase().replace(/u:/g, "v"));
  return s.replace(/[^a-z0-9]/g, "") || null;
}

// The dataset's spelling, made to match the rest of the table. Applied to
// every dataset reading (readings.ts), as storedToned / storedNumeric:
//
// - CC-CEDICT spells ü "u:" (lu:è, nu:3). Stored pinyin uses ü (lǚ |
//   lü3): toned pinyin gets ü, with a tone digit turned into a mark where
//   pinyin puts it (nu:3 -> nǚ, lu:e4 -> lüè: a and e take the mark before
//   ü), and numeric pinyin keeps its digit (lu:e4 -> lüe4).
// - A dot before a syllable marks the neutral tone (闺女 guī ˙nu:), a
//   zhuyin habit. Stored pinyin leaves neutral syllables bare (吗 ma), so
//   the dot is dropped.

const MARKS: Record<string, string> = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
};
// A mark on the u itself before the colon (lù:) belongs on the ü.
const MARKED_U: Record<string, string> = { ū: "ǖ", ú: "ǘ", ǔ: "ǚ", ù: "ǜ" };
const TONE_MARKED = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

/** Puts tone 1 to 4 on a syllable's vowel; 5 (neutral) leaves it bare. */
function markTone(syllable: string, tone: number) {
  if (tone < 1 || tone > 4) return syllable;
  const vowels = [...syllable].map((c, i) => ({ c, i })).filter(({ c }) => c in MARKS);
  const target =
    vowels.find(({ c }) => c === "a") ??
    vowels.find(({ c }) => c === "e") ??
    (syllable.includes("ou") ? vowels.find(({ c }) => c === "o") : undefined) ??
    vowels.at(-1);
  if (!target) return syllable;
  const chars = [...syllable];
  chars[target.i] = MARKS[target.c][tone - 1];
  return chars.join("");
}

const U_COLON = /[uūúǔù]:/i;

/** Toned pinyin with CC-CEDICT's "u:" written as ü: "lu:è" -> "lüè",
 *  "nu:3" -> "nǚ", "˙nu:" -> "˙nü". Anything else is returned as is. */
export function umlautToned(pinyin: string) {
  if (!U_COLON.test(pinyin)) return pinyin;
  return pinyin
    .normalize("NFC")
    .split(/(\s+)/)
    .map((token) => {
      if (!U_COLON.test(token)) return token;
      let s = token
        .replace(/[ūúǔù]:/g, (m) => MARKED_U[m[0]])
        .replace(/u:/g, "ü")
        .replace(/U:/g, "Ü");
      const digit = /^(.*?)([1-5])$/.exec(s);
      if (digit && !TONE_MARKED.test(digit[1])) s = markTone(digit[1], Number(digit[2]));
      return s;
    })
    .join("");
}

/** Numeric pinyin with "u:" written as ü, keeping the digit:
 *  "lu:e4" -> "lüe4". */
export function umlautNumeric(numeric: string | null) {
  return numeric && numeric.replace(/u:/g, "ü").replace(/U:/g, "Ü");
}

/** Drops the neutral-tone dot (˙, U+02D9): "guī ˙nü" -> "guī nü". */
export function dropNeutralDot(pinyin: string) {
  return pinyin.replace(/\u02D9\s*/g, "");
}

/** Toned pinyin as stored, from the dataset's spelling. */
export const storedToned = (pinyin: string) => umlautToned(dropNeutralDot(pinyin));

/** Numeric pinyin as stored, from the dataset's spelling. */
export const storedNumeric = (numeric: string | null) => umlautNumeric(numeric && dropNeutralDot(numeric));

/** The two search columns for a stored reading. */
export function searchFields(reading: { pinyin: string; pinyin_numeric: string | null }) {
  return {
    pinyin_plain: toPinyinPlain(reading.pinyin),
    pinyin_num: toPinyinNum(reading.pinyin_numeric),
  };
}
