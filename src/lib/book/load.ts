// Server loads for the HSK Book pages. Every read goes through the user's
// own session: RLS hides the book tables (and the book-assets bucket) from
// anyone without a book_access row. Each load throws when a query fails
// (the page logs it and offers a retry).

import type { createClient } from "@/lib/supabase/server";

import type { Json } from "@/lib/supabase/database.types";

import { answerKeys, autoItems, type AutoItem } from "./answers";
import type { Block, BookPrefs, BookText, Section } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How long image links stay valid. */
const SIGNED_URL_SECONDS = 60 * 60;

export interface ShelfLesson {
  id: string;
  number: number;
  title: BookText;
  title_en: string;
  page_start: number;
  page_end: number;
  done: boolean;
}

export interface ShelfBook {
  id: string;
  slug: string;
  title_zh: string;
  title_en: string;
  level: number;
  lessons: ShelfLesson[];
}

/** Every book, in shelf order, with its lessons and which are done. */
export async function loadShelf(supabase: Supabase, userId: string): Promise<ShelfBook[]> {
  const [books, lessons, progress] = await Promise.all([
    supabase.from("books").select("id, slug, title_zh, title_en, level").order("sort").order("slug"),
    supabase
      .from("book_lessons")
      .select("id, book_id, number, title, title_en, page_start, page_end")
      .order("number"),
    supabase.from("user_book_progress").select("lesson_id, completed_at").eq("user_id", userId),
  ]);
  if (books.error) throw books.error;
  if (lessons.error) throw lessons.error;
  if (progress.error) throw progress.error;

  const done = new Set(progress.data.filter((p) => p.completed_at).map((p) => p.lesson_id));
  return books.data.map((book) => ({
    ...book,
    lessons: lessons.data
      .filter((l) => l.book_id === book.id)
      .map((l) => ({
        id: l.id,
        number: l.number,
        title: l.title,
        title_en: l.title_en,
        page_start: l.page_start,
        page_end: l.page_end,
        done: done.has(l.id),
      })),
  }));
}

/** A vocab word's match in our word table, for "Add to Training". */
export interface VocabWord {
  id: number;
  inTraining: boolean;
}

export interface GrammarLink {
  slug: string;
  name_en: string;
}

/** A saved answer, by key. */
export interface SavedAnswer {
  answer: Json;
  is_correct: boolean | null;
}

/** A note: for one block, or for the whole lesson (blockKey null). */
export interface BookNote {
  id: string;
  blockKey: string | null;
  body: string;
}

export interface ReaderLesson {
  id: string;
  book: { slug: string; title_zh: string; title_en: string };
  number: number;
  title: BookText;
  title_en: string;
  page_start: number;
  page_end: number;
  sections: Section[];
  /** Signed book-assets URL by src. */
  images: Record<string, string>;
  /** By vocab hanzi; missing when the word isn't in our table. */
  vocabWords: Record<string, VocabWord>;
  /** Related grammar points with a written lesson, by slug. */
  grammarLinks: Record<string, GrammarLink>;
  prefs: BookPrefs;
  answers: Record<string, SavedAnswer>;
  /** The lesson's auto-checked items, for the score. */
  autoItems: AutoItem[];
  notes: BookNote[];
  done: boolean;
  lastBlockKey: string | null;
  previous: number | null;
  next: number | null;
}

const toneless = (pinyin: string) => pinyin.replace(/\s+/g, "").toLowerCase();

