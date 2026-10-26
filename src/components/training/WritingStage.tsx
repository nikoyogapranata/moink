"use client";

import { Lightbulb } from "lucide-react";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { GuideLines } from "@/components/dictionary/WritingTab";
import { Button } from "@/components/ui/Button";
import { devError } from "@/lib/dev";
import { loadHanziWriter, loadStrokes, tokenColor, type CharacterStrokes, type HanziWriterClass } from "@/lib/dictionary/strokes";
import type { QueueWord } from "@/lib/training/queue";
import { allowedMistakes, RECALL_HINT_AFTER, recallGotIt, TRACE_HINT_AFTER } from "@/lib/training/writing";

import { MISSING_GLOSS, REDUCED_TRANSITION_MS } from "./FlashCard";
import { useReducedMotion } from "./hooks";
import { ResultBar } from "./QuizStage";

/** The Hint button shows the outline this long. */
const HINT_MS = 1200;
/** A finished character stays up this long before the next one. */
const NEXT_CHAR_MS = 350;
/** The word fading out before the next one rises. Matches .quiz-leave. */
const LEAVE_MS = 200;
/** The guide grid's own units; it scales with the box. */
const GRID = 300;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
const CONTROL = `inline-flex h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-4 font-body text-body font-medium text-bark transition-colors hover:bg-highlight/60 disabled:opacity-50 ${FOCUS_RING}`;

type Writer = InstanceType<HanziWriterClass>;

export interface PadHandle {
  /** Shows the outline for HINT_MS. */
  flashHint(): void;
  /** Stops the quiz and draws the whole character. */
  showAnswer(): Promise<void>;
}

/**
 * hanzi-writer's quiz for one character in a square box. Trace shows the
 * outline and hints after 1 miss; Recall hides it and hints after 3.
 * Remount it (a new key) for each character.
 */
function WritingPad({
  ref,
  char,
  strokes,
  HanziWriter,
  trace,
  onMistake,
  onAutoHint,
  onComplete,
}: {
  ref: Ref<PadHandle>;
  char: string;
  strokes: CharacterStrokes;
  HanziWriter: HanziWriterClass;
  trace: boolean;
  onMistake: () => void;
  onAutoHint: () => void;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<Writer | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);

  const mistake = useEffectEvent((mistakesOnStroke: number) => {
    onMistake();
    if (!trace && mistakesOnStroke === RECALL_HINT_AFTER) onAutoHint();
  });
  const complete = useEffectEvent(() => onComplete());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      devError("WritingPad: the box ref is null, so the writer can't start.");
      return;
    }
    const size = container.clientWidth;
    container.innerHTML = "";
    const writer = HanziWriter.create(container, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.06),
      showCharacter: false,
      showOutline: trace,
      strokeColor: tokenColor("--color-bark"),
      outlineColor: tokenColor("--color-bark", 0.14),
      drawingColor: tokenColor("--color-rust-dark"),
      highlightColor: tokenColor("--color-rust"),
      drawingWidth: Math.max(4, Math.round(size / 45)),
      strokeFadeDuration: reducedMotion ? 0 : 400,
      // "I don't know" draws the character: quick, so the answer isn't a wait.
      strokeAnimationSpeed: 1.6,
      delayBetweenStrokes: 150,
      strokeHighlightSpeed: reducedMotion ? 20 : 2,
      // Already loaded: hand it over instead of fetching again.
      charDataLoader: (_c: string, onLoad: (d: CharacterStrokes) => void) => onLoad(strokes),
    } as Record<string, unknown>);
    writerRef.current = writer;
    void writer.quiz({
      showHintAfterMisses: trace ? TRACE_HINT_AFTER : RECALL_HINT_AFTER,
      highlightOnComplete: !reducedMotion,
      onMistake: (data) => mistake(data.mistakesOnStroke),
      onComplete: () => complete(),
    });
    return () => {
      window.clearTimeout(hintTimer.current);
      writer.cancelQuiz();
      writerRef.current = null;
      container.innerHTML = "";
    };
  }, [HanziWriter, char, strokes, trace, reducedMotion]);

  useImperativeHandle(ref, () => ({
    flashHint() {
      const writer = writerRef.current;
      if (!writer) return;
      window.clearTimeout(hintTimer.current);
      const duration = reducedMotion ? 0 : 150;
      void writer.showOutline({ duration });
      hintTimer.current = window.setTimeout(() => void writerRef.current?.hideOutline({ duration }), HINT_MS);
    },
    async showAnswer() {
      const writer = writerRef.current;
      if (!writer) return;
      window.clearTimeout(hintTimer.current);
      writer.cancelQuiz();
      // The strokes in order: the animation is what shows the answer.
      await new Promise<void>((resolve) => {
        void writer.animateCharacter({ onComplete: () => resolve() });
      });
    },
  }));

  return <div ref={containerRef} data-writing-pad className="absolute inset-0" />;
}

