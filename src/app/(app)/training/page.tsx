import type { Metadata } from "next";

import { TrainingHub } from "@/components/training/TrainingHub";
import { createClient } from "@/lib/supabase/server";
import { hskSet } from "@/lib/training/deck";
import { loadTrainingProfile } from "@/lib/training/server";
import { loadWordStats } from "@/lib/training/stats";
import { loadTodayReview } from "@/lib/training/today";

export const metadata: Metadata = {
  title: "Training - moink",
};

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
