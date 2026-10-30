import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

import { TrainingHub, type TodayReview } from "@/components/training/TrainingHub";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { hskSet } from "@/lib/training/deck";
import { LEARNING_SOON_MS, loadQueue, loadTrainingProfile, loadWritingQueue } from "@/lib/training/server";
import { loadWordStats } from "@/lib/training/stats";

export const metadata: Metadata = {
  title: "Training - moink",
};

type Client = SupabaseClient<Database>;

/** A head-only count; throws on a failed query (a count of 0 would look
 *  like nothing to review). */
async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

/** What the Today's review card shows. Throws when any part fails, so the
 *  card shows an error rather than wrong numbers. */
async function loadTodayReview(
  supabase: Client,
  userId: string,
  days: { today: Date; tomorrow: Date },
  now: Date,
): Promise<TodayReview> {
  const cards = () =>
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("suspended", false);
  // Recognition and writing cards in a learning or relearning step due
  // after now: later today for the card's line, and within
  // LEARNING_SOON_MS for Today's review, which includes those.
  const stepsLater = () => cards().in("state", [1, 3]).gt("due", now.toISOString());

  const [queue, writing, due, laterToday, soon] = await Promise.all([
    loadQueue(supabase, days.today, now),
    // The writing queue is a part the card can do without.
    loadWritingQueue(supabase, days.today, now).catch((error) => {
      console.error("TrainingPage: couldn't load the writing queue; showing recognition only.", error);
      return [];
    }),
    count(cards().eq("skill", "recognition").neq("state", 0).lte("due", now.toISOString())),
    count(stepsLater().lt("due", days.tomorrow.toISOString())),
    count(stepsLater().lte("due", new Date(now.getTime() + LEARNING_SOON_MS).toISOString())),
  ]);

  const fresh = queue.filter((item) => item.isNew);
  return {
    due,
    soon,
    laterToday,
    newCount: fresh.length,
    newFromDictionary: fresh.filter((item) => item.card !== null).length,
    toWrite: writing.length,
  };
}

/**
 * The Training hub. Each part loads on its own and a failed one is logged
 * here and shown as an error in its place, with a retry, while the rest of
 * the hub (the practice modes) still works: the profile (limits, day
 * boundaries and the builder's default set), Today's review, and the stats.
 */
export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const now = new Date();
  const profile = await loadTrainingProfile(supabase, userId, now).catch((error) => {
    console.error("TrainingPage: couldn't load the profile.", error);
    return null;
  });

  const [review, stats] = profile
    ? await Promise.all([
        loadTodayReview(supabase, userId, profile.days, now).catch((error) => {
          console.error("TrainingPage: couldn't load Today's review.", error);
          return null;
        }),
        loadWordStats(supabase, userId, profile.days).catch((error) => {
          console.error("TrainingPage: couldn't load the stats.", error);
          return null;
        }),
      ])
    : [null, null];

  return (
    <TrainingHub
      review={review}
      stats={stats}
      limits={profile && { words: profile.dailyNewWords, writing: profile.dailyNewWriting }}
      defaultDeckSet={profile && hskSet(profile.hskLevel, profile.standard)}
    />
  );
}
