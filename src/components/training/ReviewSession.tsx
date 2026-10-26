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
  reshowCard,
  runStats,
  startPractice,
  startRun,
  type QueueItem,
  type Run,
} from "@/lib/training/queue";
import { quizReviewMode, reviewShowing } from "@/lib/training/quiz";
import type { ReviewBatch } from "@/lib/training/server";

import { CardStage } from "./FlashCard";
import { useDirection } from "./hooks";
import { QuizStage } from "./QuizStage";
import { DoneScreen, formatSpent, SessionFrame, SessionHeader } from "./SessionParts";

const MAX_DURATION_MS = 60_000;
// Starting guess for how long a card takes, until the session has its own.
const DEFAULT_MS_PER_CARD = 15_000;

/**
 * Today's review: the scheduled queue, every answer saved with rateCard
 * (Still learning or a wrong pick = Again, Got it or a right pick = Good).
 * A card past New is a quiz question about half the time (picked on the
 * server for the first showing, again each time it comes back). Reset, and
 * Practice again on the done screen, replay cards as a practice round that
 * saves nothing.
 */
export function ReviewSession({ initialBatch }: { initialBatch: ReviewBatch }) {
  const [direction, setDirection] = useDirection("review", null);
  const [bank, setBank] = useState(initialBatch.bank);
  // The session's card list in session order, for Reset.
  const [cards, setCards] = useState(() => interleave(initialBatch.items));
  const [run, setRun] = useState(() => startRun(initialBatch.items));
  const [practiceRound, setPracticeRound] = useState(false);
  // Remounts the stage on Reset and new rounds.
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [spentMs, setSpentMs] = useState(0);
  const [more, setMore] = useState<ReviewBatch | null>(null);

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
      .then((batch) => {
        if (!cancelled) setMore(batch);
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

  /** A card coming back, shown afresh: a quiz question or a flashcard. */
  function reshow(item: QueueItem): QueueItem {
    return { ...item, quiz: reviewShowing(item.isNew, bank[item.word.id]) };
  }

  async function answer(gotIt: boolean, durationMs: number) {
    const grade = gotIt ? Rating.Good : Rating.Again;
    const id = current.word.id;
    setError(null);
    if (practiceRound) return () => advance(reshowCard(afterPractice(run, grade), id, reshow));

    const duration = Math.min(durationMs, MAX_DURATION_MS);
    const mode = current.quiz ? quizReviewMode(current.quiz.format) : reviewMode(direction);
    const result = await rateCard(id, grade, duration, mode).catch((error) => {
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
    return () => advance(reshowCard(afterRating(run, grade, result.card, Date.now(), msPerCard), id, reshow));
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
          <Button variant="secondary" onClick={() => startRound(startPractice(stillLearningCards.map(reshow)), true)}>
            Practice {stillLearningCards.length} again
          </Button>
        )}
        {more && more.items.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              setBank(more.bank);
              setCards(interleave(more.items));
              timing.current = { total: 0, count: 0 };
              startRound(startRun(more.items), false);
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
        onReset={() => startRound(startPractice(cards.map(reshow)), true)}
        practiceRound={practiceRound}
      />
      <main className="flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        {current.quiz ? (
          <QuizStage
            key={round}
            word={current.word}
            quiz={current.quiz}
            remaining={run.queue.length}
            onAnswer={answer}
          />
        ) : (
          <CardStage
            key={round}
            item={current}
            remaining={run.queue.length}
            direction={direction}
            onAnswer={answer}
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-center font-body text-body font-medium text-again-ink">
            {error}
          </p>
        )}
      </main>
    </SessionFrame>
  );
}
