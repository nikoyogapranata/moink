"use server";

import { refresh } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { isDailyNewWordOption } from "./daily";
import { byGridOrder, isReviewMode, MAX_DECK_WORDS, parseDeckSet, type ReviewMode } from "./deck";
import { isGrade, scheduler, toCard, toFields, type CardFields } from "./fsrs";
import type { QueueItem, QueueWord } from "./queue";
import { loadDeck, loadQueue, loadTrainingProfile, loadTrainingWordIds, loadWordsByIds } from "./server";

const MAX_DURATION_MS = 60_000;

export type RateResult = { ok: true; card: CardFields } | { ok: false };

/**
 * Rate one recognition card. The server is the source of truth: it loads
 * the stored card (or an empty one for a word with no row yet), schedules
 * it at the server's now, and saves the card and the review together with
 * record_review. `mode` is the direction the card was shown in; both
 * update the same recognition card. Returns the new card so the session
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: row, error: loadError } = await supabase
    .from("user_words")
    .select("due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review")
    .eq("user_id", user.id)
    .eq("word_id", wordId)
    .eq("skill", "recognition")
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
    p_skill: "recognition",
  });
  if (saveError) {
    console.error("rateCard: couldn't save review", saveError);
    return { ok: false };
  }

  return { ok: true, card: fields };
}

/** A fresh session queue, for "Keep going" on the done screen. */
export async function fetchQueue(): Promise<QueueItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const now = new Date();
  const { days } = await loadTrainingProfile(supabase, user.id, now);
  try {
    return await loadQueue(supabase, days.today, now);
  } catch (error) {
    console.error("fetchQueue failed", error);
    return [];
  }
}

export type DeckSetResult = { ok: true; words: QueueWord[]; inTraining: number[] } | { ok: false };

/** A deck builder set in grid order, and which of its words are in the
 *  user's training. Reads only. */
export async function fetchDeckSet(set: string): Promise<DeckSetResult> {
  const deckSet = parseDeckSet(set);
  if (!deckSet) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  try {
    const [words, trainingIds] = await Promise.all([
      loadDeck(supabase, user.id, deckSet, new Date()),
      loadTrainingWordIds(supabase, user.id),
    ]);
    const training = new Set(trainingIds);
    return {
      ok: true,
      words: words.sort(byGridOrder),
      inTraining: words.filter((w) => training.has(w.id)).map((w) => w.id),
    };
  } catch (error) {
    console.error("fetchDeckSet failed", error);
    return { ok: false };
  }
}

/** The words of a built deck, for the practice page. Reads only; null on
 *  a bad id list or a failed load. */
export async function fetchDeckWords(ids: number[]): Promise<QueueWord[] | null> {
  if (
    !Array.isArray(ids) ||
    ids.length > MAX_DECK_WORDS ||
    !ids.every((id) => Number.isSafeInteger(id) && id > 0)
  ) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    return await loadWordsByIds(supabase, [...new Set(ids)]);
  } catch (error) {
    console.error("fetchDeckWords failed", error);
    return null;
  }
}

export async function setDailyNewWords(value: number): Promise<{ ok: boolean }> {
  if (!isDailyNewWordOption(value)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // .select() so an update that RLS filtered down to zero rows reads as a
  // failure instead of a silent success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ daily_new_words: value })
    .eq("id", user.id)
    .select("id");
  if (error || !data?.length) {
    console.error("setDailyNewWords failed", error);
    return { ok: false };
  }

  refresh();
  return { ok: true };
}