type Phase = "loading" | "missing" | "trace" | "traced" | "recall" | "answered" | "leaving";

type Loaded = { strokes: CharacterStrokes[]; HanziWriter: HanziWriterClass } | null;

function mistakesText(n: number) {
  return `${n} ${n === 1 ? "mistake" : "mistakes"}`;
}

/**
 * One word on the writing pad: Trace first (when `trace`), then Recall,
 * one character at a time. Only the recall is graded and passed to
 * `onAnswer` (Got it within allowedMistakes with no hint and no "I don't
 * know"); Continue then fades the word out and runs the commit. A failed
 * save (`onAnswer` resolves to null) starts the recall again. Mount one
 * per showing (a new key).
 */
export function WritingStage({
  word,
  trace,
  onAnswer,
  onSkip,
}: {
  word: QueueWord;
  trace: boolean;
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
  /** The word can't be written (no stroke data): move on, saving nothing. */
  onSkip: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const chars = [...word.simplified];

  const [loaded, setLoaded] = useState<Loaded>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [startWithTrace] = useState(trace);
  // Whether the pad is tracing (fixed for an attempt, so finishing a trace
  // doesn't swap the pad before Recall it).
  const [tracing, setTracing] = useState(trace);
  const [index, setIndex] = useState(0);
  // Characters written by the user (the rest, after "I don't know", were
  // shown).
  const [written, setWritten] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [gotIt, setGotIt] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const mounted = useRef(false);
  const shownAt = useRef(0);
  const pending = useRef<Promise<(() => void) | null> | null>(null);
  const padRef = useRef<PadHandle>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const nextCharTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(nextCharTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([Promise.all([...word.simplified].map(loadStrokes)), loadHanziWriter()])
      .then(([strokes, HanziWriter]) => {
        if (cancelled) return;
        if (strokes.some((s) => !s)) {
          devError(`WritingStage: no stroke data for a character of ${word.simplified}; it's skipped.`);
          setPhase("missing");
          return;
        }
        setLoaded({ strokes: strokes as CharacterStrokes[], HanziWriter });
        setPhase(startWithTrace ? "trace" : "recall");
        shownAt.current = performance.now();
      })
      .catch((error) => {
        if (cancelled) return;
        devError(`WritingStage: loading ${word.simplified} failed; it's skipped.`, error);
        setPhase("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [word.simplified, startWithTrace]);

  // The next action takes focus: Recall it, then Continue.
  useEffect(() => {
    if (phase === "traced") actionRef.current?.focus({ preventScroll: true });
    if (phase === "answered") continueRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const totalStrokes = loaded ? loaded.strokes.reduce((n, s) => n + s.strokes.length, 0) : 0;
  const drawing = phase === "trace" || phase === "recall";

  function startRecall() {
    if (phase !== "traced") return;
    setPhase("recall");
    setTracing(false);
    setIndex(0);
    setWritten(0);
    setMistakes(0);
    setUsedHint(false);
    setAttempt((a) => a + 1);
    shownAt.current = performance.now();
  }

  function finishRecall(result: { mistakes: number; usedHint: boolean; gaveUp: boolean }) {
    const right = recallGotIt({ ...result, totalStrokes });
    setGotIt(right);
    setPhase("answered");
    const duration = performance.now() - shownAt.current;
    const saving = onAnswer(right, duration)
      .catch((error) => {
        devError("WritingStage: onAnswer threw; the recall starts again.", error);
        return null;
      })
      .then((commit) => {
        if (!commit && mounted.current && pending.current === saving) {
          pending.current = null;
          setPhase("recall");
          setGotIt(null);
          setIndex(0);
          setWritten(0);
          setMistakes(0);
          setUsedHint(false);
          setGaveUp(false);
          setAttempt((a) => a + 1);
          shownAt.current = performance.now();
        }
        return commit;
      });
    pending.current = saving;
  }

  function onCharComplete() {
    const next = index + 1;
    setWritten(next);
    if (next < chars.length) {
      nextCharTimer.current = window.setTimeout(() => setIndex(next), reducedMotion ? 0 : NEXT_CHAR_MS);
      return;
    }
    if (phase === "trace") setPhase("traced");
    else finishRecall({ mistakes, usedHint, gaveUp: false });
  }

  function hint() {
    if (phase !== "recall" || busy) return;
    padRef.current?.flashHint();
    setUsedHint(true);
  }

  async function dontKnow() {
    if (phase !== "recall" || busy) return;
    setBusy(true);
    setGaveUp(true);
    await padRef.current?.showAnswer();
    if (!mounted.current) return;
    setBusy(false);
    finishRecall({ mistakes, usedHint, gaveUp: true });
  }

  async function next() {
    if (phase !== "answered" || !pending.current) return;
    setPhase("leaving");
    const [commit] = await Promise.all([
      pending.current,
      new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? REDUCED_TRANSITION_MS : LEAVE_MS)),
    ]);
    if (!mounted.current || !commit) return;
    pending.current = null;
    commit();
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    if (e.key === "h" || e.key === "H") {
      if (phase !== "recall") return;
      e.preventDefault();
      hint();
    } else if (e.key === "Enter") {
      // A focused button or link acts on its own.
      if (target?.closest("button, a")) return;
      if (phase === "traced") {
        e.preventDefault();
        startRecall();
      } else if (phase === "answered") {
        e.preventDefault();
        void next();
      }
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const recallLike = phase === "recall" || phase === "answered" || phase === "leaving";
  const label = recallLike ? "Write this word from memory" : "Trace this word";
  const motion = phase === "leaving" ? "quiz-leave" : "quiz-in";
  const detail = [mistakesText(mistakes), usedHint && "used a hint", gaveUp && "showed the answer"].filter(Boolean).join(" · ");
  const announcement =
    phase === "traced"
      ? "Traced. Now write it from memory."
      : phase === "answered" || phase === "leaving"
        ? `${gotIt ? "Got it" : "Still learning"}. ${detail}. ${word.simplified}, ${word.pinyin}, ${word.gloss ?? MISSING_GLOSS}.`
        : drawing && written > 0
          ? `${written} of ${chars.length} written.`
          : "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className={`flex w-full max-w-md flex-col items-center gap-1 text-center ${motion}`}>
        <p className="font-body text-body font-medium text-bark-muted">{label}</p>
        <p className="font-body text-[22px] font-medium leading-8 wrap-break-word text-bark">{word.gloss ?? MISSING_GLOSS}</p>
        <div className="flex items-center gap-1">
          <p className="font-body text-h2 font-medium text-rust-dark">{word.pinyin}</p>
          <AudioButton text={word.simplified} />
        </div>
      </div>

      <ol aria-label="Characters" className={`flex flex-wrap justify-center gap-2 ${motion}`}>
        {chars.map((c, i) => {
          const done = i < written;
          const shown = done || i < index || (recallLike && gaveUp) || phase === "traced";
          const current = drawing && i === index;
          const text = shown || phase === "trace" ? c : "?";
          return (
            <li
              key={`${c}${i}`}
              className={`flex h-12 w-12 items-center justify-center rounded-[12px] border-[1.5px] font-hanzi text-[26px] font-medium ${
                current
                  ? "border-rust bg-surface-raised text-bark"
                  : done && (phase !== "answered" || gotIt) && !(gaveUp && i >= written)
                    ? "border-deep-grass bg-good-tint text-good-ink"
                    : shown
                      ? "border-line bg-surface-raised text-bark"
                      : "border-line bg-surface-raised text-bark-muted"
              }`}
            >
              <span aria-hidden="true" lang="zh-CN">
                {text}
              </span>
              <span className="sr-only">
                {`Character ${i + 1} of ${chars.length}: `}
                {done ? `written, ${c}` : current ? "writing now" : shown ? c : "not written yet"}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        className={`relative aspect-square w-[min(82vw,300px)] touch-none select-none overflow-hidden rounded-[16px] border-[1.5px] border-line bg-surface-raised ${
          phase === "leaving" ? "quiz-leave" : "card-rise"
        }`}
      >
        <svg viewBox={`0 0 ${GRID} ${GRID}`} aria-hidden="true" className="absolute inset-0 h-full w-full">
          <GuideLines size={GRID} />
        </svg>
        {loaded && phase !== "missing" && phase !== "loading" && (
          <WritingPad
            key={`${attempt}:${index}`}
            ref={padRef}
            char={chars[index]}
            strokes={loaded.strokes[index]}
            HanziWriter={loaded.HanziWriter}
            trace={tracing}
            onMistake={() => setMistakes((m) => m + 1)}
            onAutoHint={() => setUsedHint(true)}
            onComplete={onCharComplete}
          />
        )}
        {phase === "loading" && <div aria-hidden="true" className="absolute inset-6 rounded-lg bg-highlight/40 motion-safe:animate-pulse" />}
      </div>
      <p className="sr-only">
        Writing needs a mouse, pen or touch screen. In Recall, I don&apos;t know shows the strokes.
      </p>

      <div className="flex min-h-11 w-full max-w-md flex-col items-center gap-3">
        {phase === "missing" ? (
          <div className="flex flex-col items-center gap-3">
            <p className="font-body text-body text-bark">Stroke order isn&apos;t available for this word.</p>
            <Button onClick={onSkip}>Skip it</Button>
          </div>
        ) : phase === "trace" ? (
          <p className="font-body text-body text-bark-muted">Trace each stroke in order.</p>
        ) : phase === "recall" ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={hint} disabled={busy} aria-keyshortcuts="H" className={CONTROL}>
              <Lightbulb size={18} aria-hidden="true" />
              Hint
            </button>
            <button type="button" onClick={() => void dontKnow()} disabled={busy} className={CONTROL}>
              I don&apos;t know
            </button>
            <p className="px-2 font-body text-body tabular-nums text-bark-muted">
              {mistakesText(mistakes)}
              <span className="sr-only"> of {allowedMistakes(totalStrokes)} allowed</span>
            </p>
          </div>
        ) : phase === "traced" ? (
          <div className="flex w-full flex-col gap-3 rounded-[18px] bg-highlight p-4 quiz-in sm:flex-row sm:items-center sm:justify-between">
            <p className="font-heading text-h3 font-bold text-rust-dark">Traced · now try it from memory</p>
            <Button ref={actionRef} onClick={startRecall}>
              Recall it
            </Button>
          </div>
        ) : phase === "answered" || phase === "leaving" ? (
          <ResultBar
            right={gotIt === true}
            title={gotIt ? "Got it" : "Still learning"}
            detail={detail}
            word={word}
            continueRef={continueRef}
            onContinue={() => void next()}
            className={`w-full ${motion}`}
          />
        ) : null}
        {phase === "recall" && (
          <p className="hidden font-body text-[13px] leading-5 text-bark-muted lg:block">H for a hint · Enter to continue once it&apos;s written</p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
