import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReviewSession } from "@/components/training/ReviewSession";
import { createClient } from "@/lib/supabase/server";
import { loadReviewBatch, loadTrainingProfile } from "@/lib/training/server";

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
  // Which cards are quiz questions is picked here, so the first render
  // matches on the server and the client.
  const batch = await loadReviewBatch(supabase, user!.id, days.today, now);
  if (batch.items.length === 0 && batch.writing.length === 0) redirect("/training");

  return <ReviewSession initialBatch={batch} />;
}
