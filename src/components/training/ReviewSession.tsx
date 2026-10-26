"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rating } from "ts-fsrs";

import { Button } from "@/components/ui/Button";
import { devError } from "@/lib/dev";
import { fetchQueue, rateCard } from "@/lib/training/actions";
import { reviewMode } from "@/lib/training/deck";
import {
  afterPractice,
  afterRating,
  interleave,
  runStats,
  startPractice,
  startRun,
  type QueueItem,
  type Run,
} from "@/lib/training/queue";

import { CardStage } from "./FlashCard";
import { useDirection } from "./hooks";
import { DoneScreen, formatSpent, SessionFrame, SessionHeader } from "./SessionParts";

const MAX_DURATION_MS = 60_000;
// Starting guess for how long a card takes, until the session has its own.
const DEFAULT_MS_PER_CARD = 15_000;

/**
 * Today's review: the scheduled queue, every answer saved with rateCard
 * (Still learning = Again, Got it = Good). Reset, and Practice again on the
 * done screen, replay cards as a practice round that saves nothing.
 */
export function ReviewSession({ initialQueue }: { initialQueue: QueueItem[] }) {
  const [direction, setDirection] = useDirection("review", null);
  // The session's card list in session order, for Reset.
  const [cards, setCards] = useState(() => interleave(initialQueue));
  const [run, setRun] = useState(() => startRun(initialQueue));
  const [practiceRound, setPracticeRound] = useState(false);
  // Remounts the stage on Reset and new rounds.
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [spentMs, setSpentMs] = useState(0);
  const [more, setMore] = useState<QueueItem[] | null>(null);

  const startedAt = useRef(0);
  const timing = useRef({ total: 0, count: 0 });

  const current = run.queue[0];
  const done = !current;
  const stats = runStats(run);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    fetchQueue()
      .then((items) => {
        if (!cancelled) setMore(items);
      })
      .catch((error) => devError("ReviewSession: fetchQueue threw, so Keep going stays hidden.", error));
    return () => {
      cancelled = true;
    };
  }, [done]);

  function advance(next: Run) {
    setRun(next);
    if (next.queue.length === 0) setSpentMs(Date.now() - startedAt.current);
  }

  async function answer(gotIt: boolean, durationMs: number) {
    const grade = gotIt ? Rating.Good : Rating.Again;
    setError(null);
    if (practiceRound) return () => advance(afterPractice(run, grade));

    const duration = Math.min(durationMs, MAX_DURATION_MS);
    const result = await rateCard(current.word.id, grade, duration, reviewMode(direction)).catch((error) => {
      devError("ReviewSession: rateCard threw.", error);
      return { ok: false } as const;
    });
    if (!result.ok) {
      // The same card comes back: nothing advances without a saved answer.
      setError("Couldn't save. Try again.");
      return null;
    }
    timing.current.total += duration;
    timing.current.count += 1;
    const msPerCard = timing.current.total / timing.current.count || DEFAULT_MS_PER_CARD;
    return () => advance(afterRating(run, grade, result.card, Date.now(), msPerCard));
  }

  function startRound(next: Run, practice: boolean) {
    setRun(next);
    setPracticeRound(practice);
    setRound((r) => r + 1);
    setError(null);
    setMore(null);
    startedAt.current = Date.now();
  }

  const stillLearningCards = cards.filter((item) => run.firstAnswers.get(item.word.id) === Rating.Again);

  if (done) {
    return (
      <DoneScreen
        title="Session done!"
        stats={[
          { label: "Cards reviewed", value: String(stats.reviewed) },
          { label: "Time spent", value: formatSpent(spentMs) },
          { label: "Got it", value: String(stats.gotIt) },
          { label: "Still learning", value: String(stats.stillLearning) },
        ]}
      >
        <Button asChild>
          <Link href="/training">Back to Training</Link>
        </Button>
        {stillLearningCards.length > 0 && (
          <Button variant="secondary" onClick={() => startRound(startPractice(stillLearningCards), true)}>
            Practice {stillLearningCards.length} again
          </Button>
        )}
        {more && more.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              setCards(interleave(more));
              timing.current = { total: 0, count: 0 };
              startRound(startRun(more), false);
            }}
          >
            Keep going
          </Button>
        )}
      </DoneScreen>
    );
  }

  return (
    <SessionFrame>
      <SessionHeader
        finished={run.finished.size}
        total={run.total}
        gotIt={stats.gotIt}
        stillLearning={stats.stillLearning}
        direction={direction}
        onDirection={setDirection}
        onReset={() => startRound(startPractice(cards), true)}
        practiceRound={practiceRound}
      />
      <main className="flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        <CardStage
          key={round}
          item={current}
          remaining={run.queue.length}
          direction={direction}
          onAnswer={answer}
        />
        {error && (
          <p role="alert" className="mt-3 text-center font-body text-body font-medium text-again-ink">
            {error}
          </p>
        )}
      </main>
    </SessionFrame>
  );
}
