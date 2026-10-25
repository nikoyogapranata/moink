"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAppUser } from "@/components/app/AppShell";
import { Button } from "@/components/ui/Button";
import { dueLabel, useTrainingIds } from "@/lib/dictionary/training";
import { createClient } from "@/lib/supabase/client";

type Card = { reps: number; due: string };
type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "card"; card: Card };

// Re-render once a minute so "due in 5 minutes" stays roughly right.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * Add to training / Added / Learning, for one word. Give it key={wordId}
 * so switching words starts fresh. Adding inserts a user_words row with
 * only user_id and word_id (the column defaults are an empty FSRS card).
 * Both add and remove are optimistic and roll back with a message if the
 * request fails.
 */
export function TrainingButton({ wordId }: { wordId: number }) {
  const user = useAppUser();
  const training = useTrainingIds();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("user_words")
      .select("reps, due")
      .eq("user_id", user.id)
      .eq("word_id", wordId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setState({ kind: "none" });
          setError("Couldn't check your training. Reload to try again.");
        } else {
          setState(data ? { kind: "card", card: data } : { kind: "none" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, wordId]);

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const previous = state;
    setState({ kind: "card", card: { reps: 0, due: new Date().toISOString() } });
    training?.setInTraining(wordId, true);

    const { data, error: addError } = await createClient()
      .from("user_words")
      .insert({ user_id: user.id, word_id: wordId })
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
      .eq("word_id", wordId);
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

      {error && (
        <p role="alert" className="font-body text-body text-bark">
          {error}
        </p>
      )}
    </div>
  );
}
