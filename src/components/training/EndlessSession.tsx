"use client";

import { Check, ChevronLeft, ChevronRight, Infinity as InfinityIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ThemeToggle } from "@/components/app/Theme";
import { Button } from "@/components/ui/Button";
import { inDeckOrderFrom, shuffle, type Direction } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";

import { CARD_HEIGHT, FlashCard, HINT, PILL } from "./FlashCard";
import { useDirection, useMarkPracticed } from "./hooks";
import { saveLastDeckShuffle } from "./deckStore";
import { DirectionToggle, DoneScreen, SessionFrame, ShuffleButton } from "./SessionParts";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface Endless {
  /** Every card shown so far, in order, and the round each was in. */
  shown: QueueItem[];
  roundOf: number[];
  /** The card on screen: an index into shown. */
  at: number;
  /** The current round's cards not shown yet. */
  rest: QueueItem[];
  round: number;
}

function start(items: QueueItem[], shuffled: boolean): Endless {
  const [first, ...rest] = shuffled ? shuffle(items) : items;
  return { shown: [first], roundOf: [1], at: 0, rest, round: 1 };
}

/** A new round's order: deck order, or shuffled and never opening with
 *  the card just shown (with two or more cards). */
function nextRound(items: QueueItem[], last: QueueItem, shuffled: boolean) {
  if (!shuffled) return items;
  const order = shuffle(items);
  if (order.length > 1 && order[0].word.id === last.word.id) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

function forward(s: Endless, items: QueueItem[], shuffled: boolean): Endless {
  if (s.at < s.shown.length - 1) return { ...s, at: s.at + 1 };
  const fresh = s.rest.length === 0;
  const [card, ...rest] = fresh ? nextRound(items, s.shown[s.at], shuffled) : s.rest;
  const round = fresh ? s.round + 1 : s.round;
  return { shown: [...s.shown, card], roundOf: [...s.roundOf, round], at: s.at + 1, rest, round };
}

/**
 * Endless flashcards: the deck over and over, a new round after its last
 * card. Rounds go in deck order; with Shuffle on (S), the rest of this
 * round and every later round are shuffled, and turning it off puts them
 * back in deck order from the last card dealt. Previous and Next move
 * through the cards shown (Next past the last one deals a new card); Got
 * it only marks the card for this session, so it keeps coming. Nothing is
 * saved: no reviews, no schedule or due dates (like Normal, the first
 * card marks today practiced). End, or the browser's Back, shows the
 * summary.
 */
export function EndlessSession({
  items,
  shuffled,
  initialDirection,
}: {
  /** In deck order. */
  items: QueueItem[];
  /** Shuffle's starting state, from the builder. */
  shuffled: boolean;
  initialDirection: Direction | null;
}) {
  const [direction, setDirection] = useDirection("practice", initialDirection);
  const [shuffleOn, setShuffleOn] = useState(shuffled);
  const [state, setState] = useState(() => start(items, shuffled));
  const [flipped, setFlipped] = useState(false);
  const [gotIt, setGotIt] = useState<ReadonlySet<number>>(() => new Set());
  const [ended, setEnded] = useState(false);
  const markPracticed = useMarkPracticed();
  const cardRef = useRef<HTMLButtonElement>(null);
  /** A history entry of our own is on the stack: Back pops it and ends. */
  const guarded = useRef(false);

  const item = state.shown[state.at];
  const marked = gotIt.has(item.word.id);

  // Back (or a swipe back) ends the session on the summary instead of
  // leaving the page; Back again then leaves.
  function guard() {
    if (guarded.current) return;
    window.history.pushState(null, "", window.location.href);
    guarded.current = true;
  }
  useEffect(() => {
    guard();
    const onPop = () => {
      guarded.current = false;
      setEnded(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function end() {
    // Through history, so the entry we pushed doesn't linger.
    if (guarded.current) window.history.back();
    else setEnded(true);
  }

  function move(next: (s: Endless) => Endless) {
    setState(next);
    setFlipped(false);
  }

  function goNext() {
    markPracticed();
    move((s) => forward(s, items, shuffleOn));
  }

  // Reorders only the cards still to come in this round, after the last
  // card dealt; the card on screen and the cards shown stay put.
  function toggleShuffle() {
    const next = !shuffleOn;
    setShuffleOn(next);
    setState((s) => {
      const last = s.shown[s.shown.length - 1];
      return { ...s, rest: next ? shuffle(s.rest) : inDeckOrderFrom(s.rest, items, last.word.id) };
    });
    saveLastDeckShuffle(next);
  }

  function goPrevious() {
    if (state.at > 0) move((s) => ({ ...s, at: s.at - 1 }));
  }

  function toggleGotIt() {
    markPracticed();
    setGotIt((prev) => {
      const next = new Set(prev);
      if (next.has(item.word.id)) next.delete(item.word.id);
      else next.add(item.word.id);
      return next;
    });
  }

  // Keep focus on the card as it changes, unless the user is elsewhere.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) cardRef.current?.focus({ preventScroll: true });
  }, [state.at]);

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (ended || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrevious();
    } else if (e.key === " " && !e.repeat) {
      // Space flips wherever focus is, rather than pressing a button.
      e.preventDefault();
      setFlipped((f) => !f);
    } else if ((e.key === "g" || e.key === "G") && !e.repeat) {
      e.preventDefault();
      toggleGotIt();
    } else if ((e.key === "s" || e.key === "S") && !e.repeat) {
      e.preventDefault();
      toggleShuffle();
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (ended) {
    return (
      <DoneScreen
        title="Session ended"
        stats={[
          { label: "Rounds", value: String(state.round) },
          { label: "Cards seen", value: String(state.shown.length) },
          { label: "Marked got it", value: String(gotIt.size) },
        ]}
      >
        <Button
          onClick={() => {
            guard();
            setEnded(false);
          }}
        >
          Keep going
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/training">Back to Training</Link>
        </Button>
      </DoneScreen>
    );
  }

  return (
    <SessionFrame>
      <header className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-background px-4 pb-4 pt-[calc(12px+env(safe-area-inset-top))] sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${PILL} gap-1 bg-rust text-background`}>
            <InfinityIcon size={14} aria-hidden="true" />
            Endless
          </span>
          {/* Its own line under the buttons on phones. */}
          <p className="order-last flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-body text-body font-medium tabular-nums text-bark sm:order-none sm:w-auto sm:flex-1">
            <span>Round {state.round}</span>
            <span className="text-bark-muted">{state.shown.length} seen</span>
            <span className="text-good-ink">{gotIt.size} got it</span>
          </p>
          <span className="ml-auto sm:ml-0">
            <ShuffleButton on={shuffleOn} onToggle={toggleShuffle} />
          </span>
          <ThemeToggle
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`}
          />
          <button
            type="button"
            onClick={end}
            className={`-mr-1 inline-flex h-11 shrink-0 items-center rounded-pill border-[1.5px] border-line px-4 font-heading text-[17px] font-bold text-bark transition-colors hover:bg-highlight/60 ${FOCUS_RING}`}
          >
            End
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DirectionToggle
            large
            value={direction}
            onChange={(next) => {
              setDirection(next);
              setFlipped(false);
            }}
          />
          <span className={`${PILL} bg-highlight text-bark`}>Practice · not saved</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="relative mx-auto w-full max-w-md">
          <div key={state.at} className={`relative ${CARD_HEIGHT} card-rise`}>
            <FlashCard ref={cardRef} item={item} direction={direction} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
            {marked && (
              <span
                aria-hidden="true"
                className={`${PILL} pointer-events-none absolute bottom-3 right-3 gap-1 bg-good-tint text-good-ink`}
              >
                <Check size={14} />
                Got it
              </span>
            )}
          </div>
        </div>

        <p aria-live="polite" className="sr-only">
          {`Card ${state.shown.length > 0 ? state.at + 1 : 0}, round ${state.roundOf[state.at]}${marked ? ", marked got it" : ""}.`}
        </p>

        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          <div className="grid grid-cols-[auto_1fr_auto] gap-3">
            <button
              type="button"
              onClick={goPrevious}
              disabled={state.at === 0}
              aria-label="Previous card"
              aria-keyshortcuts="ArrowLeft"
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-line bg-surface-raised text-bark transition-colors hover:bg-highlight/60 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-raised sm:w-auto sm:gap-1 sm:px-4 ${FOCUS_RING}`}
            >
              <ChevronLeft size={22} aria-hidden="true" />
              <span className="hidden font-heading text-h3 font-bold sm:inline">Previous</span>
            </button>
            <button
              type="button"
              onClick={toggleGotIt}
              aria-pressed={marked}
              aria-keyshortcuts="G"
              className={`flex h-14 items-center justify-center gap-2 rounded-pill px-3 font-heading text-h3 font-bold transition-colors ${FOCUS_RING} ${
                marked
                  ? "bg-got-it text-on-got-it hover:bg-got-it-strong"
                  : "border-2 border-got-it bg-surface-raised text-good-ink hover:bg-good-tint"
              }`}
            >
              <Check size={20} aria-hidden="true" />
              Got it
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next card"
              aria-keyshortcuts="ArrowRight"
              className={`flex h-14 w-14 items-center justify-center rounded-full bg-rust text-background transition-colors hover:bg-rust-dark sm:w-auto sm:gap-1 sm:px-4 ${FOCUS_RING}`}
            >
              <span className="hidden font-heading text-h3 font-bold sm:inline">Next</span>
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
          <p className={HINT}>← Previous · Space flip · G got it · S shuffle · → Next</p>
        </div>
      </main>
    </SessionFrame>
  );
}
