"use client";

import { RefreshCw, Shuffle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { DIRECTION_LABELS, type Direction } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";

import { baoImage } from "./bao";
import { MISSING_GLOSS } from "./FlashCard";
import { useReducedMotion } from "./hooks";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
const PILL = "inline-flex items-center rounded-pill px-2.5 py-0.5 font-body text-[13px] font-medium leading-5";
const ICON_BUTTON = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`;

/** Session page frame. overflow-x-clip keeps a thrown card from widening
 *  the page. */
export function SessionFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-clip">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 sm:px-6">{children}</div>
    </div>
  );
}

/** Two or more pressed-or-not buttons in a pill. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-pill bg-highlight p-1">
      {options.map(({ id, label: text }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`h-9 rounded-pill px-3.5 font-body text-body font-medium transition-colors ${FOCUS_RING} ${
            value === id ? "bg-surface-raised text-bark shadow-float" : "text-bark-muted hover:text-bark"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

const DIRECTIONS = (["hanzi", "meaning"] as const).map((id) => ({ id, label: DIRECTION_LABELS[id] }));

export function DirectionToggle({ value, onChange }: { value: Direction; onChange: (next: Direction) => void }) {
  return <SegmentedControl label="Card direction" options={DIRECTIONS} value={value} onChange={onChange} />;
}

/** Shuffle on or off, with its tooltip. The tooltip is for sighted mouse
 *  and keyboard users; screen readers get the label and aria-pressed. */
function ShuffleToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <span className="group relative">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label="Shuffle"
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${FOCUS_RING} ${
          on ? "bg-highlight text-rust-dark" : "text-bark-muted hover:bg-highlight/60 hover:text-bark"
        }`}
      >
        <Shuffle size={20} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-md bg-bark px-2 py-1 font-body text-[13px] font-medium leading-5 text-background group-hover:block group-has-[:focus-visible]:block"
      >
        {on ? "Shuffle on" : "Shuffle off"}
      </span>
    </span>
  );
}

/** Close, progress, counter, Shuffle (practice only) and Reset; then the
 *  direction toggle (flashcards), or another `control`, and the
 *  first-answer pills. */
export function SessionHeader({
  finished,
  total,
  gotIt,
  stillLearning,
  direction,
  onDirection,
  onReset,
  shuffle,
  control,
  practiceRound = false,
}: {
  finished: number;
  total: number;
  gotIt: number;
  stillLearning: number;
  direction?: Direction;
  onDirection?: (next: Direction) => void;
  onReset: () => void;
  shuffle?: { on: boolean; onToggle: () => void };
  /** In place of the direction toggle. */
  control?: ReactNode;
  practiceRound?: boolean;
}) {
  return (
    <header className="flex flex-col gap-3 pb-4 pt-[calc(12px+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <Link href="/training" aria-label="End session" className={`-ml-2 ${ICON_BUTTON}`}>
          <X size={24} aria-hidden="true" />
        </Link>
        <div
          role="progressbar"
          aria-label="Cards finished"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={finished}
          className="h-2.5 flex-1 overflow-hidden rounded-pill bg-highlight"
        >
          <div
            className="h-full rounded-pill bg-deep-grass transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${total ? (finished / total) * 100 : 0}%` }}
          />
        </div>
        <p className="shrink-0 font-body text-body font-medium tabular-nums text-bark">
          {finished} / {total}
        </p>
        <div className="-mr-2 flex items-center gap-1">
          {shuffle && <ShuffleToggle on={shuffle.on} onToggle={shuffle.onToggle} />}
          <button type="button" onClick={onReset} aria-label="Start over from the first card" className={ICON_BUTTON}>
            <RefreshCw size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {control ?? (direction && onDirection ? <DirectionToggle value={direction} onChange={onDirection} /> : <span />)}
        <p className="flex flex-wrap items-center gap-2">
          {practiceRound && <span className={`${PILL} bg-highlight text-bark`}>Practice round · not saved</span>}
          <span className={`${PILL} bg-good-tint text-good-ink`}>{gotIt} got it</span>
          <span className={`${PILL} bg-learning-tint text-learning-ink`}>{stillLearning} still learning</span>
        </p>
      </div>
    </header>
  );
}

export function formatSpent(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.round(seconds / 60)} min`;
}

/** The Shuffled / In order toast over the top of the stage. The live
 *  region is always there, so each new message is announced. */
export function Toast({ toast }: { toast: { text: string; n: number } | null }) {
  return (
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
  );
}

/** Bao, the heading (focused on arrival), the stats, any details and the
 *  buttons. */
export function DoneScreen({
  title,
  stats,
  pose = "cheering",
  details,
  children,
}: {
  title: string;
  stats: { label: string; value: string }[];
  pose?: "cheering" | "ready";
  details?: ReactNode;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bao = baoImage(pose);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-10 text-center">
      <Image
        src={bao.src}
        alt=""
        width={bao.width}
        height={bao.height}
        sizes="160px"
        priority
        className={`h-36 w-auto select-none sm:h-44 ${reducedMotion || pose !== "cheering" ? "" : "bao-react"}`}
      />
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-display font-bold text-bark outline-none">
        {title}
      </h1>
      {stats.length > 0 && (
        <dl className="grid w-full grid-cols-2 gap-3">
          {stats.map(({ label, value }) => (
            <div key={label} className="rounded-lg border-[1.5px] border-line bg-surface-raised px-3 py-4">
              <dt className="font-body text-body text-bark-muted">{label}</dt>
              <dd className="font-heading text-h1 font-bold text-bark">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {details}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">{children}</div>
    </main>
  );
}

/** The done screen's list of words missed at least once. */
export function MissedWords({ items, audio = false }: { items: QueueItem[]; audio?: boolean }) {
  return (
    <section aria-labelledby="missed-title" className="w-full text-left">
      <h2 id="missed-title" className="font-heading text-h3 font-bold text-bark">
        Missed at least once
      </h2>
      <ul className="mt-2 divide-y-[1.5px] divide-line rounded-lg border-[1.5px] border-line bg-surface-raised">
        {items.map(({ word }) => (
          <li key={word.id} className="flex items-center gap-2 px-3 py-2">
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span lang="zh-CN" className="shrink-0 font-hanzi text-[20px] font-medium leading-7 text-bark">
                {word.simplified}
              </span>
              <span className="shrink-0 font-body text-body font-medium text-rust-dark">{word.pinyin}</span>
              <span className="min-w-40 flex-1 font-body text-body wrap-break-word text-bark">
                {word.gloss ?? MISSING_GLOSS}
              </span>
            </span>
            {/* Listening: hear each missed word again. */}
            {audio && <AudioButton text={word.simplified} size="sm" />}
          </li>
        ))}
      </ul>
    </section>
  );
}
