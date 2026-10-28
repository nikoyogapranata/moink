"use client";

import { ArrowLeftRight, Headphones, Info, Layers, ListChecks, PenLine, Play, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode, type Ref } from "react";

import { PageHeader } from "@/components/app/PageHeader";
import { CARD } from "@/components/dictionary/SideCards";
import { Button } from "@/components/ui/Button";
import { NO_VOICE_HELP, useChineseVoiceStatus } from "@/lib/dictionary/speech";
import { devError } from "@/lib/dev";
import { setDailyLimits } from "@/lib/training/actions";
import { DAILY_NEW_WORD_OPTIONS, DAILY_NEW_WRITING_OPTIONS } from "@/lib/training/daily";
import { DIRECTION_LABELS, type DeckSet, type Direction } from "@/lib/training/deck";
import { WORD_STAT_INFO, type WordStats } from "@/lib/training/stats";

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
        <p className="mt-2 font-body text-body-sm text-bark-muted">Saves your progress and keeps your streak</p>
        <p className="mt-2 font-body text-body text-bark-muted">
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

/* Every mode card ends in the same action area, pinned to the bottom
   (margin-top: auto): the extra height in a row goes between the subtitle
   and the actions, so buttons line up across the row. The quick-start
   line keeps its height even when there's no last deck yet. */
const ACTIONS = "mt-auto flex flex-col gap-3";
const LAST_SLOT = "flex min-h-6 items-center";
const LAST_LINK = `inline-flex items-center gap-1.5 rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline ${FOCUS_RING}`;

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
    <section aria-labelledby="flashcards-title" className={`${CARD} flex flex-col gap-3`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-highlight text-rust-dark">
        <Layers size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 id="flashcards-title" className="font-heading text-h3 font-bold text-bark">
          Flashcards
        </h3>
        <p className="font-body text-body text-bark-muted">Practice any set, as often as you like</p>
      </div>
      <div className={ACTIONS}>
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
        <div className={LAST_SLOT}>
          {lastDeck && lastDeck.ids.length > 0 && (
            <Link
              href={`/training/flashcards?dir=${lastDeck.direction}`}
              onClick={() => practiceDeckHref(lastDeck)}
              className={LAST_LINK}
            >
              <Play size={16} aria-hidden="true" />
              Last deck · {lastDeck.ids.length} {lastDeck.ids.length === 1 ? "card" : "cards"}
              <span className="sr-only">, {DIRECTION_LABELS[lastDeck.direction]}</span>
            </Link>
          )}
        </div>
      </div>
      {open && <DeckBuilder mode="flashcards" initialDirection={open} defaultSet={defaultSet} onClose={closeBuilder} />}
    </section>
  );
}

type ModeId = "quiz" | "listening" | "writing";

const MODES: Record<
  ModeId,
  { title: string; subtitle: string; build: string; last: string; icon: LucideIcon; tile: string }
> = {
  quiz: {
    title: "Quiz",
    subtitle: "Pick the right answer",
    build: "Build a quiz",
    last: "Last quiz",
    icon: ListChecks,
    tile: "bg-good-tint text-good-ink",
  },
  listening: {
    title: "Listening",
    subtitle: "Hear it, find it",
    build: "Build a listening set",
    last: "Last set",
    icon: Headphones,
    tile: "bg-listen-tint text-listen-ink",
  },
  writing: {
    title: "Writing",
    subtitle: "Trace it, then write from memory",
    build: "Build a writing set",
    last: "Last set",
    icon: PenLine,
    tile: "bg-learning-tint text-learning-ink",
  },
};

/** The last deck of a mode, for its quick start: how many words, and what
 *  hands it to the practice page (returning the page's href). */
function useLastOf(mode: ModeId): { count: number; start: () => string } | null {
  const quiz = useLastQuiz("quiz");
  const listening = useLastQuiz("listening");
  const writing = useLastWriting();
  if (mode === "writing") return writing?.ids.length ? { count: writing.ids.length, start: () => practiceWritingHref(writing) } : null;
  const deck = mode === "quiz" ? quiz : listening;
  return deck?.ids.length ? { count: deck.ids.length, start: () => practiceQuizHref(mode, deck) } : null;
}

/** A practice mode: its icon, title and line, a button that opens the
 *  builder in that mode, and a quick start for the last deck built.
 *  Listening says why it's off when the browser has no Chinese voice. */
