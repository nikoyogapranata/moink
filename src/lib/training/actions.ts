"use server";

import { refresh } from "next/cache";

import { isHskStandard } from "@/lib/hsk";
import { createClient, signedInUserId } from "@/lib/supabase/server";

import { isDailyNewWordOption, isDailyNewWritingOption } from "./daily";
import { byGridOrder, isReviewMode, MAX_DECK_WORDS, parseDeckSet, skillOf, type ReviewMode } from "./deck";
import { isGrade, scheduler, toCard, toFields, type CardFields } from "./fsrs";
import type { QueueWord } from "./queue";
import { parseFormats, QUESTION_FORMATS, type QuizBank } from "./quiz";
import {
  buildQuestions,
  loadDeck,
  loadDueTodayIds,
  loadReviewBatch,
  loadTrainingProfile,
  loadTrainingWordIds,
  loadWordsByIds,
  type ReviewBatch,
} from "./server";

const MAX_DURATION_MS = 60_000;

export type RateResult = { ok: true; card: CardFields } | { ok: false };

function isIdList(ids: unknown): ids is number[] {
  return (
    Array.isArray(ids) && ids.length <= MAX_DECK_WORDS && ids.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

/**
 * Rate one card. The server is the source of truth: it loads
 * the stored card (or an empty one for a word with no row yet), schedules
 * it at the server's now, and saves the card and the review together with
 * record_review. `mode` is how the card was shown (a flashcard direction,
 * a quiz format or a writing recall) and decides the card: writing_recall
 * updates the writing card, everything else the recognition card. Returns the new card so the session
 * can decide whether it comes back.
 */
export async function rateCard(
  wordId: number,
  rating: number,
  durationMs: number,
  mode: ReviewMode,
): Promise<RateResult> {
  if (!Number.isSafeInteger(wordId) || wordId <= 0 || !isGrade(rating) || !isReviewMode(mode)) {
    return { ok: false };
  }
  const duration = Number.isFinite(durationMs)
    ? Math.min(Math.max(Math.round(durationMs), 0), MAX_DURATION_MS)
    : null;

  const skill = skillOf(mode);

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { data: row, error: loadError } = await supabase
    .from("user_words")
    .select("due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .eq("skill", skill)
    .maybeSingle();
  if (loadError) {
    console.error("rateCard: couldn't load card", loadError);
    return { ok: false };
  }

  const now = new Date();
  const { card, log } = scheduler.next(toCard(row, now), now, rating);
  const fields = toFields(card);

  const { error: saveError } = await supabase.rpc("record_review", {
    p_word_id: wordId,
    p_card: fields,
    p_log: { ...log, due: log.due.toISOString(), review: log.review.toISOString() },
    p_duration_ms: duration ?? undefined,
    p_mode: mode,
    p_skill: skill,
  });
  if (saveError) {
    console.error("rateCard: couldn't save review", saveError);
    return { ok: false };
  }

  return { ok: true, card: fields };
}

const EMPTY_BATCH: ReviewBatch = { items: [], bank: {}, writing: [] };

/** A fresh session queue and its questions, for "Keep going" on the done
 *  screen. */
export async function fetchQueue(): Promise<ReviewBatch> {
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return EMPTY_BATCH;

  const now = new Date();
  try {
    const { days, standard } = await loadTrainingProfile(supabase, userId, now);
    return await loadReviewBatch(supabase, userId, days.today, now, standard);
  } catch (error) {
    console.error("fetchQueue failed", error);
    return EMPTY_BATCH;
  }
}

export type DeckSetResult =
  | { ok: true; words: QueueWord[]; inTraining: number[]; dueToday: number[] | null }
  | { ok: false };

/**
 * A deck builder set of `standard` (the client's, so the set's level needs
 * no profile read) in grid order, which of its words are in the user's
 * training and, when `dueSkill` is given, the ids of the user's cards of
 * that skill due today (the builder's due hint). One action, and every
 * query in it runs in parallel: the builder waits on a single round trip.
 * Reads only.
 */
export async function fetchDeckSet(set: string, standard: string, dueSkill?: string): Promise<DeckSetResult> {
  if (!isHskStandard(standard)) return { ok: false };
  const deckSet = parseDeckSet(set, standard);
  if (!deckSet) return { ok: false };
  const skill = dueSkill === "recognition" || dueSkill === "writing" ? dueSkill : null;

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const now = new Date();
  try {
    const [words, trainingIds, dueToday] = await Promise.all([
      loadDeck(supabase, userId, deckSet, now, standard),
      // Every word in "My words" is in training already.
      deckSet === "mine" ? null : loadTrainingWordIds(supabase, userId),
      skill ? loadDueTodayIds(supabase, userId, skill, now) : null,
    ]);
    const training = trainingIds ? new Set(trainingIds) : null;
    return {
      ok: true,
      words: words.sort(byGridOrder(standard)),
      inTraining: training ? words.filter((w) => training.has(w.id)).map((w) => w.id) : words.map((w) => w.id),
      dueToday,
    };
  } catch (error) {
    console.error("fetchDeckSet failed", error);
    return { ok: false };
  }
}

/** The words of a built deck, for the practice page. Reads only; null on
 *  a bad id list or a failed load. */
export async function fetchDeckWords(ids: number[]): Promise<QueueWord[] | null> {
  if (!isIdList(ids)) return null;

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return null;

  try {
    return await loadWordsByIds(supabase, [...new Set(ids)]);
  } catch (error) {
    console.error("fetchDeckWords failed", error);
    return null;
  }
}

/** A built quiz deck's words and their questions in `formats`, with
 *  distractors from the levels of `standard` (the client's), for the quiz
 *  page. Reads only; null on bad input or a failed load. */
export async function fetchQuizDeck(
  ids: number[],
  formats: string[],
  standard: string,
): Promise<{ words: QueueWord[]; bank: QuizBank } | null> {
  const quizFormats = parseFormats(formats, QUESTION_FORMATS);
  if (!isIdList(ids) || !quizFormats || !isHskStandard(standard)) return null;

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return null;

  const unique = [...new Set(ids)];
  try {
    const [words, bank] = await Promise.all([
      loadWordsByIds(supabase, unique),
      buildQuestions(supabase, unique, quizFormats, standard),
    ]);
    return { words, bank };
  } catch (error) {
    console.error("fetchQuizDeck failed", error);
    return null;
  }
}

/** Which of `ids` have no recognition card for the user yet, for the
 *  practice done screen's "Add to your training". Reads only; null on a
 *  bad id list or a failed load. */
export async function fetchUntrainedIds(ids: number[]): Promise<number[] | null> {
  if (!isIdList(ids)) return null;

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return null;

  try {
    const training = new Set(await loadTrainingWordIds(supabase, userId));
    return [...new Set(ids)].filter((id) => !training.has(id));
  } catch (error) {
    console.error("fetchUntrainedIds failed", error);
    return null;
  }
}

/**
 * Adds `ids` to the user's training as New recognition cards, the same
 * row the Dictionary's Add inserts (user_id, word_id and skill; the
 * column defaults are an empty FSRS card). get_review_queue then brings
 * them up in Today's review within the daily new-word limit. Words that
 * already have a card are left as they are.
 */
export async function addToTraining(ids: number[]): Promise<{ ok: boolean }> {
  if (!isIdList(ids) || ids.length === 0) return { ok: false };

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { error } = await supabase
    .from("user_words")
    .upsert(
      [...new Set(ids)].map((wordId) => ({ user_id: userId, word_id: wordId, skill: "recognition" })),
      { onConflict: "user_id,word_id,skill", ignoreDuplicates: true },
    );
  if (error) {
    console.error("addToTraining failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/** Saves both daily limits at once: the limits dialog's Save. */
export async function setDailyLimits(words: number, writing: number): Promise<{ ok: boolean }> {
  if (!isDailyNewWordOption(words) || !isDailyNewWritingOption(writing)) return { ok: false };

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  // .select() so an update that RLS filtered down to zero rows reads as a
  // failure instead of a silent success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ daily_new_words: words, daily_new_writing: writing })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("setDailyLimits failed", error);
    return { ok: false };
  }

  refresh();
  return { ok: true };
}
