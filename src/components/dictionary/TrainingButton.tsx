"use client";

import { Check, PenLine, Plus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAppUser } from "@/components/app/AppShell";
import { Button } from "@/components/ui/Button";
import { dueLabel, useTrainingIds } from "@/lib/dictionary/training";
import { createClient } from "@/lib/supabase/client";
import { isWritable } from "@/lib/training/writing";

type Card = { reps: number; due: string };
type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "card"; card: Card };

/** The word's writing card, or why there isn't one yet. Same rule as
 *  get_writing_queue: recognition in Review with 2 Good or Easy reviews,
 *  and stroke data for every character. */
type Writing =
  | { kind: "card"; due: string }
  | { kind: "unlocked" }
  | { kind: "locked" }
  | { kind: "unavailable" };

/** Good and Easy recognition reviews a word needs for writing. */
const UNLOCK_REVIEWS = 2;
const REVIEW_STATE = 2;

function writingLine(writing: Writing, now: number) {
  switch (writing.kind) {
    case "card": {
      const label = now === 0 ? null : dueLabel(writing.due, now);
      return label ? `Writing · due ${label}` : "Writing · due now";
    }
    case "unlocked":
      return "Writing unlocked · comes up in Today's review";
    case "unavailable":
      return "Writing isn't available for this word";
    case "locked":
      return "Writing unlocks after a few correct reviews";
  }
}

// Re-render once a minute so "due in 5 minutes" stays roughly right.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * Add to training / Added / Learning, for one word's recognition card.
 * Give it key={wordId} so switching words starts fresh. Adding inserts a
 * user_words row with only user_id, word_id and skill (the column defaults
 * are an empty FSRS card).
 * Both add and remove are optimistic and roll back with a message if the
 * request fails.
 */
export function TrainingButton({ wordId, simplified }: { wordId: number; simplified: string }) {
  const user = useAppUser();
  const training = useTrainingIds();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [writing, setWriting] = useState<Writing>({ kind: "locked" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const card = (skill: "recognition" | "writing") =>
      supabase
        .from("user_words")
        .select("reps, due, state")
        .eq("user_id", user.id)
        .eq("word_id", wordId)
        .eq("skill", skill)
        .maybeSingle();
    Promise.all([
      card("recognition"),
      card("writing"),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("word_id", wordId)
        .eq("skill", "recognition")
        .in("rating", [3, 4]),
    ]).then(([recognition, writingCard, good]) => {
      if (cancelled) return;
      if (recognition.error) {
        setState({ kind: "none" });
        setError("Couldn't check your training. Reload to try again.");
        return;
      }
      const data = recognition.data;
      setState(data ? { kind: "card", card: { reps: data.reps, due: data.due } } : { kind: "none" });
      if (writingCard.data) setWriting({ kind: "card", due: writingCard.data.due });
      else if (!isWritable(simplified)) setWriting({ kind: "unavailable" });
      else if (data?.state === REVIEW_STATE && (good.count ?? 0) >= UNLOCK_REVIEWS) setWriting({ kind: "unlocked" });
      else setWriting({ kind: "locked" });
    });
    return () => {
      cancelled = true;
    };
  }, [user.id, wordId, simplified]);

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const previous = state;
    setState({ kind: "card", card: { reps: 0, due: new Date().toISOString() } });
    training?.setInTraining(wordId, true);

    const { data, error: addError } = await createClient()
      .from("user_words")
      .insert({ user_id: user.id, word_id: wordId, skill: "recognition" })
      .select("reps, due")
      .single();
    setBusy(false);
    if (addError) {
      setState(previous);
      training?.setInTraining(wordId, false);
      setError("Couldn't add this word. Please try again.");
      return;
    }
    setState({ kind: "card", card: data });
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const previous = state;
    setState({ kind: "none" });
    training?.setInTraining(wordId, false);

    const { error: removeError } = await createClient()
      .from("user_words")
      .delete()
      .eq("user_id", user.id)
      .eq("word_id", wordId)
      .eq("skill", "recognition");
    setBusy(false);
    if (removeError) {
      setState(previous);
      training?.setInTraining(wordId, true);
      setError("Couldn't remove this word. Please try again.");
    }
  }

  return (
    <div className="flex min-h-11 flex-col justify-center gap-1.5">
      {state.kind === "loading" && (
        <span aria-hidden="true" className="h-11 w-44 rounded-pill bg-highlight/60 motion-safe:animate-pulse" />
      )}

      {state.kind === "none" && (
        <Button onClick={add} disabled={busy} className="gap-2 self-start">
          <Plus size={18} aria-hidden="true" />
          Add to training
        </Button>
      )}

      {state.kind === "card" && state.card.reps === 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-body text-bark">
          <span className="inline-flex items-center gap-1.5">
            <Check size={18} aria-hidden="true" className="text-deep-grass" />
            Added · comes up in your next session
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md font-body text-body font-medium text-bark-muted underline-offset-4 hover:text-bark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-60"
          >
            Remove
          </button>
        </p>
      )}

      {state.kind === "card" && state.card.reps > 0 && (
        <p className="inline-flex items-center gap-1.5 font-body text-body text-bark">
          <Check size={18} aria-hidden="true" className="text-deep-grass" />
          {now === 0
            ? "Learning"
            : (() => {
                const label = dueLabel(state.card.due, now);
                return label ? `Learning · ${label}` : "Due now";
              })()}
        </p>
      )}

      {state.kind === "card" && (
        <p className="inline-flex items-center gap-1.5 font-body text-body text-bark-muted">
          <PenLine size={16} aria-hidden="true" className={writing.kind === "card" ? "text-bamboo-gold-dark" : ""} />
          {writingLine(writing, now)}
        </p>
      )}

      {error && (
        <p role="alert" className="font-body text-body text-bark">
          {error}
        </p>
      )}
    </div>
  );
}
