"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rating } from "ts-fsrs";

import { Button } from "@/components/ui/Button";
import { byGridOrder, shuffle, type Direction } from "@/lib/training/deck";
import { afterPractice, reorderUnanswered, runStats, startPractice, type QueueItem } from "@/lib/training/queue";

import { saveLastDeckShuffle } from "./deckStore";
import { CardStage } from "./FlashCard";
import { useDirection } from "./hooks";
import { DoneScreen, SessionFrame, SessionHeader } from "./SessionParts";

/** How long the Shuffled / In order toast stays up. */
const TOAST_MS = 1600;

function inGridOrder(items: QueueItem[]) {
  return [...items].sort((a, b) => byGridOrder(a.word, b.word));
}

/**
 * A built deck. Nothing here is saved: Still learning cards go to the end
 * of the round. Reset starts the whole deck over, and Practice again runs
 * its Still learning cards; both shuffle when Shuffle is on and use grid
 * order when it's off. Toggling Shuffle reorders only the cards not
 * answered yet, behind the current one, and is remembered for the builder.
 */
export function PracticeSession({
  items,
  shuffled,
  initialDirection,
}: {
  /** In deck order: already shuffled, or in grid order. */
  items: QueueItem[];
  /** Shuffle's starting state, from the builder. */
  shuffled: boolean;
  initialDirection: Direction | null;
}) {
  const [direction, setDirection] = useDirection("practice", initialDirection);
  const [run, setRun] = useState(() => startPractice(items));
  const [round, setRound] = useState(0);
  const [shuffleOn, setShuffleOn] = useState(shuffled);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const current = run.queue[0];
  const stats = runStats(run);

  function restart(cards: QueueItem[]) {
    setRun(startPractice(shuffleOn ? shuffle(cards) : inGridOrder(cards)));
    setRound((r) => r + 1);
  }

  function toggleShuffle() {
    const next = !shuffleOn;
    setShuffleOn(next);
    setRun((r) => reorderUnanswered(r, next ? shuffle : inGridOrder));
    saveLastDeckShuffle(next);
    window.clearTimeout(toastTimer.current);
    setToast((t) => ({ text: next ? "Shuffled" : "In order", n: (t?.n ?? 0) + 1 }));
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }

  // Applied to the latest run, so a toggle during the throw isn't lost.
  async function answer(gotIt: boolean) {
    return () => setRun((r) => afterPractice(r, gotIt ? Rating.Good : Rating.Again));
  }

  if (!current) {
    const stillLearningCards = items.filter((item) => run.firstAnswers.get(item.word.id) === Rating.Again);
    const any = stillLearningCards.length > 0;
    return (
      <DoneScreen
        title="Deck done!"
        stats={[
          { label: "Got it", value: String(stats.gotIt) },
          { label: "Still learning", value: String(stats.stillLearning) },
        ]}
      >
        {any && <Button onClick={() => restart(stillLearningCards)}>Practice {stillLearningCards.length} again</Button>}
        <Button variant={any ? "secondary" : "primary"} onClick={() => restart(items)}>
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
        direction={direction}
        onDirection={setDirection}
        onReset={() => restart(items)}
        shuffle={{ on: shuffleOn, onToggle: toggleShuffle }}
      />
      <main className="relative flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
        <p aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
          {toast && (
            <span
              key={toast.n}
              className="toast-pop rounded-pill bg-bark px-3.5 py-1.5 font-body text-body font-medium text-background shadow-float"
            >
              {toast.text}
            </span>
          )}
        </p>
        <CardStage
          key={round}
          item={current}
          remaining={run.queue.length}
          direction={direction}
          onAnswer={answer}
        />
      </main>
    </SessionFrame>
  );
}
