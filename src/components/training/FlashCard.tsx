"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type Ref } from "react";

import { levelLabel, wordLevel } from "@/lib/hsk";
import { useHskStandard } from "@/components/app/HskStandard";
import { AudioButton } from "@/components/dictionary/AudioButton";
import { devError } from "@/lib/dev";
import type { Direction } from "@/lib/training/deck";
import type { QueueItem, QueueWord } from "@/lib/training/queue";

import { useReducedMotion } from "./hooks";

export const PILL = "inline-flex items-center rounded-pill px-2.5 py-0.5 font-body text-[13px] font-medium leading-5";
export const HINT = "hidden text-center font-body text-[13px] leading-5 text-bark-muted lg:block";
export const SURFACE = "rounded-[22px] border-[1.5px] border-line bg-surface-raised";
const CARD_HEIGHT = "h-[clamp(300px,50dvh,440px)]";

/** Throw and rise, and the input lock around them. Matches globals.css. */
export const TRANSITION_MS = 380;
export const REDUCED_TRANSITION_MS = 150;

export const MISSING_GLOSS = "No meaning saved yet";

/* Front hanzi: 124px for one character, 104px for two, 84px for three or
   more, each scaled down with the viewport on narrow phones. */
export function hanziSize(text: string) {
  const length = [...text].length;
  if (length <= 1) return "text-[length:clamp(84px,30vw,124px)]";
  if (length === 2) return "text-[length:clamp(64px,24vw,104px)]";
  return "text-[length:clamp(44px,16vw,84px)]";
}

function measureWords(word: QueueWord) {
  return word.classifiers?.length ? word.classifiers.join("、") : null;
}

/** What the back shows, as one line for screen readers. */
function backText(word: QueueWord, direction: Direction) {
  const parts = [word.simplified, word.pinyin];
  if (direction === "hanzi") parts.push(word.gloss ?? MISSING_GLOSS);
  const measure = measureWords(word);
  return `${parts.join(", ")}.${measure ? ` Measure word: ${measure}.` : ""}`;
}

function MeasureWord({ word }: { word: QueueWord }) {
  const measure = measureWords(word);
  if (!measure) return null;
  return (
    <p className="mt-2 font-body text-body text-bark">
      Measure word:{" "}
      <span lang="zh-CN" className="font-hanzi">
        {measure}
      </span>
    </p>
  );
}

/**
 * One flashcard. The whole card is a button that flips it; the faces are
 * drawn on top with pointer events off, so a click anywhere lands on the
 * button, except on the audio button, which takes its own clicks.
 */
