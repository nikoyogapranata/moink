import type { Metadata } from "next";

import { TrainingHub } from "@/components/training/TrainingHub";
import { createClient } from "@/lib/supabase/server";
import { hskSet } from "@/lib/training/deck";
import { loadQueue, loadTrainingProfile, loadWritingQueue } from "@/lib/training/server";
import { loadWordStats } from "@/lib/training/stats";

export const metadata: Metadata = {
  title: "Training - moink",
};

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const { dailyNewWords, dailyNewWriting, hskLevel, days } = await loadTrainingProfile(supabase, user!.id, now);

  const [queue, writing, dueNow, stats] = await Promise.all([
    loadQueue(supabase, days.today, now),
    loadWritingQueue(supabase, days.today, now).catch((error) => {
      console.error("TrainingPage: couldn't load the writing queue.", error);
      return [];
    }),
    supabase
      .from("user_words")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("skill", "recognition")
      .eq("suspended", false)
      .neq("state", 0)
      .lte("due", now.toISOString()),
    loadWordStats(supabase, user!.id, days),
  ]);

  const fresh = queue.filter((item) => item.isNew);

  return (
    <TrainingHub
      due={dueNow.count ?? 0}
      newCount={fresh.length}
      newFromDictionary={fresh.filter((item) => item.card !== null).length}
      toWrite={writing.length}
      stats={stats}
      dailyNewWords={dailyNewWords}
      dailyNewWriting={dailyNewWriting}
      defaultDeckSet={hskSet(hskLevel)}
    />
  );
}
