import type { SupabaseClient } from "@supabase/supabase-js";

import { closestLevel, LEVEL_COLUMN, STANDARD_LEVELS, type HskStandard } from "@/lib/hsk";
import type { Database, Skill, Tables } from "@/lib/supabase/database.types";
import { dayStarts, FALLBACK_TIME_ZONE } from "@/lib/time";

import { deckSetLevel, DUE_SOON_MS, type DeckSet } from "./deck";
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

/** The profile fields trainingProfile reads. */
export type TrainingProfileRow = Pick<
  Tables<"profiles">,
  "daily_new_words" | "daily_new_writing" | "hsk_level_target" | "hsk_standard" | "timezone"
>;

/** The user's daily new-word and new-writing limits, HSK standard and
 *  target level in it, and day boundaries in their zone, from their
 *  profile row (null: none, so the defaults). */
export function trainingProfile(profile: TrainingProfileRow | null, now = new Date()) {
  return {
    dailyNewWords: profile?.daily_new_words ?? 0,
    dailyNewWriting: profile?.daily_new_writing ?? 0,
    hskLevel: profile?.hsk_level_target ?? null,
    standard: (profile?.hsk_standard ?? "hsk3") as HskStandard,
    days: dayStarts(profile?.timezone || FALLBACK_TIME_ZONE, now),
  };
}

/** trainingProfile, reading the profile. Throws when it can't be read:
 *  guessing defaults would show wrong limits and day boundaries. */
export async function loadTrainingProfile(supabase: Client, userId: string, now = new Date()) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("daily_new_words, daily_new_writing, hsk_level_target, hsk_standard, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return trainingProfile(profile, now);
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

const WORD_FIELDS = "id, simplified, pinyin, gloss, hsk_level, hsk3_2025_level, classifiers";
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
 *  DUE_SOON_MS, and "hskN" every word at level N in `standard`. */
export async function loadDeck(
  supabase: Client,
  userId: string,
  set: DeckSet,
  now: Date,
  standard: HskStandard,
): Promise<QueueWord[]> {
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

  const level = deckSetLevel(set)!;
  return allRows((from, to) =>
    supabase.from("words").select(WORD_FIELDS).eq(LEVEL_COLUMN[standard], level).order("id").range(from, to),
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

const QUIZ_FIELDS = "id, simplified, pinyin, pinyin_plain, gloss";
/** The words table only changes when it's reseeded, so each level's pool
 *  is kept in memory for a while, shared by every request. */
const POOL_TTL_MS = 60 * 60_000;
const pools = new Map<string, { words: QuizWord[]; at: number }>();

async function levelWords(supabase: Client, standard: HskStandard, level: number): Promise<QuizWord[]> {
  const key = `${standard}:${level}`;
  const cached = pools.get(key);
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.words;
  const words = await allRows((from, to) =>
    supabase.from("words").select(QUIZ_FIELDS).eq(LEVEL_COLUMN[standard], level).order("id").range(from, to),
  );
  pools.set(key, { words, at: Date.now() });
  return words;
}

/** Every level's pool in `standard` (cached after the first request). */
async function standardPools(supabase: Client, standard: HskStandard) {
  const levels = STANDARD_LEVELS[standard];
  return new Map(
    await Promise.all(levels.map(async (level) => [level, await levelWords(supabase, standard, level)] as const)),
  );
}

/** Pool levels in `standard` for words that have no level in it: the
 *  closest level to theirs in the other standard, or to their 2021 HSK 3.0
 *  level; none when they have neither. */
async function borrowedLevels(supabase: Client, ids: number[], standard: HskStandard) {
  const levels = new Map<number, { level: number; word: QuizWord }>();
  const other: HskStandard = standard === "hsk2" ? "hsk3" : "hsk2";
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from("words")
      .select(`${QUIZ_FIELDS}, hsk_level, hsk3_2025_level, hsk3_level`)
      .in("id", ids.slice(i, i + IDS_PER_REQUEST));
    if (error) throw error;
    for (const { hsk_level, hsk3_2025_level, hsk3_level, ...word } of data ?? []) {
      const otherLevel = other === "hsk2" ? hsk_level : hsk3_2025_level;
      const level =
        otherLevel !== null
          ? closestLevel(otherLevel, other, standard)
          : hsk3_level !== null
            ? closestLevel(hsk3_level, "hsk3", standard)
            : null;
      if (level !== null) levels.set(word.id, { level, word });
    }
  }
  return levels;
}

/**
 * buildQuestions: each word's options in each of `formats` (see
 * buildWordQuestions), distractors from the word's level in `standard`,
 * or its neighbors too when the level is small; listening's sound-alikes
 * from every level up to one above it (soundPool). A word with no level in
 * the standard borrows the closest one (borrowedLevels); without any
 * level it gets no questions (a flashcard). Unknown ids are skipped.
 */
export async function buildQuestions(
  supabase: Client,
  wordIds: number[],
  formats: readonly QuestionFormat[],
  standard: HskStandard,
): Promise<QuizBank> {
  const ids = new Set(wordIds);
  const byLevel = await standardPools(supabase, standard);
  const targets = new Map<number, QuizWord[]>();
  for (const [level, words] of byLevel) {
    const found = words.filter((w) => ids.has(w.id));
    found.forEach((w) => ids.delete(w.id));
    if (found.length) targets.set(level, found);
  }
  if (ids.size > 0) {
    for (const { level, word } of (await borrowedLevels(supabase, [...ids], standard)).values()) {
      targets.set(level, [...(targets.get(level) ?? []), word]);
    }
  }
  const bank: QuizBank = {};
  for (const [level, words] of targets) {
    const levelPools = { level: levelPool(byLevel, level), sounds: soundPool(byLevel, level) };
    for (const target of words) bank[target.id] = buildWordQuestions(target, levelPools, formats);
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
  standard: HskStandard,
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
    standard,
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