export function FlashCard({
  ref,
  item,
  direction,
  flipped,
  onFlip,
}: {
  ref?: Ref<HTMLButtonElement>;
  item: QueueItem;
  direction: Direction;
  flipped: boolean;
  onFlip: () => void;
}) {
  const { word } = item;
  const standard = useHskStandard();
  const level = wordLevel(word, standard);
  const gloss = word.gloss ?? MISSING_GLOSS;
  const front = direction === "hanzi" ? word.simplified : gloss;
  const label = flipped
    ? `Back: ${backText(word, direction)} Press to flip.`
    : `Front: ${front}. Press to flip.`;
  const face = `fc-face flex flex-col p-5 ${SURFACE}`;

  return (
    <div className="fc-scene relative h-full w-full">
      <button
        ref={ref}
        type="button"
        onClick={onFlip}
        aria-label={label}
        className="absolute inset-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className={`fc-inner pointer-events-none ${flipped ? "is-flipped" : ""}`}>
        <div aria-hidden="true" inert={flipped} className={`fc-front ${face}`}>
          <div className="flex items-start justify-between gap-2">
            {item.isNew ? <span className={`${PILL} bg-good-tint text-good-ink`}>New</span> : <span />}
            {level !== null && <span className={`${PILL} bg-highlight text-bark`}>{levelLabel(level, standard)}</span>}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center text-center">
            {direction === "hanzi" ? (
              <p
                lang="zh-CN"
                className={`font-hanzi font-medium leading-[1.15] wrap-break-word text-bark ${hanziSize(word.simplified)}`}
              >
                {word.simplified}
              </p>
            ) : (
              <p className="max-w-full font-body text-[26px] font-medium leading-8.5 wrap-break-word text-bark">
                {gloss}
              </p>
            )}
          </div>
          <p className="text-center font-body text-[13px] leading-5 text-bark-muted">Tap to flip</p>
        </div>

        <div inert={!flipped} className={`fc-back ${face} items-center justify-center text-center`}>
          <p
            aria-hidden="true"
            lang="zh-CN"
            className={`font-hanzi font-medium wrap-break-word text-bark ${
              direction === "hanzi" ? "text-[44px] leading-14" : `leading-[1.15] ${hanziSize(word.simplified)}`
            }`}
          >
            {word.simplified}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <p aria-hidden="true" className="font-body text-h2 font-medium text-rust-dark">
              {word.pinyin}
            </p>
            {/* Its own clicks only: never flips the card. */}
            <span
              className={flipped ? "pointer-events-auto" : ""}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <AudioButton text={word.simplified} />
            </span>
          </div>
          {direction === "hanzi" && (
            <p aria-hidden="true" className="mt-2 font-heading text-h1 font-bold wrap-break-word text-bark">
              {gloss}
            </p>
          )}
          <div aria-hidden="true">
            <MeasureWord word={word} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The card on its stack with the answer buttons under it. Got it throws the
 * card right and Still learning left; once `onAnswer` settles and the
 * throw is over, its commit runs (the parent moves on) and the next card
 * rises from the stack, front side up. Input is ignored while either
 * transition runs. Remount it (a new key) to start over.
 */
export function CardStage({
  item,
  remaining,
  direction,
  onAnswer,
}: {
  item: QueueItem;
  /** Cards left in the run, this one included, for the stack. */
  remaining: number;
  direction: Direction;
  /** Resolves to a commit to run after the throw, or null to bring the
   *  same card back (a failed save). */
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
}) {
  const reducedMotion = useReducedMotion();
  const transitionMs = reducedMotion ? REDUCED_TRANSITION_MS : TRANSITION_MS;

  const [flipped, setFlipped] = useState(false);
  const [thrown, setThrown] = useState<"left" | "right" | null>(null);
  const [cardKey, setCardKey] = useState(0);
  // A new direction shows the same card, front side up.
  const [shownDirection, setShownDirection] = useState(direction);
  if (direction !== shownDirection) {
    setShownDirection(direction);
    setFlipped(false);
  }

  const locked = useRef(true);
  const mounted = useRef(false);
  const shownAt = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Each card rises in; it takes input once it's up. Keyboard focus moves
  // to it unless the user is somewhere else on the page.
  useEffect(() => {
    locked.current = true;
    shownAt.current = performance.now();
    const active = document.activeElement;
    if (!active || active === document.body || stageRef.current?.contains(active)) {
      cardRef.current?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(() => {
      locked.current = false;
    }, transitionMs);
    return () => window.clearTimeout(timer);
  }, [cardKey, transitionMs]);

  function flip() {
    if (!locked.current) setFlipped((f) => !f);
  }

  async function answer(gotIt: boolean) {
    if (locked.current) return;
    locked.current = true;
    setThrown(gotIt ? "right" : "left");
    const duration = performance.now() - shownAt.current;
    const [commit] = await Promise.all([
      onAnswer(gotIt, duration).catch((error) => {
        devError("CardStage: onAnswer threw; the same card comes back.", error);
        return null;
      }),
      new Promise((resolve) => window.setTimeout(resolve, transitionMs)),
    ]);
    if (!mounted.current) return;
    commit?.();
    setThrown(null);
    setFlipped(false);
    setCardKey((k) => k + 1);
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    if (e.key === "1" || e.key === "ArrowLeft") {
      e.preventDefault();
      void answer(false);
    } else if (e.key === "2" || e.key === "ArrowRight") {
      e.preventDefault();
      void answer(true);
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const shape = `absolute inset-x-0 top-0 origin-bottom ${CARD_HEIGHT} ${SURFACE}`;

  return (
    <div ref={stageRef} className="flex flex-1 flex-col justify-center gap-6">
      <div className="relative mx-auto w-full max-w-md pb-5">
        {remaining > 2 && <div aria-hidden="true" className={`${shape} translate-y-5 scale-90`} />}
        {remaining > 1 && <div aria-hidden="true" className={`${shape} translate-y-2.5 scale-95`} />}
        <div
          key={cardKey}
          className={`relative ${CARD_HEIGHT} ${thrown ? `card-throw-${thrown}` : "card-rise"}`}
        >
          <FlashCard ref={cardRef} item={item} direction={direction} flipped={flipped} onFlip={flip} />
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {flipped ? backText(item.word, direction) : ""}
      </p>

      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void answer(false)}
            aria-keyshortcuts="1 ArrowLeft"
            className="flex h-14 items-center justify-center gap-2 rounded-pill border-2 border-learning-line bg-surface-raised px-3 font-heading text-h3 font-bold text-learning-ink transition-colors hover:bg-learning-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RotateCcw size={20} aria-hidden="true" />
            Still learning
          </button>
          <button
            type="button"
            onClick={() => void answer(true)}
            aria-keyshortcuts="2 ArrowRight"
            className="flex h-14 items-center justify-center gap-2 rounded-pill bg-got-it px-3 font-heading text-h3 font-bold text-white transition-colors hover:bg-got-it-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Check size={20} aria-hidden="true" />
            Got it
          </button>
        </div>
        <p className={HINT}>1 or ← Still learning · 2 or → Got it</p>
      </div>
    </div>
  );
}
