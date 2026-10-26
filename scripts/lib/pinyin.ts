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

/** The two search columns for a stored reading. */
export function searchFields(reading: { pinyin: string; pinyin_numeric: string | null }) {
  return {
    pinyin_plain: toPinyinPlain(reading.pinyin),
    pinyin_num: toPinyinNum(reading.pinyin_numeric),
  };
}
