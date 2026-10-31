import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { LEARNING_SOON_MS, loadQueue, loadWritingQueue } from "./server";

type Client = SupabaseClient<Database>;

/** What the Today's review card shows (the Training hub and the
 *  Dashboard). */
export interface TodayReview {
  due: number;
  /** Learning and relearning cards due within LEARNING_SOON_MS: not due
   *  yet, but Start review includes them. */
  soon: number;
  /** Learning and relearning cards due later today (soon included). */
  laterToday: number;
  newCount: number;
  newFromDictionary: number;
  /** Writing cards in Today's review: due and new. */
  toWrite: number;
}

/** A head-only count; throws on a failed query (a count of 0 would look
 *  like nothing to review). */
async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

/** What the Today's review card shows. Throws when any part fails, so the
 *  card shows an error rather than wrong numbers. */
export async function loadTodayReview(
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
      console.error("loadTodayReview: couldn't load the writing queue; showing recognition only.", error);
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
