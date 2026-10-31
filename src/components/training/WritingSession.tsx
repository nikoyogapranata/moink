"use client";

import Link from "next/link";
import { useState } from "react";
import { Rating } from "ts-fsrs";

import { useHskStandard } from "@/components/app/HskStandard";
import { Button } from "@/components/ui/Button";
import { inGridOrder, shuffle } from "@/lib/training/deck";
import {
  afterRetryPractice,
  reorderUnanswered,
  runProgress,
  runStats,
  skipFront,
  startPractice,
  type QueueItem,
} from "@/lib/training/queue";
import { WRITING_STYLE_SHORT, type WritingStyle } from "@/lib/training/writing";

import { updateLastWriting } from "./deckStore";
import { useMarkPracticed, useToast } from "./hooks";
import { AddToTraining, DoneScreen, MissedWords, SegmentedControl, SessionFrame, SessionHeader, Toast, useAddToTraining } from "./SessionParts";
import { WritingStage } from "./WritingStage";

const STYLES = (["trace", "recall"] as const).map((id) => ({ id, label: WRITING_STYLE_SHORT[id] }));

/** A word's first showing: traced first when the style is Trace. */
function firstShowing(item: QueueItem): QueueItem {
  return { ...item, writing: { trace: true } };
}

/** A missed word coming back: Recall only. */
function recallOnly(item: QueueItem): QueueItem {
  return { ...item, writing: { trace: false } };
}

/**
 * A writing set from the builder. Nothing here is saved. Each word is
 * traced and then recalled (style Trace) or recalled only (style Recall);
 * the top bar switches the style from the next word. A Still learning
 * word comes back about 3 words later, recall only; a word is finished
 * once it's Got it. Shuffle works as in flashcards practice.
 */
export function WritingSession({
  items,
  initialStyle,
  shuffled,
}: {
  /** In deck order: shuffled, or in grid order. */
  items: QueueItem[];
  initialStyle: WritingStyle;
  shuffled: boolean;
}) {
  const standard = useHskStandard();
  const [run, setRun] = useState(() => startPractice(items.map(firstShowing)));
  const [round, setRound] = useState(0);
  // Each word written gets a fresh stage.
  const [written, setWritten] = useState(0);
  const [style, setStyle] = useState(initialStyle);
  const [shuffleOn, setShuffleOn] = useState(shuffled);
  const [toast, showToast] = useToast();
  const markPracticed = useMarkPracticed();
  const training = useAddToTraining(items);

  const current = run.queue[0];
  const stats = runStats(run);

  function restart(cards: QueueItem[]) {
    setRun(startPractice((shuffleOn ? shuffle(cards) : inGridOrder(cards, standard)).map(firstShowing)));
    setRound((r) => r + 1);
  }

  function toggleShuffle() {
    const next = !shuffleOn;
    setShuffleOn(next);
    setRun((r) => reorderUnanswered(r, next ? shuffle : (items) => inGridOrder(items, standard)));
    updateLastWriting({ shuffle: next });
    showToast(next ? "Shuffled" : "In order");
  }

  function chooseStyle(next: WritingStyle) {
    if (next === style) return;
    setStyle(next);
    updateLastWriting({ style: next });
    showToast(next === "trace" ? "Trace first from the next word" : "Recall only from the next word");
  }

  // Applied to the latest run, so a toggle while the result shows isn't
  // lost.
  async function answer(gotIt: boolean) {
    markPracticed();
    return () => {
      setRun((r) => afterRetryPractice(r, gotIt ? Rating.Good : Rating.Again, recallOnly(r.queue[0])));
      setWritten((n) => n + 1);
    };
  }

  if (!current) {
    const missed = items.filter((item) => run.firstAnswers.get(item.word.id) === Rating.Again);
    return (
      <DoneScreen
        title="Set done!"
        stats={[
          { label: "Words written", value: String(run.total) },
          { label: "Got it first try", value: `${stats.gotIt} of ${run.total}` },
        ]}
        details={missed.length > 0 && <MissedWords items={missed} />}
      >
        {missed.length > 0 && <Button onClick={() => restart(missed)}>Write missed words again</Button>}
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
        progress={runProgress(run)}
        gotIt={stats.gotIt}
        stillLearning={stats.stillLearning}
        onReset={() => restart(items)}
        shuffle={{ on: shuffleOn, onToggle: toggleShuffle }}
        notSaved="practice"
        control={<SegmentedControl label="Writing style" options={STYLES} value={style} onChange={chooseStyle} />}
      />
      <main className="relative flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Toast toast={toast} />
        <WritingStage
          key={`${round}:${written}`}
          word={current.word}
          trace={style === "trace" && (current.writing?.trace ?? true)}
          onAnswer={answer}
          onSkip={() => {
            setRun((r) => skipFront(r));
            setWritten((n) => n + 1);
          }}
        />
      </main>
    </SessionFrame>
  );
}
