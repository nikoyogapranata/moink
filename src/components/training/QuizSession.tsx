"use client";

import Link from "next/link";
import { useState } from "react";
import { Rating } from "ts-fsrs";

import { Button } from "@/components/ui/Button";
import { inGridOrder, shuffle } from "@/lib/training/deck";
import {
  afterQuizPractice,
  reorderUnanswered,
  runStats,
  startPractice,
  type QueueItem,
} from "@/lib/training/queue";
import { pickShowing, type QuizBank, type QuizFormat } from "@/lib/training/quiz";

import { saveLastQuizShuffle } from "./deckStore";
import { MISSING_GLOSS } from "./FlashCard";
import { useToast } from "./hooks";
import { QuizStage } from "./QuizStage";
import { DoneScreen, SessionFrame, SessionHeader, Toast } from "./SessionParts";

/**
 * A built quiz: one question per word, each in a random format among
 * `formats`. Nothing here is saved. A miss brings the word back about 3
 * questions later as a new question; a word is finished once it's
 * answered right. Shuffle works as in flashcards practice.
 */
export function QuizSession({
  items,
  bank,
  formats,
  shuffled,
}: {
  /** In deck order (shuffled, or in grid order), each with its first
   *  question. */
  items: QueueItem[];
  bank: QuizBank;
  formats: QuizFormat[];
  /** Shuffle's starting state, from the builder. */
  shuffled: boolean;
}) {
  const [run, setRun] = useState(() => startPractice(items));
  const [round, setRound] = useState(0);
  const [shuffleOn, setShuffleOn] = useState(shuffled);
  const [toast, showToast] = useToast();

  const current = run.queue[0];
  const stats = runStats(run);

  /** A word asked again: a new question, maybe in another format. */
  function reshow(item: QueueItem): QueueItem {
    return { ...item, quiz: pickShowing(bank[item.word.id], formats) };
  }

  function restart(cards: QueueItem[]) {
    setRun(startPractice((shuffleOn ? shuffle(cards) : inGridOrder(cards)).map(reshow)));
    setRound((r) => r + 1);
  }

  function toggleShuffle() {
    const next = !shuffleOn;
    setShuffleOn(next);
    setRun((r) => reorderUnanswered(r, next ? shuffle : inGridOrder));
    saveLastQuizShuffle(next);
    showToast(next ? "Shuffled" : "In order");
  }

  // Applied to the latest run, so a toggle while the result shows isn't
  // lost.
  async function answer(gotIt: boolean) {
    return () =>
      setRun((r) => afterQuizPractice(r, gotIt ? Rating.Good : Rating.Again, reshow(r.queue[0])));
  }

  if (!current?.quiz) {
    const missed = items.filter((item) => run.firstAnswers.get(item.word.id) === Rating.Again);
    const accuracy = run.total ? Math.round((stats.gotIt / run.total) * 100) : 0;
    return (
      <DoneScreen
        title="Quiz done!"
        stats={[
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Right first try", value: `${stats.gotIt} of ${run.total}` },
        ]}
        details={missed.length > 0 && <MissedWords items={missed} />}
      >
        {missed.length > 0 && <Button onClick={() => restart(missed)}>Quiz missed words</Button>}
        <Button variant={missed.length > 0 ? "secondary" : "primary"} onClick={() => restart(items)}>
          Start over
        </Button>
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
      />
      <main className="relative flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Toast toast={toast} />
        <QuizStage
          key={round}
          word={current.word}
          quiz={current.quiz}
          remaining={run.queue.length}
          onAnswer={answer}
        />
      </main>
    </SessionFrame>
  );
}

function MissedWords({ items }: { items: QueueItem[] }) {
  return (
    <section aria-labelledby="missed-title" className="w-full text-left">
      <h2 id="missed-title" className="font-heading text-h3 font-bold text-bark">
        Missed at least once
      </h2>
      <ul className="mt-2 divide-y-[1.5px] divide-line rounded-lg border-[1.5px] border-line bg-surface-raised">
        {items.map(({ word }) => (
          <li key={word.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
            <span lang="zh-CN" className="shrink-0 font-hanzi text-[20px] font-medium leading-7 text-bark">
              {word.simplified}
            </span>
            <span className="shrink-0 font-body text-body font-medium text-rust-dark">{word.pinyin}</span>
            <span className="min-w-40 flex-1 font-body text-body wrap-break-word text-bark">
              {word.gloss ?? MISSING_GLOSS}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