/** One lesson of a book for the reader; null when there's no such lesson. */
export async function loadReaderLesson(
  supabase: Supabase,
  userId: string,
  bookSlug: string,
  number: number,
): Promise<ReaderLesson | null> {
  const book = await supabase
    .from("books")
    .select("id, slug, title_zh, title_en")
    .eq("slug", bookSlug)
    .maybeSingle();
  if (book.error) throw book.error;
  if (!book.data) return null;

  const [lessons, profile] = await Promise.all([
    supabase
      .from("book_lessons")
      .select("id, number, title, title_en, page_start, page_end")
      .eq("book_id", book.data.id)
      .order("number"),
    supabase.from("profiles").select("show_pinyin, show_english, show_extras").eq("id", userId).maybeSingle(),
  ]);
  if (lessons.error) throw lessons.error;
  if (profile.error) throw profile.error;
  const index = lessons.data.findIndex((l) => l.number === number);
  if (index === -1) return null;
  const lesson = lessons.data[index];

  const [sections, blocks, progress] = await Promise.all([
    supabase
      .from("book_sections")
      .select("id, key, kind, label_zh, label_en, page")
      .eq("lesson_id", lesson.id)
      .order("sort"),
    supabase
      .from("book_blocks")
      .select("section_id, key, type, page, source, data")
      .eq("lesson_id", lesson.id)
      .order("sort"),
    supabase
      .from("user_book_progress")
      .select("last_block_key, completed_at")
      .eq("user_id", userId)
      .eq("lesson_id", lesson.id)
      .maybeSingle(),
  ]);
  if (sections.error) throw sections.error;
  if (blocks.error) throw blocks.error;
  if (progress.error) throw progress.error;

  // Array order is the book's order: sections by sort, blocks by their
  // lesson-wide sort, grouped under their section without re-sorting.
  const bySection = new Map<string, Block[]>();
  for (const { section_id, ...b } of blocks.data) {
    const list = bySection.get(section_id) ?? [];
    list.push(b as unknown as Block);
    bySection.set(section_id, list);
  }
  const lessonSections: Section[] = sections.data.map(({ id, ...s }) => ({ ...s, blocks: bySection.get(id) ?? [] }));
  const all = lessonSections.flatMap((s) => s.blocks);

  // Image srcs, anywhere in the blocks' data.
  const srcs = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.src === "string") srcs.add(o.src);
    Object.values(o).forEach(walk);
  };
  all.forEach((b) => walk(b.data));

  const vocab = all.flatMap((b) => (b.type === "vocab" ? b.data.items : []));
  const hanzi = [...new Set(vocab.map((v) => v.hanzi))];
  const related = [
    ...new Set(all.flatMap((b) => (b.type === "grammar" ? (b.data.extra?.related ?? []) : []))),
  ];

  const keys = [...new Set(all.flatMap(answerKeys))];

  const [signed, words, points, answerRows, noteRows] = await Promise.all([
    srcs.size
      ? supabase.storage.from("book-assets").createSignedUrls([...srcs], SIGNED_URL_SECONDS)
      : Promise.resolve({ data: [], error: null }),
    hanzi.length
      ? supabase.from("words").select("id, simplified, pinyin").in("simplified", hanzi)
      : Promise.resolve({ data: [], error: null }),
    related.length
      ? supabase.from("grammar_points").select("slug, name_en, grammar_lessons(point_id)").in("slug", related)
      : Promise.resolve({ data: [], error: null }),
    keys.length
      ? supabase.from("user_book_answers").select("item_key, answer, is_correct").eq("user_id", userId).in("item_key", keys)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("user_book_notes")
      .select("id, block_key, body, updated_at")
      .eq("user_id", userId)
      .eq("lesson_id", lesson.id)
      .order("updated_at", { ascending: false }),
  ]);
  if (answerRows.error) throw answerRows.error;
  if (noteRows.error) throw noteRows.error;
  if (signed.error) throw signed.error;
  if (words.error) throw words.error;
  if (points.error) throw points.error;

  const images: Record<string, string> = {};
  for (const s of signed.data ?? []) if (s.path && s.signedUrl) images[s.path] = s.signedUrl;

  // A hanzi can be several words (different readings): take the one whose
  // pinyin matches the book's, else the first.
  const vocabIds: Record<string, number> = {};
  for (const item of vocab) {
    const matches = (words.data ?? []).filter((w) => w.simplified === item.hanzi);
    const best = matches.find((w) => toneless(w.pinyin) === toneless(item.pinyin)) ?? matches[0];
    if (best) vocabIds[item.hanzi] = best.id;
  }
  const ids = [...new Set(Object.values(vocabIds))];
  const training = ids.length
    ? await supabase
        .from("user_words")
        .select("word_id")
        .eq("user_id", userId)
        .eq("skill", "recognition")
        .in("word_id", ids)
    : { data: [], error: null };
  if (training.error) throw training.error;
  const inTraining = new Set((training.data ?? []).map((r) => r.word_id));
  const vocabWords: Record<string, VocabWord> = {};
  for (const [h, id] of Object.entries(vocabIds)) vocabWords[h] = { id, inTraining: inTraining.has(id) };

  const grammarLinks: Record<string, GrammarLink> = {};
  for (const p of points.data ?? []) {
    if (p.slug && p.name_en && p.grammar_lessons) grammarLinks[p.slug] = { slug: p.slug, name_en: p.name_en };
  }

  return {
    id: lesson.id,
    book: { slug: book.data.slug, title_zh: book.data.title_zh, title_en: book.data.title_en },
    number: lesson.number,
    title: lesson.title,
    title_en: lesson.title_en,
    page_start: lesson.page_start,
    page_end: lesson.page_end,
    sections: lessonSections,
    images,
    vocabWords,
    grammarLinks,
    answers: Object.fromEntries(
      (answerRows.data ?? []).map((r) => [r.item_key, { answer: r.answer, is_correct: r.is_correct }]),
    ),
    autoItems: autoItems(all),
    // One note per block (the newest, should there ever be two).
    notes: [...new Map((noteRows.data ?? []).toReversed().map((n) => [n.block_key, n])).values()].map((n) => ({
      id: n.id,
      blockKey: n.block_key,
      body: n.body,
    })),
    prefs: {
      pinyin: profile.data?.show_pinyin ?? true,
      english: profile.data?.show_english ?? false,
      extras: profile.data?.show_extras ?? true,
    },
    done: Boolean(progress.data?.completed_at),
    lastBlockKey: progress.data?.last_block_key ?? null,
    previous: lessons.data[index - 1]?.number ?? null,
    next: lessons.data[index + 1]?.number ?? null,
  };
}
