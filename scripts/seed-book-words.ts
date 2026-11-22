// Adds the HSK Book's vocabulary words that aren't in words yet (matched
// by hanzi), so the dictionary, the reader's + Training and flashcard
// decks treat them like any other word.
//
//   pnpm exec tsx scripts/seed-book-words.ts           dry run: lists them
//   pnpm exec tsx scripts/seed-book-words.ts --write   insert them
//
// Every lesson's 生词 is read from book_blocks (proper-noun tables left
// out). A hanzi with no words row is inserted with the book's pinyin, part
// of speech and English:
//   - pinyin is split into syllables the way words stores it ("dòngchē" ->
//     "dòng chē", "dong4 che1"), using the syllables already in words;
//     non-pinyin tokens (AI, 3D) are kept as they are, but left out of
//     the search forms (pinyin_plain, pinyin_num), so "dayinji" finds
//     3D打印机 as the pinyin of the rest
//   - 一 and 不 get their citation tones back where the book writes the
//     tone change (一下 yíxià -> yī xià, 不对 búduì -> bù duì), as the
//     rest of words stores them
//   - pos maps the book's abbreviations to the table's codes (n. -> n,
//     adv. -> d, m. -> q ...); the English becomes meanings (split on ";")
//     and gloss, gloss_status 'reviewed' so the gloss scripts leave it
//   - hsk3_2025_level 4 (the book is HSK 3.0 level 4), or null when the
//     book marks the word beyond the syllabus (beyond: true) in every
//     lesson it's in; no old HSK level, no 2021 level. Then
//     rank_words_2025() gives level-4 words their sort_order_2025.
// words has no column for where a row came from, so the source isn't
// stored; the rows are the ones with gloss_status 'reviewed', no
// hsk_level and no hsk3_level.
//
// Running it again inserts nothing: every hanzi then has a row.
import type { Database } from "../src/lib/supabase/database.types";
import { untone } from "../src/lib/pinyin";
import { createAdminClient, hasFlag } from "./lib/admin";
import { searchFields } from "./lib/pinyin";

const WRITE = hasFlag("--write");
const BOOK_LEVEL = 4;

type Admin = ReturnType<typeof createAdminClient>;
type WordInsert = Database["public"]["Tables"]["words"]["Insert"];

interface BookItem {
  hanzi: string;
  pinyin: string;
  pos: string;
  en: string;
  beyond?: boolean;
}

/** The book's part-of-speech abbreviations, as words.pos codes. */
const POS: Record<string, string> = {
  "n.": "n",
  "v.": "v",
  "adj.": "a",
  "adv.": "d",
  "m.": "q",
  "num.": "m",
  "pron.": "r",
  "prep.": "p",
  "conj.": "c",
  "part.": "u",
  "int.": "e",
  "onom.": "o",
};

function mapPos(pos: string, hanzi: string): string[] {
  const parts = pos.split("/").map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    const code = POS[p];
    if (!code) throw new Error(`${hanzi}: unknown part of speech "${p}"`);
    return code;
  });
}

const TONES: Record<string, number> = Object.fromEntries(
  ["āēīōūǖ", "áéíóúǘ", "ǎěǐǒǔǚ", "àèìòùǜ"].flatMap((marks, i) => [...marks].map((c) => [c, i + 1])),
);
/** A toned syllable's letters without the mark, ü kept: "nǚ" -> "nü". */
const bare = (syllable: string) =>
  [...syllable].map((c) => (/[ǖǘǚǜ]/.test(c) ? "ü" : untone(c))).join("");
const toneOf = (syllable: string) => [...syllable].map((c) => TONES[c]).find(Boolean) ?? 5;
/** Matching form: lowercase, no tones, ü as v. */
const key = (s: string) => untone(s.toLowerCase());

