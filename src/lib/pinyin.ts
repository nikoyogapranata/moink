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
