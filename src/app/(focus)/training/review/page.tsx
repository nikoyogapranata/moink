import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RetryButton } from "@/components/app/RetryButton";
import { ReviewSession } from "@/components/training/ReviewSession";
import { DoneScreen } from "@/components/training/SessionParts";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { loadReviewBatch, loadTrainingProfile, type ReviewBatch } from "@/lib/training/server";

export const metadata: Metadata = {
  title: "Review - moink",
};

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  let batch: ReviewBatch;
  try {
    const { days, standard } = await loadTrainingProfile(supabase, user!.id, now);
    // Which cards are quiz questions is picked here, so the first render
    // matches on the server and the client.
    batch = await loadReviewBatch(supabase, user!.id, days.today, now, standard);
  } catch (error) {
    console.error("ReviewPage: couldn't load the review.", error);
    return (
      <DoneScreen title="Couldn't load your review" stats={[]} pose="ready">
        <p role="alert" className="w-full font-body text-body text-bark-muted">
          Nothing was lost. Try again in a moment.
        </p>
        <RetryButton size="default" />
        <Button variant="secondary" asChild>
          <Link href="/training">Back to Training</Link>
        </Button>
      </DoneScreen>
    );
  }
  // Outside the try: redirect() works by throwing.
  if (batch.items.length === 0 && batch.writing.length === 0) redirect("/training");

  return <ReviewSession initialBatch={batch} />;
}