function ModeCard({ mode, defaultSet }: { mode: ModeId; defaultSet: DeckSet }) {
  const [open, setOpen] = useState(false);
  const last = useLastOf(mode);
  const voice = useChineseVoiceStatus();
  const buildRef = useRef<HTMLButtonElement>(null);
  const { title, subtitle, build, icon: Icon, tile } = MODES[mode];
  const noVoice = mode === "listening" && voice === "none";
  const titleId = `${mode}-title`;

  return (
    <section aria-labelledby={titleId} className={`${CARD} flex flex-col gap-3`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-md ${tile}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 id={titleId} className="font-heading text-h3 font-bold text-bark">
          {title}
        </h3>
        <p className="font-body text-body text-bark-muted">{subtitle}</p>
      </div>
      {noVoice && (
        <div className="rounded-md bg-highlight px-3 py-2">
          <p className="font-body text-body font-medium text-bark">Your browser has no Chinese voice</p>
          <p className="font-body text-body-sm text-bark">{NO_VOICE_HELP}</p>
        </div>
      )}
      <div className={ACTIONS}>
        <Button ref={buildRef} aria-haspopup="dialog" disabled={noVoice} onClick={() => setOpen(true)} className="self-start">
          {build}
        </Button>
        <div className={LAST_SLOT}>
          {last && !noVoice && (
            <Link
              href={mode === "writing" ? "/training/writing" : `/training/${mode}`}
              onClick={() => last.start()}
              className={LAST_LINK}
            >
              <Play size={16} aria-hidden="true" />
              {MODES[mode].last} · {last.count} {last.count === 1 ? "word" : "words"}
              <span className="sr-only">, {title}</span>
            </Link>
          )}
        </div>
      </div>
      {open && (
        <DeckBuilder
          mode={mode}
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
type Limits = Record<LimitKind, number>;

const LIMITS: Record<LimitKind, { label: string; info: string; options: readonly number[] }> = {
  words: {
    label: "New words per day",
    info: "New words introduced in Today's review",
    options: DAILY_NEW_WORD_OPTIONS,
  },
  writing: {
    label: "New writing per day",
    info: "Words added to writing once you know them",
    options: DAILY_NEW_WRITING_OPTIONS,
  },
};

/**
 * The daily limits editor: a native modal dialog, centered from md up and
 * a bottom sheet on phones, short enough to show in full. Choices apply
 * on Save only; Cancel and Escape drop them. Mounted while open; the
 * opener takes focus back in `onClose`.
 */
function DailyLimitsDialog({
  words,
  writing,
  onSaved,
  onClose,
}: {
  words: number;
  writing: number;
  /** Called with both limits once they're saved, before the dialog
   *  closes. */
  onSaved: (limits: Limits) => void;
  /** Called after the dialog has closed. */
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ words, writing });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // As in DeckBuilder: open on mount, and never close() in the cleanup
  // (under Strict Mode its queued close event would land after the second
  // showModal()). Focus starts on the chosen number of new words.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      devError("DailyLimitsDialog: the dialog ref is null on mount, so it can't open.");
      return;
    }
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch (error) {
        devError("DailyLimitsDialog: dialog.showModal() threw, so it isn't open.", error);
      }
    }
    dialog.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus();
  }, []);

  function save() {
    setError(null);
    if (draft.words === words && draft.writing === writing) {
      dialogRef.current?.close();
      return;
    }
    startTransition(async () => {
      const result = await setDailyLimits(draft.words, draft.writing).catch(() => ({ ok: false }));
      if (!result.ok) {
        setError("Couldn't save. Try again.");
        return;
      }
      onSaved(draft);
      dialogRef.current?.close();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={(e) => {
        // A close event that lands while the dialog is open again is stale.
        if (!e.currentTarget.open) onCloseRef.current();
      }}
      className="deck-dialog mx-0 mb-0 mt-auto hidden max-h-dvh w-full max-w-none flex-col gap-5 overflow-y-auto rounded-t-[22px] border-0 bg-surface-raised px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 text-bark open:flex backdrop:bg-black/50 sm:px-6 md:m-auto md:w-[calc(100%-48px)] md:max-w-120 md:rounded-[22px] md:border-[1.5px] md:border-line md:pb-5"
    >
      <h2 id={titleId} className="font-heading text-h1 font-bold text-bark">
        Daily limits
      </h2>
      {(["words", "writing"] as const).map((kind) => {
        const { label, info, options } = LIMITS[kind];
        const labelId = `${titleId}-${kind}`;
        return (
          <section key={kind} aria-labelledby={labelId}>
            <h3 id={labelId} className="font-heading text-h3 font-bold text-bark">
              {label}
            </h3>
            <p className="font-body text-body-sm text-bark-muted">{info}</p>
            <div
              role="group"
              aria-labelledby={labelId}
              className="mt-3 grid grid-cols-6 gap-1 rounded-lg bg-highlight p-1"
            >
              {options.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === draft[kind]}
                  onClick={() => setDraft((current) => ({ ...current, [kind]: n }))}
                  className={`h-12 rounded-md font-heading text-h3 font-bold tabular-nums transition-colors ${FOCUS_RING} ${
                    n === draft[kind]
                      ? "bg-surface-raised text-rust-dark shadow-float"
                      : "text-bark-muted hover:bg-surface-raised/60 hover:text-bark"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {error && (
        <p role="alert" className="font-body text-body text-again-ink">
          {error}
        </p>
      )}
      <footer className="flex flex-row-reverse flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>
          Cancel
        </Button>
      </footer>
    </dialog>
  );
}

/* Stats */

/** An (i) button with a one-sentence tooltip: shown on hover and keyboard
 *  focus, and toggled by a tap. Screen readers get it as the button's
 *  description. */
function InfoTip({ label, info, align }: { label: string; info: string; align: "start" | "center" | "end" }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={tipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={`-m-1.5 flex h-8 w-8 items-center justify-center rounded-full text-bark-muted transition-colors hover:text-bark ${FOCUS_RING}`}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-1.5 w-52 max-w-[calc(100vw-48px)] rounded-md bg-bark px-2.5 py-1.5 text-left font-body text-[13px] font-medium leading-5 text-background group-hover:block group-has-[:focus-visible]:block ${TIP_ALIGN[align]} ${
          open ? "block" : "hidden"
        }`}
      >
        {info}
      </span>
    </span>
  );
}

const TIP_ALIGN = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" };

/** The three stats in columns, each tooltip kept on screen by aligning it
 *  with its column. */
const STATS = [
  { key: "started", align: "start" },
  { key: "learned", align: "center" },
  { key: "dueTomorrow", align: "end" },
] as const;

function StatsStrip({
  stats,
  dailyNewWords,
  dailyNewWriting,
  changeRef,
  onChange,
}: {
  stats: WordStats;
  dailyNewWords: number;
  dailyNewWriting: number;
  changeRef: Ref<HTMLButtonElement>;
  onChange: () => void;
}) {
  return (
    <section aria-label="Your training" className={`${CARD} flex flex-col gap-4`}>
      <dl className="grid grid-cols-3 gap-x-3">
        {STATS.map(({ key, align }) => {
          const { label, info } = WORD_STAT_INFO[key];
          return (
            <div key={key} className="flex flex-col">
              {/* The (i) flows after the label's last word when it wraps. */}
              <dt className="order-last font-body text-body text-bark-muted">
                {label}{" "}
                <InfoTip label={label} info={info} align={align} />
              </dt>
              <dd className="font-heading text-h2 font-bold tabular-nums text-bark">{stats[key]}</dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t-[1.5px] border-line pt-4">
        <p className="font-body text-body text-bark">
          <span className="font-bold tabular-nums">{dailyNewWords}</span> new words ·{" "}
          <span className="font-bold tabular-nums">{dailyNewWriting}</span> writing / day
        </p>
        <Button ref={changeRef} variant="secondary" size="sm" aria-haspopup="dialog" onClick={onChange}>
          Change<span className="sr-only"> daily limits</span>
        </Button>
      </div>
    </section>
  );
}

/* Hub */

export function TrainingHub({
  due,
  newCount,
  newFromDictionary,
  toWrite,
  stats,
  dailyNewWords,
  dailyNewWriting,
  defaultDeckSet,
}: {
  due: number;
  newCount: number;
  newFromDictionary: number;
  toWrite: number;
  stats: WordStats;
  dailyNewWords: number;
  dailyNewWriting: number;
  /** The builder's set when there's no last deck: the user's HSK level. */
  defaultDeckSet: DeckSet;
}) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  // Focus returns here when the limits dialog closes, also when the Today
  // card's "Change the limit" opened it: that link is gone once a limit
  // above 0 is saved.
  const changeRef = useRef<HTMLButtonElement>(null);
  // The limits just saved, shown until the refreshed page (setDailyLimits
  // refreshes it; that can take a few seconds) brings new props: while
  // the props are still the ones from before the save.
  const [saved, setSaved] = useState<{ limits: Limits; before: Limits } | null>(null);
  const limits =
    saved && saved.before.words === dailyNewWords && saved.before.writing === dailyNewWriting
      ? saved.limits
      : { words: dailyNewWords, writing: dailyNewWriting };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Training">Review what&apos;s due, then meet a few new words.</PageHeader>

      <TodayCard
        due={due}
        newCount={newCount}
        toWrite={toWrite}
        newFromDictionary={newFromDictionary}
        dueTomorrow={stats.dueTomorrow}
        dailyNewWords={limits.words}
        nothingStarted={stats.started === 0}
        onChangeLimit={() => setLimitsOpen(true)}
      />

      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="font-heading text-h2 font-bold text-bark">
          Practice by mode
        </h2>
        {/* Two by two from sm up: each row's cards share a height, and
            Flashcards has room for its two direction tiles. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FlashcardsCard defaultSet={defaultDeckSet} />
          <ModeCard mode="quiz" defaultSet={defaultDeckSet} />
          <ModeCard mode="writing" defaultSet={defaultDeckSet} />
          <ModeCard mode="listening" defaultSet={defaultDeckSet} />
        </div>
      </section>

      <StatsStrip
        stats={stats}
        dailyNewWords={limits.words}
        dailyNewWriting={limits.writing}
        changeRef={changeRef}
        onChange={() => setLimitsOpen(true)}
      />

      {limitsOpen && (
        <DailyLimitsDialog
          words={limits.words}
          writing={limits.writing}
          onSaved={(next) => setSaved({ limits: next, before: { words: dailyNewWords, writing: dailyNewWriting } })}
          onClose={() => {
            setLimitsOpen(false);
            changeRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
