import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Skill } from "@/lib/supabase/database.types";
import { dayStarts, FALLBACK_TIME_ZONE } from "@/lib/time";

import { DUE_SOON_MS, type DeckSet } from "./deck";
import { toQueueItems, type QueueItem, type QueueWord } from "./queue";
import {
  buildWordQuestions,
  levelPool,
  QUESTION_FORMATS,
  reviewShowing,
  soundPool,
  type QuizBank,
  type QuestionFormat,
  type QuizWord,
} from "./quiz";

type Client = SupabaseClient<Database>;

/** The user's daily new-word and new-writing limits, target HSK level
 *  and day boundaries in their zone. */
export async function loadTrainingProfile(supabase: Client, userId: string, now = new Date()) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("daily_new_words, daily_new_writing, hsk_level_target, timezone")
    .eq("id", userId)
    .maybeSingle();
  return {
    dailyNewWords: profile?.daily_new_words ?? 0,
    dailyNewWriting: profile?.daily_new_writing ?? 0,
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

/** Cards past this are never due today, whatever the user's zone. */
const TWO_DAYS_MS = 2 * 24 * 60 * 60_000;

/**
 * Ids of the user's cards of `skill` (past New, not suspended) due today
 * in their zone, overdue included. The day's end needs the profile's time
 * zone, so cards due within two days load alongside the profile and are
 * cut at the end of today after: one round trip, not two.
 */
export async function loadDueTodayIds(supabase: Client, userId: string, skill: Skill, now: Date): Promise<number[]> {
  const [{ days }, rows] = await Promise.all([
    loadTrainingProfile(supabase, userId, now),
    allRows((from, to) =>
      supabase
        .from("user_words")
        .select("word_id, due")
        .eq("user_id", userId)
        .eq("skill", skill)
        .eq("suspended", false)
        .neq("state", 0)
        .lt("due", new Date(now.getTime() + TWO_DAYS_MS).toISOString())
        .order("word_id")
        .range(from, to),
    ),
  ]);
  const end = days.tomorrow.getTime();
  return rows.filter((row) => Date.parse(row.due) < end).map((row) => row.word_id);
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
 * its neighbors too when the level is small; listening's sound-alikes from
 * every level up to one above it (soundPool). Unknown ids are skipped.
 */
export async function buildQuestions(
  supabase: Client,
  wordIds: number[],
  formats: readonly QuestionFormat[],
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
    const pools = { level: levelPool(byLevel, level), sounds: soundPool(byLevel, level) };
    for (const target of targets) bank[target.id] = buildWordQuestions(target, pools, formats);
  }
  return bank;
}

/** The writing session queue from get_writing_queue, as of `now`: due
 *  writing cards (Recall only), then newly eligible words (Trace first). */
export async function loadWritingQueue(supabase: Client, todayStart: Date, now: Date): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc("get_writing_queue", {
    p_now: now.toISOString(),
    p_today_start: todayStart.toISOString(),
  });
  if (error) throw error;
  return toQueueItems(data ?? []).map((item) => ({ ...item, writing: { trace: item.isNew } }));
}

/** Learning and relearning cards due within this window are part of
 *  Today's review: a learning step a few minutes away is reviewed now
 *  rather than left out of the session. */
export const LEARNING_SOON_MS = 30 * 60_000;

/** ts-fsrs states for cards between steps: Learning and Relearning. */
const STEP_STATES = [1, 3];

/** The user's cards of `skill` in a learning or relearning step (not
 *  suspended) due after `now` and within LEARNING_SOON_MS, earliest
 *  first. get_review_queue and get_writing_queue have those due by `now`,
 *  so they don't overlap. */
export async function loadLearningSoon(
  supabase: Client,
  userId: string,
  skill: Skill,
  now: Date,
): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from("user_words")
    .select(
      `due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, words(${WORD_FIELDS})`,
    )
    .eq("user_id", userId)
    .eq("skill", skill)
    .eq("suspended", false)
    .in("state", STEP_STATES)
    .gt("due", now.toISOString())
    .lte("due", new Date(now.getTime() + LEARNING_SOON_MS).toISOString())
    .order("due");
  if (error) throw error;
  return (data ?? []).flatMap(({ words, ...card }) => (words ? [{ word: words, card, isNew: false }] : []));
}

/** `queue` (due cards, then new ones) with `soon` between the two. */
function beforeNew(queue: QueueItem[], soon: QueueItem[]): QueueItem[] {
  const firstNew = queue.findIndex((item) => item.isNew);
  return firstNew === -1 ? [...queue, ...soon] : [...queue.slice(0, firstNew), ...soon, ...queue.slice(firstNew)];
}

/** Today's review: the recognition queue with its quiz questions, then
 *  the writing queue. */
export interface ReviewBatch {
  items: QueueItem[];
  bank: QuizBank;
  writing: QueueItem[];
}

/** The session queue (loadQueue, with loadLearningSoon's recognition
 *  cards after the due ones), each card past New shown as a
 *  flashcard, quiz or listening question (REVIEW_MIX; the client swaps
 *  listening out when it has no Chinese voice), and the writing queue
 *  (loadWritingQueue, with loadLearningSoon's writing cards after the
 *  due ones).
 *  Without questions
 *  (their load failed) every card is a flashcard; without the writing
 *  queue (its load failed) the session is recognition only. */
export async function loadReviewBatch(
  supabase: Client,
  userId: string,
  todayStart: Date,
  now: Date,
): Promise<ReviewBatch> {
  const soonOf = (skill: Skill) =>
    loadLearningSoon(supabase, userId, skill, now).catch((error) => {
      console.error(`loadReviewBatch: couldn't load ${skill} cards due soon; due now only.`, error);
      return [] as QueueItem[];
    });
  const [scheduled, soon, writingScheduled, writingSoon] = await Promise.all([
    loadQueue(supabase, todayStart, now),
    soonOf("recognition"),
    loadWritingQueue(supabase, todayStart, now).catch((error) => {
      console.error("loadReviewBatch: couldn't load the writing queue; recognition only.", error);
      return [] as QueueItem[];
    }),
    soonOf("writing"),
  ]);
  const queue = beforeNew(scheduled, soon);
  // A writing card in a step is past Trace: Recall only.
  const writing = beforeNew(
    writingScheduled,
    writingSoon.map((item) => ({ ...item, writing: { trace: false } })),
  );
  const bank = await buildQuestions(
    supabase,
    queue.map((item) => item.word.id),
    QUESTION_FORMATS,
  ).catch((error) => {
    console.error("loadReviewBatch: couldn't build quiz questions; flashcards only.", error);
    return {} as QuizBank;
  });
  return {
    items: queue.map((item) => ({ ...item, ...reviewShowing(item.isNew, bank[item.word.id]) })),
    bank,
    writing,
  };
}
