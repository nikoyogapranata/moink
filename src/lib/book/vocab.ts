// The HSK Book's vocabulary for Training: every lesson's 生词 (proper nouns
// left out), each word matched to the words table by hanzi. Reads through
// the user's session, so RLS returns nothing without book_access.

import type { createClient } from "@/lib/supabase/server";
import { bookKey, wordKey, type DeckKey } from "@/lib/training/flashDeck";

import type { BlockData } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface BookVocabWord {
  /** "w:<id>" when the hanzi is in the words table, else "b:<hanzi>". */
  key: DeckKey;
  /** The book's number for it in the lesson's word list ("1", "2" ...). */
  num: string;
  hanzi: string;
  pinyin: string;
  pos: string;
  en: string;
  /** The matched words row; null for a book-only word. */
  wordId: number | null;
  hsk_level: number | null;
  hsk3_2025_level: number | null;
}

export interface BookVocabLesson {
  number: number;
  title_en: string;
  words: BookVocabWord[];
}

export interface BookVocabBook {
  slug: string;
  title_zh: string;
  /** "4上", the end of the title: what tags and rows show. */
  short: string;
  lessons: BookVocabLesson[];
}

const toneless = (pinyin: string) => pinyin.replace(/\s+/g, "").toLowerCase();

const shortTitle = (title: string) => title.trim().split(/\s+/).pop() ?? title;

/** Every book with its numbered lessons' vocab, in shelf and lesson order;
 *  a lesson without vocab is left out. Throws when a query fails. */
export async function loadBookVocab(supabase: Supabase): Promise<BookVocabBook[]> {
  const [books, lessons, blocks] = await Promise.all([
    supabase.from("books").select("id, slug, title_zh").order("sort").order("slug"),
    supabase.from("book_lessons").select("id, book_id, number, title_en").not("number", "is", null).order("number"),
    supabase.from("book_blocks").select("lesson_id, data").eq("type", "vocab").order("sort"),
  ]);
  if (books.error) throw books.error;
  if (lessons.error) throw lessons.error;
  if (blocks.error) throw blocks.error;

  const items = new Map<string, BlockData["vocab"]["items"]>();
  for (const block of blocks.data) {
    const data = block.data as unknown as BlockData["vocab"];
    if (data.proper) continue;
    items.set(block.lesson_id, [...(items.get(block.lesson_id) ?? []), ...data.items]);
  }

  // A hanzi can be several words (different readings): the one whose
  // pinyin matches the book's, else the first (as the reader does).
  const hanzi = [...new Set([...items.values()].flat().map((i) => i.hanzi))];
  const rows: { id: number; simplified: string; pinyin: string; hsk_level: number | null; hsk3_2025_level: number | null }[] = [];
  for (let i = 0; i < hanzi.length; i += 200) {
    const { data, error } = await supabase
      .from("words")
      .select("id, simplified, pinyin, hsk_level, hsk3_2025_level")
      .in("simplified", hanzi.slice(i, i + 200))
      .order("id");
    if (error) throw error;
    rows.push(...data);
  }

  return books.data.map((book) => {
    const short = shortTitle(book.title_zh);
    return {
      slug: book.slug,
      title_zh: book.title_zh,
      short,
      lessons: lessons.data
        .filter((l) => l.book_id === book.id && items.has(l.id))
        .map((l) => {
          const seen = new Set<string>();
          const words = items.get(l.id)!.flatMap((item): BookVocabWord[] => {
            if (seen.has(item.hanzi)) return [];
            seen.add(item.hanzi);
            const matches = rows.filter((w) => w.simplified === item.hanzi);
            const match = matches.find((w) => toneless(w.pinyin) === toneless(item.pinyin)) ?? matches[0];
            return [
              {
                key: match ? wordKey(match.id) : bookKey(item.hanzi),
                num: item.num,
                hanzi: item.hanzi,
                pinyin: item.pinyin,
                pos: item.pos,
                en: item.en,
                wordId: match?.id ?? null,
                hsk_level: match?.hsk_level ?? null,
                hsk3_2025_level: match?.hsk3_2025_level ?? null,
              },
            ];
          });
          return { number: l.number!, title_en: l.title_en, words };
        }),
    };
  });
}
