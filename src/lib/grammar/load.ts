// Server loads for the Grammar pages. RLS lets any signed-in user read the
// grammar tables. Each load returns null when there's nothing to show and
// throws when a query fails (the page logs it and offers a retry).

import type { createClient } from "@/lib/supabase/server";
import type {
  GrammarPatternPart,
  GrammarSection,
  GrammarStatus,
  Tables,
} from "@/lib/supabase/database.types";

import { NAMES } from "./names";
import { segment, type Lexicon } from "./segment";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const STANDARD = "hsk3_2025";
const HAN_RUN = /\p{Script=Han}+/gu;

export interface ListWord {
  id: number;
  simplified: string;
  pinyin: string;
}

/** A point in a level's list. lesson is null until it's written. */
export interface ListPoint {
  id: number;
  sort_order: number;
  kind: "words" | "structure";
  category: string | null;
  subcategory: string | null;
  detail: string | null;
  name_zh: string;
  name_en: string | null;
  slug: string | null;
  pattern: string | null;
  lesson: { status: GrammarStatus } | null;
  /** 'words' points: the listed words, in syllabus order. */
  words: ListWord[];
}

type PointWordsEmbed = { sort_order: number; words: ListWord | null }[];

function listedWords(rows: PointWordsEmbed) {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((r) => (r.words ? [r.words] : []));
}

/** Every point of a level, in syllabus order. */
export async function loadLevel(supabase: Supabase, level: number): Promise<ListPoint[]> {
  const { data, error } = await supabase
    .from("grammar_points")
    .select(
      "id, sort_order, kind, category, subcategory, detail, name_zh, name_en, slug, pattern, grammar_lessons(status), grammar_point_words(sort_order, words(id, simplified, pinyin))",
    )
    .eq("standard", STANDARD)
    .eq("level", level)
    .order("sort_order");
  if (error) throw error;
  return data.map(({ grammar_lessons, grammar_point_words, ...p }) => ({
    ...p,
    lesson: grammar_lessons,
    words: listedWords(grammar_point_words as PointWordsEmbed),
  }));
}

/** A word a lesson sentence links to, for its popover. */
export interface PopoverWord {
  id: number;
  simplified: string;
  pinyin: string;
  gloss: string | null;
  /** HSK 3.0 level, from words or the grammar word lists; null if none. */
  level: number | null;
}

/** A sentence cut into words: wordId is set where the text is a word of
 *  the table (tappable), null for punctuation and anything else. */
export type SentencePart = { text: string; wordId: number | null };

export type LessonExample = Pick<
  Tables<"grammar_examples">,
  "id" | "sort_order" | "hanzi" | "pinyin" | "translation" | "highlight" | "difficulty"
> & { parts: SentencePart[] };

export interface PointLink {
  slug: string;
  name_en: string;
  name_zh: string;
}

export interface Lesson {
  id: number;
  level: number;
  category: string | null;
  name_zh: string;
  name_en: string;
  pattern: string | null;
  summary: string;
  pattern_parts: GrammarPatternPart[];
  sections: GrammarSection[];
  status: GrammarStatus;
  /** Easy ones first: by difficulty, then sort_order. */
  examples: LessonExample[];
  related: (PointLink | { slug: null; name_en: string; name_zh: string })[];
  words: ListWord[];
  previous: PointLink | null;
  next: PointLink | null;
  /** By id, for every tappable word in the examples. */
  popoverWords: Record<number, PopoverWord>;
}

const linkOf = (p: { slug: string | null; name_en: string | null; name_zh: string }) =>
  p.slug && p.name_en ? { slug: p.slug, name_en: p.name_en, name_zh: p.name_zh } : null;

/** One lesson by its point's slug, or null when there's no such point or
 *  it has no lesson yet. */
