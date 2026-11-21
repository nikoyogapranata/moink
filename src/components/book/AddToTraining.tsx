"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";

import { useAppUser } from "@/components/app/AppShell";
import { createClient } from "@/lib/supabase/client";

const BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/**
 * Adds a book word to Training (a new recognition card, as the Dictionary's
 * Add to training). Disabled when the word isn't in our word table, and a
 * check once it's in training. Optimistic, rolled back if the insert fails.
 */
export function AddToTraining({
  hanzi,
  wordId,
  inTraining,
}: {
  hanzi: string;
  wordId: number | null;
  inTraining: boolean;
}) {
  const user = useAppUser();
  const [added, setAdded] = useState(inTraining);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (wordId === null) {
    const tip = `${hanzi} isn't in the moink word list yet`;
    // The tooltip sits on a wrapper: a disabled button gets no hover.
    return (
      <span title={tip} className="inline-flex">
        <button type="button" disabled aria-label={`Add ${hanzi} to Training: ${tip}`} className={`${BUTTON} text-bark-muted/40`}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </span>
    );
  }

  if (added) {
    return (
      <span title="In Training" className={`${BUTTON} text-deep-grass`} role="img" aria-label={`${hanzi} is in Training`}>
        <Check size={18} aria-hidden="true" />
      </span>
    );
  }

  async function add() {
    if (busy || wordId === null) return;
    setBusy(true);
    setFailed(false);
    setAdded(true);
    const { error } = await createClient()
      .from("user_words")
      .insert({ user_id: user.id, word_id: wordId, skill: "recognition" });
    setBusy(false);
    // 23505: it was already there (added in another tab), which is fine.
    if (error && error.code !== "23505") {
      setAdded(false);
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={busy}
      title={failed ? "Couldn't add it. Try again." : "Add to Training"}
      aria-label={failed ? `Couldn't add ${hanzi}. Try again.` : `Add ${hanzi} to Training`}
      className={`${BUTTON} ${failed ? "text-danger" : "text-bark-muted"} hover:bg-highlight/60 hover:text-rust-dark`}
    >
      <Plus size={18} aria-hidden="true" />
    </button>
  );
}
