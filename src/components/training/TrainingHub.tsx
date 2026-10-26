"use client";

import { ArrowLeftRight, Layers, ListChecks, PenLine, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition, type ReactNode, type Ref } from "react";

import { PageHeader } from "@/components/app/PageHeader";
import { CARD } from "@/components/dictionary/SideCards";
import { Button } from "@/components/ui/Button";
import { setDailyNewWords, setDailyNewWriting } from "@/lib/training/actions";
import { DAILY_NEW_WORD_OPTIONS, DAILY_NEW_WRITING_OPTIONS } from "@/lib/training/daily";
import { DIRECTION_LABELS, type DeckSet, type Direction } from "@/lib/training/deck";

import { baoImage, type BaoPose } from "./bao";
import { DeckBuilder } from "./DeckBuilder";
import { practiceDeckHref, practiceQuizHref, practiceWritingHref, useLastDeck, useLastQuiz, useLastWriting } from "./deckStore";

const REVIEW_HREF = "/training/review";

// Rough time per card for the estimate on the review card.
const SECONDS_PER_DUE = 25;
const SECONDS_PER_NEW = 40;
const SECONDS_PER_WRITE = 60;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

function Bao({ pose, className }: { pose: BaoPose; className: string }) {
  const img = baoImage(pose);
  return (
    <Image
      src={img.src}
      alt=""
      width={img.width}
      height={img.height}
      sizes="160px"
      priority
      className={`w-auto shrink-0 select-none ${className}`}
    />
  );
}

/* Today's review */

function TodayCard({
  due,
  newCount,
  toWrite,
  newFromDictionary,
  dueTomorrow,
  dailyNewWords,
  nothingStarted,
  onChangeLimit,
}: {
  due: number;
  newCount: number;
  /** Writing cards in Today's review: due and new. */
  toWrite: number;
  newFromDictionary: number;
  dueTomorrow: number;
  dailyNewWords: number;
  nothingStarted: boolean;
  onChangeLimit: () => void;
}) {
  if (due === 0 && newCount === 0 && toWrite === 0) {
    const limitZero = nothingStarted && dailyNewWords === 0;
    return (
      <section aria-labelledby="today-title" className={`${CARD} flex items-center justify-between gap-4`}>
        <div className="min-w-0">
          <h2 id="today-title" className="font-heading text-h2 font-bold text-bark">
            {limitZero ? "No new words today" : "All done for today"}
          </h2>
          {limitZero ? (
            <p className="mt-1 font-body text-body text-bark">
              Your new-words limit is 0 a day, so there&apos;s nothing to learn yet.{" "}
              <button
                type="button"
                onClick={onChangeLimit}
                className={`rounded-sm font-medium text-rust-dark underline underline-offset-4 ${FOCUS_RING}`}
              >
                Change the limit
              </button>
            </p>
          ) : (
            <p className="mt-1 font-body text-body text-bark-muted">
              {dueTomorrow === 1 ? "1 card due tomorrow" : `${dueTomorrow} due tomorrow`}
            </p>
          )}
        </div>
        <Bao pose={limitZero ? "ready" : "happy"} className="h-24 sm:h-32" />
      </section>
    );
  }

  const minutes = Math.max(
    1,
    Math.round((due * SECONDS_PER_DUE + newCount * SECONDS_PER_NEW + toWrite * SECONDS_PER_WRITE) / 60),
  );

  return (
    <section aria-labelledby="today-title" className={`${CARD} flex items-end justify-between gap-4`}>
      <div className="min-w-0">
        <h2 id="today-title" className="font-heading text-h2 font-bold text-bark">
          Today&apos;s review
        </h2>
        <dl className="mt-3 flex gap-6 sm:gap-8">
          <div>
            <dt className="sr-only">Due</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-rust-dark">{due}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              due
            </dd>
          </div>
          <div>
            <dt className="sr-only">New</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-deep-grass">{newCount}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              new
            </dd>
          </div>
          <div>
            <dt className="sr-only">To write</dt>
            <dd className="font-heading text-[40px] font-bold leading-[44px] text-bamboo-gold-dark">{toWrite}</dd>
            <dd aria-hidden="true" className="font-body text-body text-bark-muted">
              to write
            </dd>
          </div>
        </dl>
        <Button asChild className="mt-4">
          <Link href={REVIEW_HREF}>Start review</Link>
        </Button>
        <p className="mt-3 font-body text-body text-bark-muted">
          About {minutes} min
          {newFromDictionary > 0 &&
            ` · ${newFromDictionary} of your new words ${newFromDictionary === 1 ? "is" : "are"} from the Dictionary`}
        </p>
      </div>
      <Bao pose="ready" className="h-28 sm:h-36" />
    </section>
  );
}

