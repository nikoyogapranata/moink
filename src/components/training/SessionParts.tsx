"use client";

import { Check, RefreshCw, Shuffle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { Button } from "@/components/ui/Button";
import { devError } from "@/lib/dev";
import { addToTraining, fetchUntrainedIds } from "@/lib/training/actions";
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

/** Close, progress (cards answered at least once, see runProgress), the
 *  counter and the cards coming back, Shuffle (practice only) and Reset;
 *  then the direction toggle (flashcards), or another `control`, the
 *  not-saved pill and the first-answer pills. With `confirmReset`, Reset
 *  asks first (Today's review, where it turns the rest into practice). */
export function SessionHeader({
  progress,
  gotIt,
  stillLearning,
  direction,
  onDirection,
  onReset,
  confirmReset = false,
  shuffle,
  control,
  notSaved,
}: {
  progress: { answered: number; total: number; comingBack: number };
  gotIt: number;
  stillLearning: number;
  direction?: Direction;
  onDirection?: (next: Direction) => void;
  onReset: () => void;
  confirmReset?: boolean;
  shuffle?: { on: boolean; onToggle: () => void };
  /** In place of the direction toggle. */
  control?: ReactNode;
  /** "practice" for a built deck, "round" for a practice round after
   *  Today's review: neither saves anything. */
  notSaved?: "practice" | "round";
}) {
  const { answered, total, comingBack } = progress;
  const [confirming, setConfirming] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  return (
    <header className="flex flex-col gap-3 pb-4 pt-[calc(12px+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <Link href="/training" aria-label="End session" className={`-ml-2 ${ICON_BUTTON}`}>
          <X size={24} aria-hidden="true" />
        </Link>
        <div
          role="progressbar"
          aria-label="Cards answered"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          className="h-2.5 min-w-12 flex-1 overflow-hidden rounded-pill bg-highlight"
        >
          <div
            className="h-full rounded-pill bg-deep-grass transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
          />
        </div>
        <p className="flex shrink-0 items-center gap-2 font-body text-body font-medium tabular-nums text-bark">
          {answered} / {total}
          {comingBack > 0 && (
            <span className={`${PILL} bg-learning-tint text-learning-ink`}>{comingBack} coming back</span>
          )}
        </p>
        <div className="-mr-2 flex items-center gap-1">
          {shuffle && <ShuffleToggle on={shuffle.on} onToggle={shuffle.onToggle} />}
          <button
            ref={resetRef}
            type="button"
            onClick={confirmReset ? () => setConfirming(true) : onReset}
            aria-label="Start over from the first card"
            aria-haspopup={confirmReset ? "dialog" : undefined}
            className={ICON_BUTTON}
          >
            <RefreshCw size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {control ?? (direction && onDirection ? <DirectionToggle value={direction} onChange={onDirection} /> : <span />)}
        <p className="flex flex-wrap items-center gap-2">
          {notSaved && (
            <span className={`${PILL} bg-highlight text-bark`}>
              {notSaved === "round" ? "Practice round · not saved" : "Practice · not saved"}
            </span>
          )}
          <span className={`${PILL} bg-good-tint text-good-ink`}>{gotIt} got it</span>
          <span className={`${PILL} bg-learning-tint text-learning-ink`}>{stillLearning} still learning</span>
        </p>
      </div>
      {confirming && (
        <ResetConfirm
          onConfirm={onReset}
          onClose={() => {
            setConfirming(false);
            resetRef.current?.focus();
          }}
        />
      )}
    </header>
  );
}

/** Today's review asks before Reset: a small native modal dialog. Cancel
 *  and Escape close it; mounted while open. */
function ResetConfirm({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const confirmed = useRef(false);

  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onCloseRef.current = onClose;
    onConfirmRef.current = onConfirm;
  });

  // As in DeckBuilder: open on mount, never close() in the cleanup. Focus
  // starts on Cancel, the safe choice.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      devError("ResetConfirm: the dialog ref is null on mount, so it can't open.");
      return;
    }
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch (error) {
        devError("ResetConfirm: dialog.showModal() threw.", error);
      }
    }
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={(e) => {
        // A close event that lands while the dialog is open again is stale.
        if (e.currentTarget.open) return;
        onCloseRef.current();
        if (confirmed.current) onConfirmRef.current();
      }}
      className="m-auto hidden w-[calc(100%-32px)] max-w-100 open:animate-[fade-in_150ms_ease-out] flex-col gap-4 rounded-[22px] border-[1.5px] border-line bg-surface-raised p-5 text-bark open:flex backdrop:bg-black/50"
    >
      <h2 id={titleId} className="font-heading text-h2 font-bold text-bark">
        Restart as practice?
      </h2>
      <p className="font-body text-body text-bark-muted">
        Answers you&apos;ve already given stay saved. The replay won&apos;t be saved.
      </p>
      <div className="flex flex-row-reverse flex-wrap gap-3">
        <Button
          onClick={() => {
            confirmed.current = true;
            dialogRef.current?.close();
          }}
        >
          Restart as practice
        </Button>
        <Button ref={cancelRef} variant="secondary" onClick={() => dialogRef.current?.close()}>
          Cancel
        </Button>
      </div>
    </dialog>
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

type AddState = { missing: number[] | null; status: "idle" | "adding" | "added" | "error" };

/**
 * Which of a practice deck's words aren't in the user's training yet,
 * looked up when the session starts so the done screen has it at once,
 * and `add` to put them in as New recognition cards (addToTraining).
 * Nothing to add when the lookup fails: the button just doesn't show.
 */
export function useAddToTraining(items: QueueItem[]) {
  const [state, setState] = useState<AddState>({ missing: null, status: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetchUntrainedIds(items.map((item) => item.word.id))
      .catch((error) => {
        devError("useAddToTraining: fetchUntrainedIds threw.", error);
        return null;
      })
      .then((missing) => {
        if (cancelled) return;
        if (!missing) devError("useAddToTraining: couldn't check which words are in training; see the server log.");
        setState({ missing, status: "idle" });
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function add() {
    if (!state.missing?.length || state.status === "adding") return;
    setState((s) => ({ ...s, status: "adding" }));
    const result = await addToTraining(state.missing).catch((error) => {
      devError("useAddToTraining: addToTraining threw.", error);
      return { ok: false };
    });
    setState((s) => ({ ...s, status: result.ok ? "added" : "error" }));
  }

  return { ...state, add };
}

/** The done screen's "Add {n} new words to your training", then "Added".
 *  Nothing when every word is in training already. */
export function AddToTraining({ training }: { training: ReturnType<typeof useAddToTraining> }) {
  const { missing, status, add } = training;
  if (status === "added") {
    return (
      <p
        role="status"
        className="inline-flex h-11 items-center justify-center gap-1.5 px-2 font-body text-body font-medium text-deep-grass"
      >
        <Check size={18} aria-hidden="true" />
        Added
      </p>
    );
  }
  if (!missing?.length) return null;
  return (
    <>
      <Button variant="secondary" onClick={add} disabled={status === "adding"}>
        Add {missing.length} new {missing.length === 1 ? "word" : "words"} to your training
      </Button>
      {status === "error" && (
        <p role="alert" className="w-full font-body text-body text-again-ink sm:order-last">
          Couldn&apos;t add them. Try again.
        </p>
      )}
    </>
  );
}
