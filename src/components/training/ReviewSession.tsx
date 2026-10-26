"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rating } from "ts-fsrs";

import { Button } from "@/components/ui/Button";
import { useChineseVoiceStatus } from "@/lib/dictionary/speech";
import { devError } from "@/lib/dev";
import { fetchQueue, rateCard } from "@/lib/training/actions";
import { reviewMode, type ReviewMode } from "@/lib/training/deck";
import {
  afterPractice,
  afterRating,
  interleave,
  reshowCard,
  runStats,
  skipFront,
  startPractice,
  startRun,
  type QueueItem,
  type Run,
} from "@/lib/training/queue";
import { questionReviewMode, reviewShowing, withoutListening } from "@/lib/training/quiz";
import type { ReviewBatch } from "@/lib/training/server";
import { WRITING_MODE } from "@/lib/training/writing";

import { CardStage } from "./FlashCard";
import { useDirection } from "./hooks";
import { ListenStage, QuizStage } from "./QuizStage";
import { DoneScreen, formatSpent, SessionFrame, SessionHeader } from "./SessionParts";
import { WritingStage } from "./WritingStage";

const MAX_DURATION_MS = 60_000;
// Starting guess for how long a card takes, until the session has its own.
const DEFAULT_MS_PER_CARD = 15_000;
const DEFAULT_MS_PER_WORD_WRITTEN = 40_000;

/** A writing card as it's first shown: Trace first when it's new. */
function firstWriting(item: QueueItem): QueueItem {
  return { ...item, writing: { trace: item.isNew } };
}

/** A writing card coming back (a learning step, or Again in a practice
 *  round): Recall only. */
function recallOnly(item: QueueItem): QueueItem {
  return { ...item, writing: { trace: false } };
}

/**
 * Today's review: the scheduled recognition queue, then the writing queue,
 * every answer saved with rateCard (Still learning or a wrong pick = Again,
 * Got it or a right pick = Good). A recognition card past New is a
 * flashcard, a quiz question or a listening question (REVIEW_MIX; picked on
 * the server for the first showing, again each time it comes back).
 * Without a Chinese voice, listening questions become flashcards or quiz
 * questions. A new writing card is traced
 * first (never saved) and then recalled; a due one is recalled only.
 * Reset, and Practice again on the done screen, replay both as a practice
 * round that saves nothing.
 */
