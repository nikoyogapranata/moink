"use client";

import { ArrowRight, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useEffectEvent,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { devError } from "@/lib/dev";
import { fetchDeckSet, fetchDueTodayIds } from "@/lib/training/actions";
import { DECK_SETS, type DeckSet, type Direction } from "@/lib/training/deck";
import type { QueueWord } from "@/lib/training/queue";
import { QUIZ_FORMAT_LABELS, QUIZ_FORMATS, type QuizFormat } from "@/lib/training/quiz";
import { isWritable, WRITING_STYLE_LABELS, type WritingStyle } from "@/lib/training/writing";

import {
  practiceDeckHref,
  practiceQuizHref,
  practiceWritingHref,
  readLastDeck,
  readLastQuiz,
  readLastWriting,
  saveLastDeck,
  saveLastQuiz,
  saveLastWriting,
} from "./deckStore";
import { useReducedMotion } from "./hooks";
import { DirectionToggle, SegmentedControl } from "./SessionParts";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/** Long press before a touch starts painting. */
const LONG_PRESS_MS = 350;
/** Hover before the peek shows. */
const PEEK_DELAY_MS = 500;
/** A touch that moves this far before the long press is a scroll. */
const TOUCH_SLOP_PX = 8;
/** Drag samples along the pointer's path, so fast drags don't skip tiles. */
const SAMPLE_STEP_PX = 16;
/** Auto-scroll zone at the top and bottom of the grid, and top speed. */
const EDGE_PX = 48;
const MAX_SCROLL_PX = 18;

type SetData = { words: QueueWord[]; inTraining: ReadonlySet<number> } | "error";

type Drag = {
  pointerId: number;
  touch: boolean;
  /** pending: a touch waiting for the long press; armed: long-pressed, not
   *  moved yet; painting: every tile passed over gets `value`. */
  mode: "pending" | "armed" | "painting";
  startIndex: number;
  value: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  painted: Set<number>;
  timer: number | undefined;
};

type Peek = { index: number; top: number; left: number; below: boolean };

/** 20px, or smaller so the word fits the tile's width: on one line up to
 *  4 characters, on two past that. A hanzi is 1em wide, and cqi is the
 *  tile's content width. */
function hanziFontSize(text: string) {
  const length = [...text].length;
  const perLine = length <= 4 ? length : Math.ceil(length / 2);
  return `min(20px, ${(96 / perLine).toFixed(2)}cqi)`;
}

const WordTile = memo(function WordTile({
  word,
  index,
  selected,
  known,
  focusable,
  disabled,
}: {
  word: QueueWord;
  index: number;
  selected: boolean;
  known: boolean;
  focusable: boolean;
  /** Writing: the word has a character with no stroke data. */
  disabled: boolean;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      aria-label={`${word.simplified}, ${word.pinyin}${word.gloss ? `, ${word.gloss}` : ""}${known ? ", in your training" : ""}${disabled ? ", no stroke data" : ""}`}
      title={disabled ? "No stroke data" : undefined}
      tabIndex={focusable ? 0 : -1}
      data-index={index}
      className={`@container relative flex h-13 min-w-0 items-center justify-center rounded-[12px] border-[1.5px] px-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-dark ${
        disabled
          ? "cursor-not-allowed border-dashed border-line bg-surface-raised opacity-50"
          : selected
            ? "cursor-pointer border-rust bg-rust/12"
            : "cursor-pointer border-line bg-surface-raised hover:bg-highlight/50"
      }`}
    >
      {known && <span aria-hidden="true" className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-deep-grass" />}
      {selected && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rust" />}
      <span
        lang="zh-CN"
        style={{ fontSize: hanziFontSize(word.simplified) }}
        className="w-full font-hanzi font-medium leading-[1.2] wrap-break-word text-bark"
      >
        {word.simplified}
      </span>
    </div>
  );
});

export type BuilderMode = "flashcards" | "quiz" | "writing";

/**
 * Build your deck (flashcards: pick a direction), your quiz (pick the
 * question formats) or a writing set (pick the style), then words from any
 * of the sets. The selection carries across sets. A native modal dialog
 * (focus stays inside, the page behind is inert); a full-screen sheet on
 * phones. Restores the mode's last deck and saves it again on close and on
 * Start. The quiz and writing note selected words that are due today in
 * their schedule, since only Today's review counts them. Writing can't
 * pick words with a character that has no stroke data.
 */
export function DeckBuilder({
  mode,
  initialDirection = "hanzi",
  defaultSet,
  onClose,
}: {
  mode: BuilderMode;
  /** Flashcards only. */
  initialDirection?: Direction;
  /** When there's no last deck: the user's HSK level. */
  defaultSet: DeckSet;
  /** Called after the dialog has closed; the opener takes focus back. */
  onClose: () => void;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const titleId = useId();

  const quiz = mode === "quiz";
  const writing = mode === "writing";
  // Only mounted after a click, so reading storage here can't mismatch.
  const [lastQuiz] = useState(() => (quiz ? readLastQuiz() : null));
  const [lastWriting] = useState(() => (writing ? readLastWriting() : null));
  const [lastDeck] = useState(() => (quiz ? lastQuiz : writing ? lastWriting : readLastDeck()));
  const [direction, setDirection] = useState(initialDirection);
  const [formats, setFormats] = useState<readonly QuizFormat[]>(lastQuiz?.formats ?? QUIZ_FORMATS);
  const [style, setStyle] = useState<WritingStyle>(lastWriting?.style ?? "trace");
  const [dueToday, setDueToday] = useState<ReadonlySet<number>>(() => new Set());
  const [set, setSet] = useState<DeckSet>(lastDeck?.set ?? defaultSet);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(lastDeck?.ids));
  const [shuffleOn, setShuffleOn] = useState(lastDeck?.shuffle ?? true);
  const [sets, setSets] = useState<Partial<Record<DeckSet, SetData>>>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [shaking, setShaking] = useState(false);
  const [notice, setNotice] = useState("");

  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const anchor = useRef<number | null>(null);
  const hoverIndex = useRef<number | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  const scrollFrame = useRef(0);
  /** The grid's scrollTop when the peek showed: it hides once that moves. */
  const peekScrollTop = useRef(0);

  const data = sets[set];
  const words = data && data !== "error" ? data.words : [];
  const loaded = data !== undefined;
  const setLabel = DECK_SETS.find((s) => s.id === set)!.label;
  const selectedHere = words.reduce((n, w) => (selected.has(w.id) ? n + 1 : n), 0);
  const selectedDue = quiz || writing ? [...selected].reduce((n, id) => (dueToday.has(id) ? n + 1 : n), 0) : 0;
  /** Writing only takes words the pad can write. */
  const canPick = (word: QueueWord) => !writing || isWritable(word.simplified);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Open as a modal; lock the page behind it. No horizontal overscroll, so
  // a sideways paint can't turn into the browser's swipe-back.
  //
  // The cleanup must not call dialog.close(): its close event is queued, so
  // under Strict Mode (mount, cleanup, mount) it would land after the
  // second showModal() and unmount the builder a frame after it opened.
  // Unmounting removes the dialog, which takes it out of the top layer.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      devError("DeckBuilder: the dialog ref is null on mount, so the builder can't open.");
      return;
    }
    const root = document.documentElement;
    const { overflow, overscrollBehaviorX } = root.style;
    root.style.overflow = "hidden";
    root.style.overscrollBehaviorX = "none";
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch (error) {
        devError("DeckBuilder: dialog.showModal() threw, so the builder isn't open.", error);
      }
    }
    if (!dialog.open) devError("DeckBuilder: the dialog still isn't open after showModal().", dialog);
    const frame = requestAnimationFrame(() => {
      const box = dialog.getBoundingClientRect();
      if (dialog.open && (getComputedStyle(dialog).display === "none" || box.width === 0 || box.height === 0)) {
        devError(
          "DeckBuilder: the dialog is open but not visible (display none or zero size). Check its open:flex class and the .deck-dialog CSS.",
          dialog,
        );
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = overflow;
      root.style.overscrollBehaviorX = overscrollBehaviorX;
      window.clearTimeout(peekTimer.current);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  // Load each set the first time it's shown (a retry clears it).
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    fetchDeckSet(set)
      .catch((error) => {
        devError(`DeckBuilder: fetchDeckSet("${set}") threw.`, error);
        return { ok: false } as const;
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) devError(`DeckBuilder: couldn't load the "${set}" set (fetchDeckSet returned ok: false; see the server log).`);
        setSets((all) => ({
          ...all,
          [set]: result.ok ? { words: result.words, inTraining: new Set(result.inTraining) } : "error",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [set, loaded]);

  // The due hint: the user's cards due today in the mode's schedule
  // (recognition for the quiz, writing for writing), loaded once.
  useEffect(() => {
    if (!quiz && !writing) return;
    let cancelled = false;
    fetchDueTodayIds(writing ? "writing" : "recognition")
      .catch((error) => {
        devError("DeckBuilder: fetchDueTodayIds threw, so the due hint stays hidden.", error);
        return null;
      })
      .then((ids) => {
        if (!cancelled && ids) setDueToday(new Set(ids));
      });
    return () => {
      cancelled = true;
    };
  }, [quiz, writing]);

  // Touch painting runs on touch events. After a long press Chrome sends
  // touchmove uncancelable and cancels the pointer once it starts a pan,
  // so the scroller is frozen when painting arms (see onPointerDown) and
  // these keep painting and end it.
  const onTouchMove = useEffectEvent((e: TouchEvent) => {
    const d = drag.current;
    if (!d?.touch || d.mode === "pending") return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    if (touch) moveTo(touch.clientX, touch.clientY);
  });
  const onTouchEnd = useEffectEvent(() => {
    const d = drag.current;
    if (d?.touch && d.mode !== "pending") finishDrag(false);
  });
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      devError("DeckBuilder: the grid's scroll area ref is null, so touch painting is off.");
      return;
    }
    const move = (e: TouchEvent) => onTouchMove(e);
    const end = () => onTouchEnd();
    scroller.addEventListener("touchmove", move, { passive: false });
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
    return () => {
      scroller.removeEventListener("touchmove", move);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", end);
      scroller.style.overflowY = "";
    };
  }, []);

  /** Saves the deck as the mode's last one; returns what hands it to the
   *  practice page (and gives the page's href). */
  function save() {
    const ids = [...selected];
    if (quiz) {
      const deck = { formats: [...formats], set, ids, shuffle: shuffleOn };
      saveLastQuiz(deck);
      return () => practiceQuizHref(deck);
    }
    if (writing) {
      const deck = { style, set, ids, shuffle: shuffleOn };
      saveLastWriting(deck);
      return () => practiceWritingHref(deck);
    }
    const deck = { direction, set, ids, shuffle: shuffleOn };
    saveLastDeck(deck);
    return () => practiceDeckHref(deck);
  }

  function close() {
    save();
    dialogRef.current?.close();
  }

  function start() {
    if (selected.size === 0) {
      setNotice("Pick at least one word first.");
      if (!reducedMotion) setShaking(true);
      return;
    }
    router.push(save()());
  }

  function toggleFormat(format: QuizFormat) {
    if (formats.includes(format)) {
      if (formats.length === 1) {
        setNotice("Keep at least one format on.");
        return;
      }
      setFormats(formats.filter((f) => f !== format));
    } else {
      setFormats(QUIZ_FORMATS.filter((f) => f === format || formats.includes(f)));
    }
    setNotice("");
  }

  function chooseSet(next: DeckSet) {
    if (next === set) return;
    setSet(next);
    setFocusIndex(0);
    setPeek(null);
    anchor.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
  }

  /* Selection */

  function apply(indices: number[], value: boolean) {
    const ids = indices.flatMap((i) => (words[i] && canPick(words[i]) ? [words[i].id] : []));
    if (ids.length === 0) {
      if (indices.length === 1 && words[indices[0]]) setNotice(`${words[indices[0]].simplified} has no stroke data, so it can't be written.`);
      return;
    }
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id) === value)) return prev;
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggle(index: number) {
    const word = words[index];
    if (word) apply([index], !selected.has(word.id));
  }

  function selectRange(from: number, to: number) {
    const [lo, hi] = from < to ? [from, to] : [to, from];
    apply(
      Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
      true,
    );
  }

  function setAll(value: boolean) {
    apply(
      words.map((_, i) => i),
      value,
    );
  }

  /* Pointer: click, shift-click, drag painting, long press, auto-scroll */

  function tileElement(index: number) {
    return gridRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;
  }

  function indexOf(target: EventTarget | null) {
    const tile = target instanceof Element ? target.closest<HTMLElement>("[data-index]") : null;
    return tile && gridRef.current?.contains(tile) ? Number(tile.dataset.index) : null;
  }

  function hidePeek() {
    window.clearTimeout(peekTimer.current);
    hoverIndex.current = null;
    setPeek(null);
  }

  function showPeek(index: number) {
    const tile = tileElement(index);
    const panel = panelRef.current;
    const scroller = scrollRef.current;
    if (!tile || !panel || !scroller) return;
    const t = tile.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    // Above the tile, or below it when there's no room above in the grid.
    const below = t.top - scroller.getBoundingClientRect().top < 64;
    const left = Math.min(Math.max(t.left + t.width / 2 - p.left, 100), p.width - 100);
    peekScrollTop.current = scroller.scrollTop;
    setPeek({ index, below, left, top: below ? t.bottom - p.top + 6 : t.top - p.top - 6 });
  }

  /** Paints every tile along the segment from the last pointer position. */
  function paintTo(x: number, y: number) {
    const d = drag.current;
    if (!d) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - d.x, y - d.y) / SAMPLE_STEP_PX));
    const hits: number[] = [];
    for (let i = 1; i <= steps; i++) {
      const sx = d.x + ((x - d.x) * i) / steps;
      const sy = d.y + ((y - d.y) * i) / steps;
      const index = indexOf(document.elementFromPoint(sx, sy));
      if (index !== null && !d.painted.has(index)) {
        d.painted.add(index);
        hits.push(index);
      }
    }
    d.x = x;
    d.y = y;
    apply(hits, d.value);
  }

  function startPainting(d: Drag) {
    d.mode = "painting";
    d.painted.add(d.startIndex);
    apply([d.startIndex], d.value);
    hidePeek();
    if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(autoScroll);
  }

  // Near the top or bottom edge of the grid, scroll (faster the closer)
  // and paint whatever comes under the pointer.
  function autoScroll() {
    const d = drag.current;
    const scroller = scrollRef.current;
    if (!d || d.mode !== "painting" || !scroller) {
      scrollFrame.current = 0;
      return;
    }
    const rect = scroller.getBoundingClientRect();
    let delta = 0;
    if (d.y < rect.top + EDGE_PX) delta = -MAX_SCROLL_PX * Math.min(1, (rect.top + EDGE_PX - d.y) / EDGE_PX);
    else if (d.y > rect.bottom - EDGE_PX) delta = MAX_SCROLL_PX * Math.min(1, (d.y - rect.bottom + EDGE_PX) / EDGE_PX);
    if (delta) {
      const before = scroller.scrollTop;
      scroller.scrollTop += delta;
      if (scroller.scrollTop !== before) {
        // Hit-test inside the grid even when the pointer is past its edge.
        const x = Math.min(Math.max(d.x, rect.left + 2), rect.right - 2);
        const y = Math.min(Math.max(d.y, rect.top + 2), rect.bottom - 2);
        const { x: realX, y: realY } = d;
        d.x = x;
        d.y = y;
        paintTo(x, y);
        d.x = realX;
        d.y = realY;
      }
    }
    scrollFrame.current = requestAnimationFrame(autoScroll);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const index = indexOf(e.target);
    if (index === null || drag.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    hidePeek();
    setFocusIndex(index);
    tileElement(index)?.focus({ preventScroll: true });

    if (e.shiftKey && anchor.current !== null) {
      selectRange(anchor.current, index);
      anchor.current = index;
      return;
    }
    anchor.current = index;

    const word = words[index];
    const d: Drag = {
      pointerId: e.pointerId,
      touch: e.pointerType === "touch",
      mode: "pending",
      startIndex: index,
      value: !selected.has(word.id),
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      painted: new Set(),
      timer: undefined,
    };
    drag.current = d;

    if (d.touch) {
      // A tap toggles on release; holding still arms painting.
      d.timer = window.setTimeout(() => {
        if (drag.current !== d || d.mode !== "pending") return;
        d.mode = "armed";
        navigator.vibrate?.(10);
        // Nothing left for the browser to scroll, so the finger paints.
        // Auto-scroll still moves it (scrollTop works on overflow hidden).
        if (scrollRef.current) scrollRef.current.style.overflowY = "hidden";
      }, LONG_PRESS_MS);
    } else {
      // Mouse and pen: the press toggles, and a drag paints on.
      e.currentTarget.setPointerCapture(e.pointerId);
      startPainting(d);
    }
  }

  /** The pointer (mouse) or finger (touch, once armed) moved to x, y. */
  function moveTo(x: number, y: number) {
    const d = drag.current;
    if (!d) return;
    const moved = Math.hypot(x - d.startX, y - d.startY);
    if (d.mode === "pending") {
      // Moving before the long press: a scroll, which the browser handles.
      if (moved > TOUCH_SLOP_PX) {
        window.clearTimeout(d.timer);
        drag.current = null;
      }
      return;
    }
    if (d.mode === "armed") {
      if (moved <= TOUCH_SLOP_PX / 2) return;
      startPainting(d);
    }
    paintTo(x, y);
  }

  function finishDrag(cancelled: boolean) {
    const d = drag.current;
    if (!d) return;
    window.clearTimeout(d.timer);
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = 0;
    drag.current = null;
    if (scrollRef.current) scrollRef.current.style.overflowY = "";
    if (cancelled || !d.touch) return;
    if (d.mode === "pending") toggle(d.startIndex);
    else if (d.mode === "armed") showPeek(d.startIndex);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Once a touch is armed, the touch events take over (onTouchMove).
    if (d.touch && d.mode !== "pending") return;
    moveTo(e.clientX, e.clientY);
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Chrome cancels the pointer of an armed touch when it starts a pan;
    // the touch events finish that drag instead.
    if (cancelled && d.touch && d.mode !== "pending") return;
    finishDrag(cancelled);
  }

  function onPointerOver(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || drag.current) return;
    const index = indexOf(e.target);
    if (index === hoverIndex.current) return;
    hidePeek();
    hoverIndex.current = index;
    if (index !== null) peekTimer.current = window.setTimeout(() => showPeek(index), PEEK_DELAY_MS);
  }

  /* Keyboard: arrows move, Space toggles, Shift+arrows extend */

  function columns() {
    const grid = gridRef.current;
    if (!grid) return 1;
    return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const index = indexOf(e.target);
    if (index === null) return;
    if (e.key === " ") {
      e.preventDefault();
      hidePeek();
      toggle(index);
      anchor.current = index;
      return;
    }
    const cols = columns();
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + cols,
      ArrowUp: index - cols,
      Home: 0,
      End: words.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = Math.min(Math.max(moves[e.key], 0), words.length - 1);
    hidePeek();
    setFocusIndex(next);
    tileElement(next)?.focus();
    if (e.shiftKey) {
      if (anchor.current === null) anchor.current = index;
      selectRange(anchor.current, next);
    }
  }

  const peekWord = peek ? words[peek.index] : null;
  const chip = (pressed: boolean) =>
    `h-9 shrink-0 rounded-pill border-[1.5px] px-3.5 font-body text-body font-medium transition-colors ${FOCUS_RING} ${
      pressed ? "border-rust-dark bg-highlight text-bark" : "border-line text-bark hover:bg-highlight/60"
    }`;
  const textButton = `rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline disabled:text-bark-muted disabled:no-underline ${FOCUS_RING}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={(e) => {
        // A close event that lands while the dialog is open again is stale.
        if (!e.currentTarget.open) onCloseRef.current();
      }}
      className="deck-dialog m-0 hidden h-dvh max-h-none w-full max-w-none border-0 bg-surface-raised p-0 text-bark open:flex backdrop:bg-black/50 md:m-auto md:h-[min(85vh,780px)] md:w-[calc(100%-48px)] md:max-w-170 md:rounded-[22px] lg:max-w-215 md:border-[1.5px] md:border-line"
    >
      <div
        ref={panelRef}
        onPointerDown={(e) => {
          if (!gridRef.current?.contains(e.target as Node)) hidePeek();
        }}
        className="relative flex min-h-0 w-full flex-col"
      >
        <header className="flex shrink-0 flex-col gap-3 px-4 pt-[calc(12px+env(safe-area-inset-top))] sm:px-6 md:pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-heading text-h1 font-bold text-bark">
              {quiz ? "Build your quiz" : writing ? "Build a writing set" : "Build your deck"}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className={`-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`}
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>
          {quiz ? (
            <div role="group" aria-label="Question formats" className="flex flex-wrap gap-2">
              {QUIZ_FORMATS.map((format) => {
                const { from, to } = QUIZ_FORMAT_LABELS[format];
                return (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={formats.includes(format)}
                    aria-label={`${from} to ${to}`}
                    onClick={() => toggleFormat(format)}
                    className={`inline-flex items-center gap-1.5 ${chip(formats.includes(format))}`}
                  >
                    {from}
                    <ArrowRight size={16} aria-hidden="true" />
                    {to}
                  </button>
                );
              })}
            </div>
          ) : writing ? (
            <div>
              <SegmentedControl
                label="Writing style"
                options={(["trace", "recall"] as const).map((id) => ({ id, label: WRITING_STYLE_LABELS[id] }))}
                value={style}
                onChange={setStyle}
              />
            </div>
          ) : (
            <div>
              <DirectionToggle value={direction} onChange={setDirection} />
            </div>
          )}
          <div
            role="group"
            aria-label="Set"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:flex-wrap md:overflow-visible"
          >
            {DECK_SETS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={set === id} onClick={() => chooseSet(id)} className={chip(set === id)}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
          <p className="font-body text-body text-bark-muted" aria-live="polite">
            {setLabel} · {selectedHere} of {words.length} selected
          </p>
          <div className="flex items-center gap-4">
            <button type="button" className={textButton} disabled={!words.length} onClick={() => setAll(true)}>
              Select all
            </button>
            <button type="button" className={textButton} disabled={!selectedHere} onClick={() => setAll(false)}>
              Clear
            </button>
          </div>
        </div>

        <div
          onAnimationEnd={() => setShaking(false)}
          className={`flex min-h-0 flex-1 flex-col ${shaking ? "grid-shake" : ""}`}
        >
          <div
            ref={scrollRef}
            onScroll={(e) => {
              // Only a real move (unfreezing after a long press fires one too).
              if (peek && Math.abs(e.currentTarget.scrollTop - peekScrollTop.current) > 1) setPeek(null);
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-y-[1.5px] border-line px-4 py-3 sm:px-6"
          >
            {!loaded ? (
              <p className="flex items-center justify-center gap-2 py-12 font-body text-body text-bark-muted">
                <LoaderCircle size={20} aria-hidden="true" className="spin" />
                Loading words
              </p>
            ) : data === "error" ? (
              <p role="alert" className="py-12 text-center font-body text-body text-bark">
                Couldn&apos;t load these words.{" "}
                <button
                  type="button"
                  className={`font-medium text-rust-dark underline underline-offset-4 ${FOCUS_RING}`}
                  onClick={() =>
                    setSets((all) => {
                      const rest = { ...all };
                      delete rest[set];
                      return rest;
                    })
                  }
                >
                  Try again
                </button>
              </p>
            ) : words.length === 0 ? (
              <p className="py-12 text-center font-body text-body text-bark-muted">
                {set === "mine"
                  ? "Words you've reviewed show up here."
                  : set === "due"
                    ? "Nothing is due in the next 3 days."
                    : "No words at this level yet."}
              </p>
            ) : (
              <div
                ref={gridRef}
                role="group"
                aria-label={`${setLabel} words`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerEnd(e, false)}
                onPointerCancel={(e) => onPointerEnd(e, true)}
                onPointerOver={onPointerOver}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") hidePeek();
                }}
                onKeyDown={onKeyDown}
                onContextMenu={(e) => e.preventDefault()}
                className="grid touch-pan-y touch-pinch-zoom select-none grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 [-webkit-touch-callout:none]"
              >
                {words.map((word, i) => (
                  <WordTile
                    key={word.id}
                    word={word}
                    index={i}
                    selected={selected.has(word.id)}
                    known={data.inTraining.has(word.id)}
                    focusable={i === Math.min(focusIndex, words.length - 1)}
                    disabled={!canPick(word)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedDue > 0 && (
          <p className="shrink-0 px-4 pt-3 font-body text-body-sm text-bark-muted sm:px-6">
            {selectedDue} of these {selectedDue === 1 ? "is" : "are"} due today.{" "}
            <Link
              href="/training/review"
              onClick={() => save()}
              className={`rounded-sm font-medium text-rust-dark underline underline-offset-4 ${FOCUS_RING}`}
            >
              Do Today&apos;s review
            </Link>{" "}
            to count them.
          </p>
        )}
        <footer className="flex shrink-0 items-center justify-between gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:px-6 md:pb-4">
          <label className="flex cursor-pointer items-center gap-2 font-body text-body font-medium text-bark">
            <input
              type="checkbox"
              checked={shuffleOn}
              onChange={(e) => setShuffleOn(e.target.checked)}
              className="h-5 w-5 accent-rust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-dark"
            />
            Shuffle
          </label>
          <button
            type="button"
            onClick={start}
            aria-disabled={selected.size === 0}
            className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-pill px-5 font-heading text-[19px] font-bold leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 ${
              selected.size === 0
                ? "cursor-default bg-highlight text-bark-muted"
                : "bg-rust text-background hover:bg-rust-dark"
            }`}
          >
            {selected.size === 0
              ? "Pick some words"
              : `Start ${selected.size} ${quiz || writing ? (selected.size === 1 ? "word" : "words") : selected.size === 1 ? "card" : "cards"}`}
          </button>
        </footer>
        <p aria-live="polite" className="sr-only">
          {notice}
        </p>

        {peek && peekWord && (
          <div
            aria-hidden="true"
            style={{ top: peek.top, left: peek.left }}
            className={`pointer-events-none absolute z-10 max-w-48 -translate-x-1/2 rounded-md border-[1.5px] border-line bg-surface-raised px-3 py-2 text-center shadow-float ${
              peek.below ? "" : "-translate-y-full"
            }`}
          >
            <p className="font-body text-body font-medium text-rust-dark">{peekWord.pinyin}</p>
            {peekWord.gloss && <p className="font-body text-body-sm text-bark">{peekWord.gloss}</p>}
            {!canPick(peekWord) && <p className="font-body text-body-sm font-medium text-again-ink">No stroke data</p>}
          </div>
        )}
      </div>
    </dialog>
  );
}
