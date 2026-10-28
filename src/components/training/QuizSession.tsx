"use client";

import Link from "next/link";
import { useState } from "react";
import { Rating } from "ts-fsrs";

import { Button } from "@/components/ui/Button";
import { inGridOrder, shuffle } from "@/lib/training/deck";
import {
  afterRetryPractice,
  reorderUnanswered,
  runStats,
  startPractice,
  type QueueItem,
} from "@/lib/training/queue";
import { pickShowing, showingFields, type QuestionFormat, type QuizBank } from "@/lib/training/quiz";

import { saveLastQuizShuffle, type QuestionKind } from "./deckStore";
import { useToast } from "./hooks";
import { ListenStage, QuizStage } from "./QuizStage";
import { AddToTraining, DoneScreen, MissedWords, SessionFrame, SessionHeader, Toast, useAddToTraining } from "./SessionParts";

const TEXT: Record<QuestionKind, { done: string; again: string }> = {
  quiz: { done: "Quiz done!", again: "Quiz missed words" },
  listening: { done: "Listening done!", again: "Listen to missed words again" },
};

/**
 * A built quiz or listening set: one question per word, each in a random
 * format among `formats`. Nothing here is saved. A miss brings the word
 * back about 3 questions later as a new question; a word is finished once
 * it's answered right. Shuffle works as in flashcards practice. Listening
 * waits for a tap on the first question, then plays each on its own.
 */
export function QuizSession({
  kind,
  items,
  bank,
  formats,
  shuffled,
}: {
  kind: QuestionKind;
  /** In deck order (shuffled, or in grid order), each with its first
   *  question. */
  items: QueueItem[];
  bank: QuizBank;
  formats: QuestionFormat[];
  /** Shuffle's starting state, from the builder. */
  shuffled: boolean;
}) {
  const [run, setRun] = useState(() => startPractice(items));
  const [round, setRound] = useState(0);
  const [shuffleOn, setShuffleOn] = useState(shuffled);
  const [toast, showToast] = useToast();
  const training = useAddToTraining(items);
  // Questions play on their own after the session's first tap.
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const current = run.queue[0];
  const stats = runStats(run);

  /** A word asked again: a new question, maybe in another format. */
  function reshow(item: QueueItem): QueueItem {
    return { ...item, ...showingFields(pickShowing(bank[item.word.id], formats)) };
  }

  function restart(cards: QueueItem[]) {
    setRun(startPractice((shuffleOn ? shuffle(cards) : inGridOrder(cards)).map(reshow)));
    setRound((r) => r + 1);
  }

  function toggleShuffle() {
    const next = !shuffleOn;
    setShuffleOn(next);
    setRun((r) => reorderUnanswered(r, next ? shuffle : inGridOrder));
    saveLastQuizShuffle(kind, next);
    showToast(next ? "Shuffled" : "In order");
  }

  // Applied to the latest run, so a toggle while the result shows isn't
  // lost.
  async function answer(gotIt: boolean) {
    return () =>
      setRun((r) => afterRetryPractice(r, gotIt ? Rating.Good : Rating.Again, reshow(r.queue[0])));
  }

  if (!current || (!current.quiz && !current.listen)) {
    const missed = items.filter((item) => run.firstAnswers.get(item.word.id) === Rating.Again);
    const accuracy = run.total ? Math.round((stats.gotIt / run.total) * 100) : 0;
    return (
      <DoneScreen
        title={TEXT[kind].done}
        stats={[
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Right first try", value: `${stats.gotIt} of ${run.total}` },
        ]}
        details={missed.length > 0 && <MissedWords items={missed} audio={kind === "listening"} />}
      >
        {missed.length > 0 && <Button onClick={() => restart(missed)}>{TEXT[kind].again}</Button>}
        <Button variant={missed.length > 0 ? "secondary" : "primary"} onClick={() => restart(items)}>
          Start over
        </Button>
        <AddToTraining training={training} />
        <Button variant="secondary" asChild>
          <Link href="/training">Back to Training</Link>
        </Button>
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
        onReset={() => restart(items)}
        shuffle={{ on: shuffleOn, onToggle: toggleShuffle }}
        notSaved="practice"
      />
      <main className="relative flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Toast toast={toast} />
        {current.listen ? (
          <ListenStage
            key={round}
            word={current.word}
            quiz={current.listen}
            remaining={run.queue.length}
            onAnswer={answer}
            audio={{ autoPlay: audioUnlocked, onPlayed: () => setAudioUnlocked(true) }}
          />
        ) : (
          <QuizStage
            key={round}
            word={current.word}
            quiz={current.quiz!}
            remaining={run.queue.length}
            onAnswer={answer}
          />
        )}
      </main>
    </SessionFrame>
  );
}
