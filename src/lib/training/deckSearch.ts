// The deck builder's search over HSK Book words, ranked like search_words
// (supabase/migrations/20261101120000_dictionary_search.sql) so the two
// lists merge sensibly. Safe on server and client.

import { toPinyinPlain } from "@/lib/pinyin";

const HANZI = /[㐀-䶿一-鿿豈-﫿]/;

const TONE_MARKS: Record<string, number> = Object.fromEntries(
  ["āēīōūǖ", "áéíóúǘń", "ǎěǐǒǔǚň", "àèìòùǜǹ"].flatMap((marks, i) => [...marks].map((c) => [c, i + 1])),
);

/** The tone marks of `pinyin` in order: "qiǎokèlì" -> [3, 4, 4]. Neutral
 *  syllables have none, so they're skipped. */
function toneMarks(pinyin: string) {
  return [...pinyin.normalize("NFC").toLowerCase()].flatMap((c) => (TONE_MARKS[c] ? [TONE_MARKS[c]] : []));
}

/**
 * How well a book word matches `query` (lower is better), or null when it
 * doesn't: 1 exact hanzi, 2 hanzi prefix, 3 hanzi contains, 4 exact
 * pinyin, 5 pinyin prefix, 7 English whole word, 8 English contains.
 * Pinyin matches with or without tones: "che", "chē" and "che1" all find
 * 车. With tone numbers, the query's tones (1 to 4) must start the word's
 * tones in order.
 */
export function bookMatchRank(word: { hanzi: string; pinyin: string; en: string }, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (HANZI.test(q)) {
    if (word.hanzi === q) return 1;
    if (word.hanzi.startsWith(q)) return 2;
    if (word.hanzi.includes(q)) return 3;
    return null;
  }
  if (!/[a-z0-9]/.test(q)) return null;

  const plain = toPinyinPlain(q.replace(/[0-9]/g, ""));
  const wordPlain = toPinyinPlain(word.pinyin);
  if (plain && wordPlain?.startsWith(plain)) {
    // Tone numbers ("che1") or marks ("chē"); 5 and 0 (neutral) are skipped.
    const queryTones = [...[...q.matchAll(/[1-4]/g)].map((m) => Number(m[0])), ...toneMarks(q)];
    const wordTones = toneMarks(word.pinyin);
    if (queryTones.every((t, i) => wordTones[i] === t)) return wordPlain === plain ? 4 : 5;
  }

  const en = word.en.toLowerCase();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escaped}\\b`).test(en)) return 7;
  if (en.includes(q)) return 8;
  return null;
}