/* Practice by mode */

/* The mini card pair: 160x104, the cards 74x90 and overlapping by about
   4px, the swap badge at the bottom where they meet (below all card text). */
const MINI_CARD =
  "absolute flex h-[90px] w-[74px] flex-col items-center justify-center rounded-[12px] border-[1.5px] border-line px-1 text-center shadow-float transition-[translate,rotate] duration-350 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none";

const TILES: Record<Direction, { label: string; subtitle: ReactNode; front: ReactNode; back: ReactNode }> = {
  hanzi: {
    label: "Hanzi first: see the hanzi, recall the meaning",
    subtitle: (
      <>
        See{" "}
        <span lang="zh-CN" className="font-hanzi">
          学
        </span>
        , recall the meaning
      </>
    ),
    front: (
      <span lang="zh-CN" className="font-hanzi text-[38px] font-medium leading-none text-bark">
        学
      </span>
    ),
    back: (
      <>
        <span className="font-body text-[12px] font-medium leading-4 text-rust-dark">xué</span>
        <span className="font-body text-[12px] leading-4 text-bark">to study</span>
      </>
    ),
  },
  meaning: {
    label: "Meaning first: see the meaning, recall the hanzi",
    subtitle: (
      <>
        See &ldquo;to study&rdquo;, recall{" "}
        <span lang="zh-CN" className="font-hanzi">
          学
        </span>
      </>
    ),
    front: <span className="font-body text-[14px] font-medium leading-[18px] text-bark">to study</span>,
    back: (
      <>
        <span lang="zh-CN" className="font-hanzi text-[30px] font-medium leading-9 text-bark">
          学
        </span>
        <span className="font-body text-[12px] font-medium leading-4 text-rust-dark">xué</span>
      </>
    ),
  },
};

/** A direction option: two mini cards (they fan out on hover and focus)
 *  with an exchange badge between them, then the title and a line. */
function DirectionTile({
  ref,
  direction,
  onClick,
}: {
  ref: Ref<HTMLButtonElement>;
  direction: Direction;
  onClick: () => void;
}) {
  const tile = TILES[direction];
  return (
    <button
      ref={ref}
      type="button"
      aria-label={tile.label}
      aria-haspopup="dialog"
      onClick={onClick}
      className="group @container flex min-w-0 flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-line bg-background p-3.5 text-center transition-[border-color,background-color,scale] hover:border-rust hover:bg-rust/5 focus-visible:border-rust focus-visible:bg-rust/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 active:scale-[0.98] motion-reduce:transition-colors max-[360px]:flex-row max-[360px]:text-left"
    >
      {/* Zoomed to 70% (layout box included) when the tile is narrower
          than the pair, and in the stacked layout on the smallest phones. */}
      <span
        aria-hidden="true"
        className="relative block h-[104px] w-40 shrink-0 @max-[160px]:[zoom:0.7] max-[360px]:[zoom:0.7]"
      >
        <span
          className={`${MINI_CARD} left-[76px] top-1.5 rotate-[7deg] bg-highlight group-hover:translate-x-2 group-hover:rotate-10 group-focus-visible:translate-x-2 group-focus-visible:rotate-10`}
        >
          {tile.back}
        </span>
        <span
          className={`${MINI_CARD} left-1.5 top-0 -rotate-6 bg-surface-raised group-hover:-translate-x-2 group-hover:-rotate-9 group-focus-visible:-translate-x-2 group-focus-visible:-rotate-9`}
        >
          {tile.front}
        </span>
        <span className="absolute left-[66px] top-[81px] z-10 flex h-6 w-6 items-center justify-center rounded-full bg-rust text-white ring-2 ring-background transition-transform duration-350 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-180 group-focus-visible:rotate-180 motion-reduce:transition-none">
          <ArrowLeftRight size={14} strokeWidth={2.5} />
        </span>
      </span>
      <span aria-hidden="true" className="block min-w-0">
        <span className="block font-heading text-[18px] font-bold leading-6 text-bark">
          {DIRECTION_LABELS[direction]}
        </span>
        <span className="block font-body text-body-sm text-bark-muted">{tile.subtitle}</span>
      </span>
    </button>
  );
}

/**
 * Flashcards: two direction tiles, each opening the deck builder with that
 * direction, and a quick start for the last deck built.
 */