/** Every syllable words.pinyin uses, in matching form. */
async function syllableInventory(admin: Admin) {
  const set = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("words").select("pinyin").order("id").range(from, from + 999);
    if (error) throw error;
    for (const w of data) for (const s of w.pinyin.split(/[\s']+/)) if (/^[a-zü]+$/.test(key(s))) set.add(key(s));
    if (data.length < 1000) break;
  }
  return set;
}

/** "dòngchē" -> ["dòng", "chē"]: the fewest syllables from `inventory`,
 *  or null when the token can't be split. */
function splitToken(token: string, inventory: Set<string>): string[] | null {
  const chars = [...token];
  const plain = chars.map((c) => key(c)).join("");
  if (plain.length !== chars.length) return null;
  const best: (number[] | null)[] = [[]];
  for (let end = 1; end <= chars.length; end++) {
    best[end] = null;
    for (let start = Math.max(0, end - 6); start < end; start++) {
      const prev = best[start];
      if (prev && inventory.has(plain.slice(start, end)) && (!best[end] || prev.length + 1 < best[end]!.length)) {
        best[end] = [...prev, end];
      }
    }
  }
  const cuts = best[chars.length];
  if (!cuts) return null;
  return cuts.map((end, i) => chars.slice(i ? cuts[i - 1] : 0, end).join(""));
}

/** 一 and 不 in their citation tones, where the book writes the tone
 *  change: 一 yí / yì -> yī, 不 bú -> bù. */
const CITATION: Record<string, { base: string; changed: number[]; toned: string; tone: number }> = {
  一: { base: "yi", changed: [2, 4], toned: "yī", tone: 1 },
  不: { base: "bu", changed: [2], toned: "bù", tone: 4 },
};

/** The book's pinyin as words stores it: spaced syllables, and the
 *  tone-number form. Tokens that aren't pinyin (AI, 3D) stay as they are
 *  in pinyin, but the search forms are the pinyin syllables only. */
function reading(pinyin: string, inventory: Set<string>, hanzi: string) {
  const syllables: { toned: string; numeric: string; latin: boolean }[] = [];
  for (const token of pinyin.normalize("NFC").trim().split(/[\s']+/)) {
    if (/[A-Z0-9]/.test(token)) {
      syllables.push({ toned: token, numeric: token, latin: true });
      continue;
    }
    const split = splitToken(token, inventory);
    if (!split) throw new Error(`${hanzi}: can't split the pinyin "${token}" into syllables`);
    for (const s of split) syllables.push({ toned: s, numeric: `${bare(s)}${toneOf(s)}`, latin: false });
  }

  // One pinyin syllable per Han character: undo 一 / 不 tone changes.
  const han = [...hanzi].filter((c) => /\p{Script=Han}/u.test(c));
  const pinyinSyllables = syllables.filter((s) => !s.latin);
  if (han.length === pinyinSyllables.length) {
    han.forEach((c, i) => {
      const citation = CITATION[c];
      const s = pinyinSyllables[i];
      if (citation && key(s.toned) === citation.base && citation.changed.includes(toneOf(s.toned))) {
        s.toned = citation.toned;
        s.numeric = `${citation.base}${citation.tone}`;
      }
    });
  }

  const row = {
    pinyin: syllables.map((s) => s.toned).join(" "),
    pinyin_numeric: syllables.map((s) => s.numeric).join(" "),
  };
  const search = pinyinSyllables.length ? pinyinSyllables : syllables;
  return {
    ...row,
    ...searchFields({
      pinyin: search.map((s) => s.toned).join(" "),
      pinyin_numeric: search.map((s) => s.numeric).join(" "),
    }),
  };
}

async function main() {
  const admin = createAdminClient();

  const { data: blocks, error } = await admin
    .from("book_blocks")
    .select("data, book_lessons!inner(number, books!inner(slug))")
    .eq("type", "vocab");
  if (error) throw error;

  // Each hanzi once (its first lesson's entry); beyond only when every
  // entry says so.
  const items = new Map<string, { item: BookItem; beyond: boolean; where: string }>();
  for (const block of blocks) {
    const data = block.data as unknown as { proper?: boolean; items: BookItem[] };
    if (data.proper) continue;
    const lesson = block.book_lessons as unknown as { number: number | null; books: { slug: string } };
    const where = `${lesson.books.slug} L${lesson.number ?? "?"}`;
    for (const item of data.items) {
      const seen = items.get(item.hanzi);
      if (seen) seen.beyond &&= item.beyond === true;
      else items.set(item.hanzi, { item, beyond: item.beyond === true, where });
    }
  }

  const hanzi = [...items.keys()];
  const existing = new Set<string>();
  for (let i = 0; i < hanzi.length; i += 200) {
    const { data, error: wordsError } = await admin.from("words").select("simplified").in("simplified", hanzi.slice(i, i + 200));
    if (wordsError) throw wordsError;
    for (const w of data) existing.add(w.simplified);
  }

  const missing = [...items.values()].filter(({ item }) => !existing.has(item.hanzi));
  console.log(`Book vocab: ${items.size} distinct hanzi (proper nouns left out), ${missing.length} with no words row.`);
  if (!missing.length) return;

  const inventory = await syllableInventory(admin);
  const rows: WordInsert[] = missing.map(({ item, beyond }) => ({
    simplified: item.hanzi,
    ...reading(item.pinyin, inventory, item.hanzi),
    hsk_level: null,
    hsk3_level: null,
    hsk3_2025_level: beyond ? null : BOOK_LEVEL,
    pos: mapPos(item.pos, item.hanzi),
    meanings: item.en.split(";").map((m) => m.trim()).filter(Boolean),
    classifiers: [],
    gloss: item.en.trim(),
    gloss_status: "reviewed",
  }));

  for (const [i, row] of rows.entries()) {
    const level = row.hsk3_2025_level ? `HSK 3.0 L${row.hsk3_2025_level}` : "no level (beyond)";
    console.log(
      `  ${row.simplified}\t${row.pinyin}\t${row.pinyin_numeric}\t${row.pinyin_plain}\t[${row.pos!.join(",")}]\t${level}\t${row.gloss}\t(${missing[i].where})`,
    );
  }

  if (!WRITE) {
    console.log("\nDry run: nothing written. Run with --write to insert.");
    return;
  }
  const { data: inserted, error: insertError } = await admin.from("words").insert(rows).select("id, simplified");
  if (insertError) throw insertError;
  console.log(`\nInserted ${inserted.length}: ${inserted.map((w) => `${w.simplified} #${w.id}`).join(", ")}`);
  const { data: ranked, error: rankError } = await admin.rpc("rank_words_2025");
  if (rankError) throw rankError;
  console.log(`rank_words_2025: ${ranked} sort_order_2025 values changed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