export function ReviewSession({ initialBatch }: { initialBatch: ReviewBatch }) {
  const [direction, setDirection] = useDirection("review", null);
  const [bank, setBank] = useState(initialBatch.bank);
  // The session's card lists in session order, for Reset.
  const [cards, setCards] = useState(() => interleave(initialBatch.items));
  const [writingCards, setWritingCards] = useState(() => interleave(initialBatch.writing).map(firstWriting));
  const [run, setRun] = useState(() => startRun(initialBatch.items));
  const [writeRun, setWriteRun] = useState(() => startPractice(interleave(initialBatch.writing).map(firstWriting)));
  // Straight to writing when there are no recognition cards.
  const [writingStarted, setWritingStarted] = useState(initialBatch.items.length === 0);
  const [practiceRound, setPracticeRound] = useState(false);
  // Remounts the stage on Reset and new rounds.
  const [round, setRound] = useState(0);
  // Each word written gets a fresh writing stage.
  const [written, setWritten] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [spentMs, setSpentMs] = useState(0);
  const [more, setMore] = useState<ReviewBatch | null>(null);
  // Listening plays on its own after the session's first tap.
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const voice = useChineseVoiceStatus();

  const startedAt = useRef(0);
  const timing = useRef({ total: 0, count: 0 });
  const writeTiming = useRef({ total: 0, count: 0 });

  const writing = run.queue.length === 0;
  const active = writing ? writeRun : run;
  const front = active.queue[0];
  // How the front card shows: the server may have picked listening for a
  // browser with no Chinese voice.
  const current = front && voice === "none" ? withoutListening(front, bank[front.word.id]) : front;
  const done = !current;
  const interlude = writing && !done && !writingStarted;
  const recognitionStats = runStats(run);
  const writingStats = runStats(writeRun);

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

  function finishIfDone(nextRun: Run, nextWriteRun: Run) {
    if (nextRun.queue.length === 0 && nextWriteRun.queue.length === 0) setSpentMs(Date.now() - startedAt.current);
  }

  function advance(next: Run) {
    if (writing) {
      setWriteRun(next);
      setWritten((n) => n + 1);
      finishIfDone(run, next);
    } else {
      setRun(next);
      finishIfDone(next, writeRun);
    }
  }

  /** A recognition card coming back, shown afresh: a flashcard, a quiz
   *  question or (with a Chinese voice) a listening question. */
  function reshow(item: QueueItem): QueueItem {
    return { ...item, ...reviewShowing(item.isNew, bank[item.word.id], voice !== "none") };
  }

  async function answer(gotIt: boolean, durationMs: number) {
    const grade = gotIt ? Rating.Good : Rating.Again;
    const id = current.word.id;
    const comeBack = writing ? recallOnly : reshow;
    setError(null);
    if (practiceRound) return () => advance(reshowCard(afterPractice(active, grade), id, comeBack));

    const duration = Math.min(durationMs, MAX_DURATION_MS);
    const question = current.listen ?? current.quiz;
    const mode: ReviewMode = writing
      ? WRITING_MODE
      : question
        ? questionReviewMode(question.format)
        : reviewMode(direction);
    const result = await rateCard(id, grade, duration, mode).catch((error) => {
      devError("ReviewSession: rateCard threw.", error);
      return { ok: false } as const;
    });
    if (!result.ok) {
      // The same card comes back: nothing advances without a saved answer.
      setError("Couldn't save. Try again.");
      return null;
    }
    const t = writing ? writeTiming.current : timing.current;
    t.total += duration;
    t.count += 1;
    const msPerCard = t.total / t.count || (writing ? DEFAULT_MS_PER_WORD_WRITTEN : DEFAULT_MS_PER_CARD);
    return () => advance(reshowCard(afterRating(active, grade, result.card, Date.now(), msPerCard), id, comeBack));
  }

  function startRound(next: Run, nextWriting: Run, practice: boolean) {
    setRun(next);
    setWriteRun(nextWriting);
    setWritingStarted(next.queue.length === 0);
    setPracticeRound(practice);
    setRound((r) => r + 1);
    setError(null);
    setMore(null);
    startedAt.current = Date.now();
  }

  const stillLearning = (list: QueueItem[], r: Run) => list.filter((item) => r.firstAnswers.get(item.word.id) === Rating.Again);
  const stillLearningCards = stillLearning(cards, run);
  const stillLearningWriting = stillLearning(writingCards, writeRun);
  const againCount = stillLearningCards.length + stillLearningWriting.length;

  if (done) {
    return (
      <DoneScreen
        title="Session done!"
        stats={[
          { label: "Cards reviewed", value: String(recognitionStats.reviewed + writingStats.reviewed) },
          { label: "Time spent", value: formatSpent(spentMs) },
          { label: "Got it", value: String(recognitionStats.gotIt + writingStats.gotIt) },
          { label: "Still learning", value: String(recognitionStats.stillLearning + writingStats.stillLearning) },
        ]}
      >
        <Button asChild>
          <Link href="/training">Back to Training</Link>
        </Button>
        {againCount > 0 && (
          <Button
            variant="secondary"
            onClick={() =>
              startRound(startPractice(stillLearningCards.map(reshow)), startPractice(stillLearningWriting.map(firstWriting)), true)
            }
          >
            Practice {againCount} again
          </Button>
        )}
        {more && more.items.length + more.writing.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              const nextWriting = interleave(more.writing).map(firstWriting);
              setBank(more.bank);
              setCards(interleave(more.items));
              setWritingCards(nextWriting);
              timing.current = { total: 0, count: 0 };
              writeTiming.current = { total: 0, count: 0 };
              startRound(startRun(more.items), startPractice(nextWriting), false);
            }}
          >
            Keep going
          </Button>
        )}
      </DoneScreen>
    );
  }

  if (interlude) {
    const n = writeRun.queue.length;
    return (
      <DoneScreen title="Now let's write" stats={[]} pose="ready">
        <p className="w-full font-body text-body text-bark-muted">
          {n} {n === 1 ? "word" : "words"} to write. Trace the new ones first, then write each from memory.
        </p>
        <Button onClick={() => setWritingStarted(true)}>Start writing</Button>
        <Button variant="secondary" asChild>
          <Link href="/training">Finish for today</Link>
        </Button>
      </DoneScreen>
    );
  }

  const stats = writing ? writingStats : recognitionStats;
  return (
    <SessionFrame>
      <SessionHeader
        finished={active.finished.size}
        total={active.total}
        gotIt={stats.gotIt}
        stillLearning={stats.stillLearning}
        direction={writing ? undefined : direction}
        onDirection={writing ? undefined : setDirection}
        onReset={() =>
          startRound(startPractice(cards.map(reshow)), startPractice(writingCards.map(firstWriting)), true)
        }
        practiceRound={practiceRound}
      />
      <main className="flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        {writing ? (
          <WritingStage
            key={`${round}:${written}`}
            word={current.word}
            trace={current.writing?.trace ?? false}
            onAnswer={answer}
            onSkip={() => advance(skipFront(active))}
          />
        ) : current.listen ? (
          <ListenStage
            key={round}
            word={current.word}
            quiz={current.listen}
            remaining={run.queue.length}
            onAnswer={answer}
            audio={{ autoPlay: audioUnlocked, onPlayed: () => setAudioUnlocked(true) }}
          />
        ) : current.quiz ? (
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
