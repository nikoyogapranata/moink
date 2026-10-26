import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReviewSession } from "@/components/training/ReviewSession";
import { createClient } from "@/lib/supabase/server";
import { loadQueue, loadTrainingProfile } from "@/lib/training/server";

export const metadata: Metadata = {
  title: "Review - moink",
};

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const { days } = await loadTrainingProfile(supabase, user!.id, now);
  const queue = await loadQueue(supabase, days.today, now);
  if (queue.length === 0) redirect("/training");

  return <ReviewSession initialQueue={queue} />;
}
