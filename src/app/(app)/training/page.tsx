import type { Metadata } from "next";

import { TrainingHub } from "@/components/training/TrainingHub";
import { createClient } from "@/lib/supabase/server";
import { hskSet } from "@/lib/training/deck";
import { loadQueue, loadTrainingProfile } from "@/lib/training/server";

export const metadata: Metadata = {
  title: "Training - moink",
};

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const { dailyNewWords, hskLevel, days } = await loadTrainingProfile(supabase, user!.id, now);

  // Recognition cards only; head: true returns just the count.
  const cards = () =>
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("skill", "recognition");

  const [queue, dueNow, learning, dueTomorrow] = await Promise.all([
    loadQueue(supabase, days.today, now),
    cards().eq("suspended", false).neq("state", 0).lte("due", now.toISOString()),
    cards().neq("state", 0),
    cards()
      .eq("suspended", false)
      .neq("state", 0)
      .gte("due", days.tomorrow.toISOString())
      .lt("due", days.dayAfter.toISOString()),
  ]);

  const fresh = queue.filter((item) => item.isNew);

  return (
    <TrainingHub
      due={dueNow.count ?? 0}
      newCount={fresh.length}
      newFromDictionary={fresh.filter((item) => item.card !== null).length}
      learning={learning.count ?? 0}
      dueTomorrow={dueTomorrow.count ?? 0}
      dailyNewWords={dailyNewWords}
      defaultDeckSet={hskSet(hskLevel)}
    />
  );
}
