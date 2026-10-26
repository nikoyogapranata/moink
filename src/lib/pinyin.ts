// The plain search form of pinyin, stored in words.pinyin_plain:
// "zhǔn bèi" -> "zhunbei" (lowercase, no tones, no spaces, ü as v).
// public.pinyin_plain() in
// supabase/migrations/20261101120000_dictionary_search.sql does the same to
// a search query; keep the two in step (the same character map).

// Tone-marked vowels (and ü) to their plain letter, lowercase only: input
// is lowercased first.
const TONED = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ";
const PLAIN = "aaaaeeeeiiiioooouuuuvvvvvnnnm";

export function untone(s: string) {
  let out = "";
  for (const c of s) {
    const i = TONED.indexOf(c);
    out += i === -1 ? c : PLAIN[i];
  }
  return out;
}

export function toPinyinPlain(pinyin: string | null | undefined) {
  if (!pinyin) return null;
  const s = untone(pinyin.normalize("NFC").toLowerCase().replace(/u:/g, "v"));
  return s.replace(/[^a-z]/g, "") || null;
}

/* Toned syllables, for telling sound-alikes apart (listening questions). */

const TONES: Record<string, number> = Object.fromEntries(
  ["āēīōūǖ", "áéíóúǘń", "ǎěǐǒǔǚň", "àèìòùǜǹ"].flatMap((marks, i) => [...marks].map((c) => [c, i + 1])),
);

export interface PinyinSyllable {
  /** Plain letters: "zhǔn" -> "zhun". */
  base: string;
  /** 1 to 4, or 5 for the neutral tone. */
  tone: number;
}

/** "zhǔn bèi" -> [{ base: "zhun", tone: 3 }, { base: "bei", tone: 4 }].
 *  Syllables are split on spaces and apostrophes ("xī'ān"). */
export function pinyinSyllables(pinyin: string): PinyinSyllable[] {
  return pinyin
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s']+/)
    .filter(Boolean)
    .map((syllable) => ({
      base: toPinyinPlain(syllable) ?? syllable,
      tone: [...syllable].map((c) => TONES[c]).find(Boolean) ?? 5,
    }))
    .filter((s) => s.base !== "");
}

/** The toned reading as one comparable string: "zhǔn bèi" -> "zhun3 bei4".
 *  Equal for true homophones (是 / 事 / 市 are all "shi4"). */
export function tonedPinyin(pinyin: string) {
  return pinyinSyllables(pinyin)
    .map((s) => `${s.base}${s.tone}`)
    .join(" ");
}

/** A plain syllable's initial: "zhun" -> "zh", "an" -> "". */
export function pinyinInitial(base: string) {
  return /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/.exec(base)?.[1] ?? "";
}