export async function loadLesson(supabase: Supabase, slug: string): Promise<Lesson | null> {
  const { data: point, error } = await supabase
    .from("grammar_points")
    .select(
      "id, level, sort_order, category, name_zh, name_en, pattern, grammar_lessons(summary, pattern_parts, sections, related_point_ids, status), grammar_examples(id, sort_order, hanzi, pinyin, translation, highlight, difficulty), grammar_point_words(sort_order, words(id, simplified, pinyin))",
    )
    .eq("standard", STANDARD)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  const lesson = point?.grammar_lessons;
  if (!point || !lesson || !point.name_en) return null;

  // The level's other lessons (previous and next) and the related points.
  const [siblings, related] = await Promise.all([
    supabase
      .from("grammar_points")
      .select("sort_order, slug, name_en, name_zh, grammar_lessons!inner(point_id)")
      .eq("standard", STANDARD)
      .eq("level", point.level)
      .order("sort_order"),
    lesson.related_point_ids.length
      ? supabase
          .from("grammar_points")
          .select("id, slug, name_en, name_zh, grammar_lessons(point_id)")
          .in("id", lesson.related_point_ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (siblings.error) throw siblings.error;
  if (related.error) throw related.error;

  const lessons = siblings.data.flatMap((p) => linkOf(p) ?? []);
  const at = lessons.findIndex((p) => p.slug === slug);
  const relatedById = new Map(related.data.map((p) => [p.id, p]));

  const examples = [...point.grammar_examples].sort((a, b) => a.difficulty - b.difficulty || a.sort_order - b.sort_order);
  const { lexicon, rows } = await loadLexicon(
    supabase,
    examples.map((e) => e.hanzi),
  );

  return {
    id: point.id,
    level: point.level,
    category: point.category,
    name_zh: point.name_zh,
    name_en: point.name_en,
    pattern: point.pattern,
    summary: lesson.summary,
    pattern_parts: lesson.pattern_parts,
    sections: lesson.sections,
    status: lesson.status,
    examples: examples.map((e) => ({ ...e, parts: sentenceParts(e.hanzi, lexicon, rows) })),
    related: lesson.related_point_ids.flatMap((id) => {
      const p = relatedById.get(id);
      if (!p) return [];
      // A related point without a lesson yet shows, but doesn't link.
      return [(p.grammar_lessons && linkOf(p)) || { slug: null, name_en: p.name_en ?? p.name_zh, name_zh: p.name_zh }];
    }),
    words: listedWords(point.grammar_point_words as PointWordsEmbed),
    previous: at > 0 ? lessons[at - 1] : null,
    next: at !== -1 && at < lessons.length - 1 ? lessons[at + 1] : null,
    popoverWords: Object.fromEntries([...rows.values()].map((w) => [w.id, w])),
  };
}

/** Longest substring looked up, in characters: longer words exist (4
 *  character idioms and more) but don't turn up in lesson sentences. */
const MAX_WORD = 6;
/** Strings per words query, to keep the request URL short. */
const CHUNK = 150;

/** The words that could appear in `sentences`: every substring of their
 *  Han runs up to MAX_WORD characters, looked up in words. Levels are HSK
 *  3.0's, lowered to the level of a grammar word list a word is in (杯,
 *  没), as the checker does. `rows` is the popover word for each
 *  simplified form (the lowest level row when there are several). */
async function loadLexicon(supabase: Supabase, sentences: string[]) {
  const candidates = new Set<string>();
  for (const sentence of sentences) {
    for (const run of sentence.match(HAN_RUN) ?? []) {
      const chars = [...run];
      for (let i = 0; i < chars.length; i++) {
        for (let n = 1; n <= MAX_WORD && i + n <= chars.length; n++) candidates.add(chars.slice(i, i + n).join(""));
      }
    }
  }
  const strings = [...candidates];
  const chunks = Array.from({ length: Math.ceil(strings.length / CHUNK) }, (_, i) => strings.slice(i * CHUNK, (i + 1) * CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase.from("words").select("id, simplified, pinyin, gloss, hsk3_2025_level").in("simplified", chunk),
    ),
  );
  const words = results.flatMap((r) => {
    if (r.error) throw r.error;
    return r.data;
  });

  const listLevel = new Map<number, number>();
  if (words.length) {
    const { data, error } = await supabase
      .from("grammar_point_words")
      .select("word_id, grammar_points!inner(level)")
      .in(
        "word_id",
        words.map((w) => w.id),
      );
    if (error) throw error;
    for (const r of data) {
      const level = r.grammar_points.level;
      listLevel.set(r.word_id, Math.min(listLevel.get(r.word_id) ?? level, level));
    }
  }

  const rows = new Map<string, PopoverWord>();
  const lexicon: Lexicon = { level: new Map(), maxLength: 1, names: [...NAMES] };
  for (const w of words) {
    const levels = [w.hsk3_2025_level, listLevel.get(w.id)].filter((l): l is number => l != null);
    const level = levels.length ? Math.min(...levels) : null;
    const had = rows.get(w.simplified);
    if (!had || (level !== null && (had.level === null || level < had.level))) {
      rows.set(w.simplified, { id: w.id, simplified: w.simplified, pinyin: w.pinyin, gloss: w.gloss, level });
    }
    const known = lexicon.level.get(w.simplified);
    lexicon.level.set(w.simplified, known == null ? level : level == null ? known : Math.min(known, level));
    lexicon.maxLength = Math.max(lexicon.maxLength, [...w.simplified].length);
  }
  return { lexicon, rows };
}

/** The whole sentence in order: segment()'s words, with the text between
 *  them (punctuation, digits) and names (小王) as plain parts. */
function sentenceParts(hanzi: string, lexicon: Lexicon, rows: Map<string, PopoverWord>): SentencePart[] {
  const parts: SentencePart[] = [];
  let at = 0;
  for (const token of segment(hanzi, lexicon)) {
    const start = hanzi.indexOf(token.text, at);
    if (start === -1) continue;
    if (start > at) parts.push({ text: hanzi.slice(at, start), wordId: null });
    if (token.kind === "name") {
      parts.push({ text: token.text, wordId: null });
      at = start + token.text.length;
      continue;
    }
    // Erhua (玩儿) links to the word without its 儿 when that's the entry.
    const word = rows.get(token.text) ?? (token.text.endsWith("儿") ? rows.get(token.text.slice(0, -1)) : undefined);
    parts.push({ text: token.text, wordId: word?.id ?? null });
    at = start + token.text.length;
  }
  if (at < hanzi.length) parts.push({ text: hanzi.slice(at), wordId: null });
  return parts;
}