function FlashcardsCard({ defaultSet }: { defaultSet: DeckSet }) {
  const [open, setOpen] = useState<Direction | null>(null);
  const lastDeck = useLastDeck();
  const hanziRef = useRef<HTMLButtonElement>(null);
  const meaningRef = useRef<HTMLButtonElement>(null);

  function closeBuilder() {
    const opener = open === "meaning" ? meaningRef : hanziRef;
    setOpen(null);
    opener.current?.focus();
  }

  return (
    <section aria-labelledby="flashcards-title" className={`${CARD} flex flex-col gap-3 xl:col-span-2`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-highlight text-rust-dark">
        <Layers size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 id="flashcards-title" className="font-heading text-h3 font-bold text-bark">
          Flashcards
        </h3>
        <p className="font-body text-body text-bark-muted">Practice any set, as often as you like</p>
      </div>
      <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1">
        {(["hanzi", "meaning"] as const).map((direction) => (
          <DirectionTile
            key={direction}
            ref={direction === "hanzi" ? hanziRef : meaningRef}
            direction={direction}
            onClick={() => setOpen(direction)}
          />
        ))}
      </div>
      {lastDeck && lastDeck.ids.length > 0 && (
        <Link
          href={`/training/flashcards?dir=${lastDeck.direction}`}
          onClick={() => practiceDeckHref(lastDeck)}
          className={`inline-flex items-center gap-1.5 self-start rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
        >
          <Play size={16} aria-hidden="true" />
          Last deck · {lastDeck.ids.length} {lastDeck.ids.length === 1 ? "card" : "cards"}
          <span className="sr-only">, {DIRECTION_LABELS[lastDeck.direction]}</span>
        </Link>
      )}
      {open && <DeckBuilder mode="flashcards" initialDirection={open} defaultSet={defaultSet} onClose={closeBuilder} />}
    </section>
  );
}

/** Quiz: Build a quiz opens the builder in quiz mode, and a quick start
 *  runs the last quiz built. */
function QuizCard({ defaultSet }: { defaultSet: DeckSet }) {
  const [open, setOpen] = useState(false);
  const lastQuiz = useLastQuiz();
  const buildRef = useRef<HTMLButtonElement>(null);

  return (
    <section aria-labelledby="quiz-title" className={`${CARD} flex flex-col gap-3`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-good-tint text-good-ink">
        <ListChecks size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 id="quiz-title" className="font-heading text-h3 font-bold text-bark">
          Quiz
        </h3>
        <p className="font-body text-body text-bark-muted">Pick the right answer</p>
      </div>
      <Button ref={buildRef} aria-haspopup="dialog" onClick={() => setOpen(true)} className="mt-auto self-start">
        Build a quiz
      </Button>
      {lastQuiz && lastQuiz.ids.length > 0 && (
        <Link
          href="/training/quiz"
          onClick={() => practiceQuizHref(lastQuiz)}
          className={`inline-flex items-center gap-1.5 self-start rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
        >
          <Play size={16} aria-hidden="true" />
          Last quiz · {lastQuiz.ids.length} {lastQuiz.ids.length === 1 ? "word" : "words"}
        </Link>
      )}
      {open && (
        <DeckBuilder
          mode="quiz"
          defaultSet={defaultSet}
          onClose={() => {
            setOpen(false);
            buildRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}

/** Writing: Build a writing set opens the builder in writing mode, and a
 *  quick start runs the last set built. */
function WritingCard({ defaultSet }: { defaultSet: DeckSet }) {
  const [open, setOpen] = useState(false);
  const lastWriting = useLastWriting();
  const buildRef = useRef<HTMLButtonElement>(null);

  return (
    <section aria-labelledby="writing-title" className={`${CARD} flex flex-col gap-3`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-learning-tint text-learning-ink">
        <PenLine size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 id="writing-title" className="font-heading text-h3 font-bold text-bark">
          Writing
        </h3>
        <p className="font-body text-body text-bark-muted">Trace it, then write from memory</p>
      </div>
      <Button ref={buildRef} aria-haspopup="dialog" onClick={() => setOpen(true)} className="mt-auto self-start">
        Build a writing set
      </Button>
      {lastWriting && lastWriting.ids.length > 0 && (
        <Link
          href="/training/writing"
          onClick={() => practiceWritingHref(lastWriting)}
          className={`inline-flex items-center gap-1.5 self-start rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
        >
          <Play size={16} aria-hidden="true" />
          Last set · {lastWriting.ids.length} {lastWriting.ids.length === 1 ? "word" : "words"}
        </Link>
      )}
      {open && (
        <DeckBuilder
          mode="writing"
          defaultSet={defaultSet}
          onClose={() => {
            setOpen(false);
            buildRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}

/* Daily limits */

type LimitKind = "words" | "writing";

const LIMITS: Record<LimitKind, { label: string; options: readonly number[]; save: (n: number) => Promise<{ ok: boolean }> }> = {
  words: { label: "New words per day", options: DAILY_NEW_WORD_OPTIONS, save: setDailyNewWords },
  writing: { label: "New writing per day", options: DAILY_NEW_WRITING_OPTIONS, save: setDailyNewWriting },
};

function DailyLimitPicker({
  words,
  writing,
  open,
  onOpenChange,
}: {
  words: number;
  writing: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [optimistic, setOptimistic] = useOptimistic({ words, writing });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.scrollIntoView({ block: "nearest" });
    (rootRef.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]") ?? firstOptionRef.current)?.focus();

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  /** Saves one limit; the panel stays open so the other can change too. */
  function choose(kind: LimitKind, next: number) {
    setError(null);
    if (next === (kind === "words" ? words : writing)) return;
    startTransition(async () => {
      setOptimistic((current) => ({ ...current, [kind]: next }));
      const result = await LIMITS[kind].save(next).catch(() => ({ ok: false }));
      if (!result.ok) setError("Couldn't save. Try again.");
    });
  }

  return (
    // Full row on phones, so the label and Change stay on one line.
    <div ref={rootRef} className="relative col-span-2 sm:col-span-1">
      <p className="font-heading text-h2 font-bold text-bark">
        {optimistic.words} <span className="font-body text-body font-normal text-bark-muted">/ day</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-body text-body text-bark-muted">
          New words · {optimistic.writing} to write
        </span>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={pending}
          onClick={() => onOpenChange(!open)}
          className={`rounded-sm font-body text-body font-medium text-rust-dark underline underline-offset-4 disabled:opacity-60 ${FOCUS_RING}`}
        >
          Change<span className="sr-only"> daily limits</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 font-body text-body text-again-ink">
          {error}
        </p>
      )}
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Daily limits"
          // Above on phones, so the floating tab bar can't cover it.
          className="absolute bottom-full left-0 z-20 mb-2 flex w-72 flex-col gap-3 rounded-lg border-[1.5px] border-line bg-surface-raised p-3 shadow-float sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2"
        >
          {(["words", "writing"] as const).map((kind) => (
            <div key={kind} role="group" aria-label={LIMITS[kind].label}>
              <p className="px-1 pb-2 font-body text-body font-medium text-bark">{LIMITS[kind].label}</p>
              <div className="grid grid-cols-6 gap-1.5">
                {LIMITS[kind].options.map((n, i) => (
                  <button
                    key={n}
                    ref={kind === "words" && i === 0 ? firstOptionRef : undefined}
                    type="button"
                    aria-pressed={n === optimistic[kind]}
                    onClick={() => choose(kind, n)}
                    className={`h-11 rounded-md border-[1.5px] font-heading text-h3 font-bold transition-colors ${FOCUS_RING} ${
                      n === optimistic[kind]
                        ? "border-rust-dark bg-highlight text-bark"
                        : "border-line text-bark hover:bg-highlight/60"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              triggerRef.current?.focus();
            }}
            className={`self-end rounded-sm px-1 font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-heading text-h2 font-bold text-bark">{value}</p>
      <p className="font-body text-body text-bark-muted">{label}</p>
    </div>
  );
}

/* Hub */

export function TrainingHub({
  due,
  newCount,
  newFromDictionary,
  toWrite,
  learning,
  dueTomorrow,
  dailyNewWords,
  dailyNewWriting,
  defaultDeckSet,
}: {
  due: number;
  newCount: number;
  newFromDictionary: number;
  toWrite: number;
  learning: number;
  dueTomorrow: number;
  dailyNewWords: number;
  dailyNewWriting: number;
  /** The builder's set when there's no last deck: the user's HSK level. */
  defaultDeckSet: DeckSet;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Training">Review what&apos;s due, then meet a few new words.</PageHeader>

      <TodayCard
        due={due}
        newCount={newCount}
        toWrite={toWrite}
        newFromDictionary={newFromDictionary}
        dueTomorrow={dueTomorrow}
        dailyNewWords={dailyNewWords}
        nothingStarted={learning === 0}
        onChangeLimit={() => setPickerOpen(true)}
      />

      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="font-heading text-h2 font-bold text-bark">
          Practice by mode
        </h2>
        {/* Flashcards takes two columns at xl for its direction tiles;
            Listening will start the next row. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FlashcardsCard defaultSet={defaultDeckSet} />
          <QuizCard defaultSet={defaultDeckSet} />
          <WritingCard defaultSet={defaultDeckSet} />
        </div>
      </section>

      <section aria-label="Your training" className={`${CARD} grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3`}>
        <Stat value={learning} label="Words learning" />
        <Stat value={dueTomorrow} label="Due tomorrow" />
        <DailyLimitPicker words={dailyNewWords} writing={dailyNewWriting} open={pickerOpen} onOpenChange={setPickerOpen} />
      </section>
    </div>
  );
}
