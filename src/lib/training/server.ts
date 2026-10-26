import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { dayStarts, FALLBACK_TIME_ZONE } from "@/lib/time";

import { DUE_SOON_MS, type DeckSet } from "./deck";
import { toQueueItems, type QueueItem, type QueueWord } from "./queue";
import {
  buildWordQuestions,
  levelPool,
  QUIZ_FORMATS,
  reviewShowing,
  type QuizBank,
  type QuizFormat,
  type QuizWord,
} from "./quiz";

type Client = SupabaseClient<Database>;

/** The user's daily new-word limit, target HSK level and day boundaries
 *  in their zone. */
export async function loadTrainingProfile(supabase: Client, userId: string, now = new Date()) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("daily_new_words, hsk_level_target, timezone")
    .eq("id", userId)
    .maybeSingle();
  return {
    dailyNewWords: profile?.daily_new_words ?? 0,
    hskLevel: profile?.hsk_level_target ?? null,
    days: dayStarts(profile?.timezone || FALLBACK_TIME_ZONE, now),
  };
}

/** The session queue from get_review_queue, as of `now`. */
export async function loadQueue(supabase: Client, todayStart: Date, now: Date): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc("get_review_queue", {
    p_now: now.toISOString(),
    p_today_start: todayStart.toISOString(),
  });
  if (error) throw error;
  return toQueueItems(data ?? []);
}

const WORD_FIELDS = "id, simplified, pinyin, gloss, hsk_level, classifiers";
const PAGE_SIZE = 1000;

/** Every row of a query, a page at a time (PostgREST caps a response at
 *  1,000 rows and HSK 6 alone has about 2,500 words). */
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Every word with a recognition card for the user, any state. */
export async function loadTrainingWordIds(supabase: Client, userId: string): Promise<number[]> {
  const rows = await allRows((from, to) =>
    supabase
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId)
      .eq("skill", "recognition")
      .order("word_id")
      .range(from, to),
  );
  return rows.map((row) => row.word_id);
}

const IDS_PER_REQUEST = 200;

/** Words by id, in no particular order; unknown ids are skipped. Batched
 *  so the id list never makes a URL too long. */
export async function loadWordsByIds(supabase: Client, ids: number[]): Promise<QueueWord[]> {
  const words: QueueWord[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from("words")
      .select(WORD_FIELDS)
      .in("id", ids.slice(i, i + IDS_PER_REQUEST));
    if (error) throw error;
    words.push(...(data ?? []));
  }
  return words;
}

/** The words in a deck builder set, unsorted. "mine" is every
 *  recognition card past New, "due" those (not suspended) due within
 *  DUE_SOON_MS, and "hskN" every word at that old-HSK level. */
export async function loadDeck(supabase: Client, userId: string, set: DeckSet, now: Date): Promise<QueueWord[]> {
  if (set === "mine" || set === "due") {
    const rows = await allRows((from, to) => {
      let query = supabase
        .from("user_words")
        .select(`word_id, words(${WORD_FIELDS})`)
        .eq("user_id", userId)
        .eq("skill", "recognition")
        .neq("state", 0);
      if (set === "due") {
        query = query.eq("suspended", false).lte("due", new Date(now.getTime() + DUE_SOON_MS).toISOString());
      }
      return query.order("word_id").range(from, to);
    });
    return rows.flatMap((row) => (row.words ? [row.words] : []));
  }

  const level = Number(set.slice(3));
  return allRows((from, to) =>
    supabase.from("words").select(WORD_FIELDS).eq("hsk_level", level).order("id").range(from, to),
  );
}

/** Ids of the user's recognition cards (past New, not suspended) due
 *  before `before`. */
export async function loadDueIds(supabase: Client, userId: string, before: Date): Promise<number[]> {
  const rows = await allRows((from, to) =>
    supabase
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId)
      .eq("skill", "recognition")
      .eq("suspended", false)
      .neq("state", 0)
      .lt("due", before.toISOString())
      .order("word_id")
      .range(from, to),
  );
  return rows.map((row) => row.word_id);
}

/* Quiz questions */

const QUIZ_FIELDS = "id, simplified, pinyin, pinyin_plain, gloss, hsk_level";
/** The words table only changes when it's reseeded, so each level's pool
 *  is kept in memory for a while, shared by every request. */
const POOL_TTL_MS = 60 * 60_000;
const pools = new Map<number, { words: QuizWord[]; at: number }>();

async function levelWords(supabase: Client, level: number): Promise<QuizWord[]> {
  const cached = pools.get(level);
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.words;
  const words = await allRows((from, to) =>
    supabase.from("words").select(QUIZ_FIELDS).eq("hsk_level", level).order("id").range(from, to),
  );
  pools.set(level, { words, at: Date.now() });
  return words;
}

/**
 * buildQuestions: each word's options in each of `formats` (see
 * buildWordQuestions), distractors from the word's own old-HSK level, or
 * its neighbors too when the level is small. Unknown ids are skipped.
 */
export async function buildQuestions(
  supabase: Client,
  wordIds: number[],
  formats: readonly QuizFormat[],
): Promise<QuizBank> {
  const ids = new Set(wordIds);
  // Targets are in their level's pool, so every level is loaded (cached
  // after the first request) and they're found there.
  const levels = [1, 2, 3, 4, 5, 6];
  const byLevel = new Map(
    await Promise.all(levels.map(async (level) => [level, await levelWords(supabase, level)] as const)),
  );
  const bank: QuizBank = {};
  for (const level of levels) {
    const targets = byLevel.get(level)!.filter((w) => ids.has(w.id));
    if (targets.length === 0) continue;
    const pool = levelPool(byLevel, level);
    for (const target of targets) bank[target.id] = buildWordQuestions(target, pool, formats);
  }
  return bank;
}

/** A review queue with its quiz questions. */
export interface ReviewBatch {
  items: QueueItem[];
  bank: QuizBank;
}

/** The session queue (loadQueue), each card past New shown as a quiz
 *  question about half the time. Without questions (their load failed)
 *  every card is a flashcard. */
export async function loadReviewBatch(supabase: Client, todayStart: Date, now: Date): Promise<ReviewBatch> {
  const queue = await loadQueue(supabase, todayStart, now);
  const bank = await buildQuestions(
    supabase,
    queue.map((item) => item.word.id),
    QUIZ_FORMATS,
  ).catch((error) => {
    console.error("loadReviewBatch: couldn't build quiz questions; flashcards only.", error);
    return {} as QuizBank;
  });
  return {
    items: queue.map((item) => ({ ...item, quiz: reviewShowing(item.isNew, bank[item.word.id]) })),
    bank,
  };
}
