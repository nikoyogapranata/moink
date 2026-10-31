import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** user_words.state values (ts-fsrs State). */
const NEW = 0;
const REVIEW = 2;

/** A recognition card in Review counts as learned from this stability
 *  (days) up and after LEARNED_MIN_REPS reviews: remembered a day or more
 *  later, more than once. Stability alone isn't enough, since one Easy
 *  first review already starts a card above 7 days. */
export const LEARNED_STABILITY_DAYS = 7;
export const LEARNED_MIN_REPS = 2;

/** The training stats, shared by the Training hub and the Dashboard so
 *  each number means the same everywhere. All recognition cards. */
export interface WordStats {
  /** Cards past New: reviewed at least once. */
  started: number;
  /** Cards in Review with stability of at least LEARNED_STABILITY_DAYS
   *  and at least LEARNED_MIN_REPS reviews. */
  learned: number;
  /** Cards (not New, not suspended) due during tomorrow in the user's
   *  zone. */
  dueTomorrow: number;
}

/** One line on what each stat counts, for its info tooltip. */
export const WORD_STAT_INFO: Record<keyof WordStats, { label: string; info: string }> = {
  started: {
    label: "Words started",
    info: "Words you've reviewed at least once in Today's review.",
  },
  learned: {
    label: "Words learned",
    info: "Words you've remembered a day or more later, more than once.",
  },
  dueTomorrow: {
    label: "Due tomorrow",
    info: "Words Today's review will ask you again tomorrow.",
  },
};

/** One level's words in the user's standard, and how many they've started
 *  and learned (the WordStats definitions). */
export interface LevelProgress {
  level: number;
  total: number;
  started: number;
  learned: number;
}

/** Every level of the user's standard, in order (get_level_progress, given
 *  the learned thresholds above so the SQL counts the same). */
export async function loadLevelProgress(supabase: Client): Promise<LevelProgress[]> {
  const { data, error } = await supabase.rpc("get_level_progress", {
    p_learned_stability: LEARNED_STABILITY_DAYS,
    p_learned_min_reps: LEARNED_MIN_REPS,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    level: row.level,
    total: Number(row.total),
    started: Number(row.started),
    learned: Number(row.learned),
  }));
}

export const FORECAST_DAYS = 7;

/** Recognition and writing reviews due on each of the next FORECAST_DAYS
 *  days in the user's zone, today (overdue included) first
 *  (get_due_forecast). */
export async function loadDueForecast(supabase: Client): Promise<{ day: string; due: number }[]> {
  const { data, error } = await supabase.rpc("get_due_forecast", { p_days: FORECAST_DAYS });
  if (error) throw error;
  return (data ?? []).map((row) => ({ day: row.day, due: Number(row.due) }));
}

/** The user's WordStats; `days` are their day boundaries (dayStarts). Each
 *  is a head-only count, all three in parallel. */
export async function loadWordStats(
  supabase: Client,
  userId: string,
  days: { tomorrow: Date; dayAfter: Date },
): Promise<WordStats> {
  const cards = () =>
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("skill", "recognition");

  const [started, learned, dueTomorrow] = await Promise.all([
    cards().neq("state", NEW),
    cards().eq("state", REVIEW).gte("stability", LEARNED_STABILITY_DAYS).gte("reps", LEARNED_MIN_REPS),
    cards()
      .eq("suspended", false)
      .neq("state", NEW)
      .gte("due", days.tomorrow.toISOString())
      .lt("due", days.dayAfter.toISOString()),
  ]);
  for (const result of [started, learned, dueTomorrow]) if (result.error) throw result.error;
  return { started: started.count ?? 0, learned: learned.count ?? 0, dueTomorrow: dueTomorrow.count ?? 0 };
}
