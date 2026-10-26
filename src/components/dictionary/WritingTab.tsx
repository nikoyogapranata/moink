"use client";

import { ChevronLeft, ChevronRight, Pause, Pencil, Play, RotateCcw, Square } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  loadHanziWriter,
  loadStrokes,
  tokenColor,
  type CharacterStrokes,
  type HanziWriterClass,
} from "@/lib/dictionary/strokes";
import { hanziOf } from "@/lib/dictionary/words";

const BOX = 180;
const BOX_PADDING = 10;
const FRAME = 100;
const FRAME_PADDING = 6;
const CHEER_BAO = { src: "/images/mascot/bao/feature-3-celebrate.webp", width: 776, height: 900 };

type Mode = "idle" | "playing" | "quiz";

type Loaded =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; strokes: CharacterStrokes; HanziWriter: HanziWriterClass };

/** Practice grid: border, center cross, diagonals, in the line token. */
export function GuideLines({ size }: { size: number }) {
  const m = size / 2;
  return (
    <g stroke="var(--color-line)" strokeWidth={1}>
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} fill="none" />
      <line x1={0} y1={m} x2={size} y2={m} strokeDasharray="4 4" />
      <line x1={m} y1={0} x2={m} y2={size} strokeDasharray="4 4" />
      <line x1={0} y1={0} x2={size} y2={size} strokeDasharray="4 4" />
      <line x1={size} y1={0} x2={0} y2={size} strokeDasharray="4 4" />
    </g>
  );
}

/** Strokes 0..upTo-1 over a faint outline of the whole character. With
 *  `newestInRust`, the last of them is rust and the rest bark. */
function StrokePaths({
  strokes,
  upTo,
  transform,
  outline,
  newestInRust = false,
}: {
  strokes: string[];
  upTo: number;
  transform: string;
  outline: boolean;
  newestInRust?: boolean;
}) {
  return (
    <g transform={transform}>
      {outline &&
        strokes.map((d, i) => (
          <path key={`o${i}`} d={d} fill="var(--color-bark)" fillOpacity={0.12} />
        ))}
      {strokes.slice(0, upTo).map((d, i) => (
        <path
          key={i}
          d={d}
          fill={newestInRust && i === upTo - 1 ? "var(--color-rust)" : "var(--color-bark)"}
        />
      ))}
    </g>
  );
}

function CharacterWriter({ char }: { char: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  const [quizDone, setQuizDone] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<InstanceType<HanziWriterClass> | null>(null);
  // Bumped to cancel a running playback.
  const runRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const runs = runRef;
    const writer = writerRef;
    Promise.all([loadStrokes(char), loadHanziWriter()]).then(([strokes, HanziWriter]) => {
      if (cancelled) return;
      if (!strokes) {
        setLoaded({ status: "missing" });
        return;
      }
      setLoaded({ status: "ready", strokes, HanziWriter });
      setStep(strokes.strokes.length);
    });
    return () => {
      cancelled = true;
      runs.current++;
      writer.current?.cancelQuiz();
      writer.current = null;
    };
  }, [char]);

  if (loaded.status === "loading") {
    return (
      <div
        aria-hidden="true"
        className="mx-auto h-45 w-45 rounded-lg bg-highlight/50 motion-safe:animate-pulse"
      />
    );
  }
  if (loaded.status === "missing") {
    return (
      <p className="rounded-lg border-[1.5px] border-dashed border-line p-6 text-center font-body text-body text-bark-muted">
        Stroke order isn&apos;t available for this character
      </p>
    );
  }

  const { strokes, HanziWriter } = loaded;
  const total = strokes.strokes.length;
  const boxTransform = HanziWriter.getScalingTransform(BOX, BOX, BOX_PADDING).transform;
  const frameTransform = HanziWriter.getScalingTransform(FRAME, FRAME, FRAME_PADDING).transform;

  function clearOverlay() {
    runRef.current++;
    writerRef.current?.cancelQuiz();
    writerRef.current = null;
    if (overlayRef.current) overlayRef.current.innerHTML = "";
  }

  function createWriter(options: Record<string, unknown>) {
    const container = overlayRef.current;
    if (!container) return null;
    container.innerHTML = "";
    const writer = HanziWriter.create(container, char, {
      width: BOX,
      height: BOX,
      padding: BOX_PADDING,
      showCharacter: false,
      showOutline: false,
      strokeColor: tokenColor("--color-bark"),
      // Already loaded: hand it over instead of fetching again.
      charDataLoader: (_c: string, onLoad: (d: CharacterStrokes) => void) => onLoad(strokes),
      ...options,
    });
    writerRef.current = writer;
    return writer;
  }

  /** Animate from the current step (or from the start, if complete). The
   *  static layer under the overlay keeps finished strokes, so the step
   *  label and the box stay in sync stroke by stroke. */
  async function play() {
    clearOverlay();
    const run = runRef.current;
    const start = step >= total ? 0 : step;
    setStep(start);
    setMode("playing");
    const writer = createWriter({ strokeAnimationSpeed: 1 });
    if (!writer) return;
    for (let i = start; i < total; i++) {
      await new Promise<void>((resolve) => {
        writer.animateStroke(i, { onComplete: () => resolve() });
      });
      if (runRef.current !== run) return;
      setStep(i + 1);
      await new Promise((r) => setTimeout(r, 180));
      if (runRef.current !== run) return;
    }
    clearOverlay();
    setMode("idle");
  }

  function pause() {
    clearOverlay();
    setMode("idle");
  }

  function goTo(n: number) {
    clearOverlay();
    setMode("idle");
    setStep(Math.max(0, Math.min(total, n)));
  }

  function startQuiz() {
    clearOverlay();
    setMode("quiz");
    setQuizDone(0);
    setQuizComplete(false);
    const writer = createWriter({
      showOutline: true,
      outlineColor: tokenColor("--color-bark", 0.12),
      drawingColor: tokenColor("--color-rust-dark"),
      highlightColor: tokenColor("--color-rust"),
      drawingWidth: 6,
    });
    writer?.quiz({
      showHintAfterMisses: 2,
      onCorrectStroke: (data) => setQuizDone(data.strokeNum + 1),
      onComplete: () => setQuizComplete(true),
    });
  }

  function stopQuiz() {
    clearOverlay();
    setMode("idle");
    setStep(total);
  }

  const shownStep = mode === "quiz" ? quizDone : step;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-45 w-45">
          <svg
            viewBox={`0 0 ${BOX} ${BOX}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={
              mode === "quiz"
                ? `Practice writing ${char}`
                : `${char}, stroke ${step} of ${total}`
            }
          >
            <GuideLines size={BOX} />
            {mode !== "quiz" && (
              <StrokePaths strokes={strokes.strokes} upTo={step} transform={boxTransform} outline />
            )}
          </svg>
          {/* hanzi-writer draws here while playing or practicing. */}
          <div ref={overlayRef} className="absolute inset-0" />
        </div>

        <p aria-live="polite" className="font-body text-body text-bark-muted">
          Stroke {shownStep} of {total}
        </p>

        {mode === "quiz" ? (
          <div className="flex flex-col items-center gap-3">
            {quizComplete ? (
              <div className="flex items-center gap-3">
                <Image
                  src={CHEER_BAO.src}
                  alt=""
                  width={CHEER_BAO.width}
                  height={CHEER_BAO.height}
                  className="h-14 w-auto"
                />
                <p className="font-heading text-h2 font-bold text-bark">Nice!</p>
              </div>
            ) : (
              <p className="font-body text-body text-bark">Trace each stroke in order.</p>
            )}
            <div className="flex gap-2">
              {quizComplete && (
                <button type="button" onClick={startQuiz} className={PILL_BUTTON}>
                  <RotateCcw size={18} aria-hidden="true" />
                  Try again
                </button>
              )}
              <button type="button" onClick={stopQuiz} className={PILL_BUTTON}>
                <Square size={16} aria-hidden="true" />
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              aria-label="Previous stroke"
              className={ICON_BUTTON}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={mode === "playing" ? pause : play}
              aria-label={mode === "playing" ? "Pause" : "Play stroke order"}
              className={`${ICON_BUTTON} h-12 w-12 bg-highlight text-bark`}
            >
              {mode === "playing" ? (
                <Pause size={20} aria-hidden="true" />
              ) : (
                <Play size={20} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => goTo(step + 1)}
              disabled={step >= total}
              aria-label="Next stroke"
              className={ICON_BUTTON}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {mode !== "quiz" && (
        <button type="button" onClick={startQuiz} className={`${PILL_BUTTON} self-center`}>
          <Pencil size={18} aria-hidden="true" />
          Practice writing
        </button>
      )}

      <div>
        <h3 className="mb-2 font-body text-body font-medium text-bark">Step by step</h3>
        <ol className="grid grid-cols-4 gap-2 lg:grid-cols-5">
          {strokes.strokes.map((_, i) => {
            const n = i + 1;
            const current = mode !== "quiz" && step === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => goTo(n)}
                  aria-label={`Show strokes 1 to ${n}`}
                  aria-current={current ? "step" : undefined}
                  className={`relative block w-full rounded-md border-[1.5px] bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust ${
                    current ? "border-rust" : "border-line hover:border-bark/30"
                  }`}
                >
                  <svg viewBox={`0 0 ${FRAME} ${FRAME}`} className="block aspect-square w-full" aria-hidden="true">
                    <StrokePaths
                      strokes={strokes.strokes}
                      upTo={n}
                      transform={frameTransform}
                      outline={false}
                      newestInRust
                    />
                  </svg>
                  <span className="absolute left-1.5 top-1 font-body text-[12px] leading-4 text-bark-muted">
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const ICON_BUTTON =
  "inline-flex h-10 w-10 items-center justify-center rounded-full text-bark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-40 disabled:hover:bg-transparent";
const PILL_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-5 font-heading text-body font-medium text-bark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/** Writing tab: a chip per hanzi, then the selected character's box,
 *  controls and step grid. */
export function WritingTab({
  word,
  radicals,
}: {
  word: string;
  radicals: Record<string, string>;
}) {
  const chars = hanziOf(word);
  const [index, setIndex] = useState(0);
  const [strokeCounts, setStrokeCounts] = useState<Record<string, number>>({});
  const char = chars[Math.min(index, chars.length - 1)];

  useEffect(() => {
    let cancelled = false;
    Promise.all(chars.map((c) => loadStrokes(c).then((d) => [c, d?.strokes.length ?? 0] as const))).then(
      (entries) => {
        if (!cancelled) setStrokeCounts(Object.fromEntries(entries));
      },
    );
    return () => {
      cancelled = true;
    };
    // chars is derived from word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  if (!char) {
    return (
      <p className="font-body text-body text-bark-muted">
        Stroke order isn&apos;t available for this word
      </p>
    );
  }

  const count = strokeCounts[char];
  const radical = radicals[char];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chars.length > 1 && (
          <div className="flex gap-2" role="group" aria-label="Character">
            {chars.map((c, i) => (
              <button
                key={`${c}${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                className={`h-11 min-w-11 rounded-md border-[1.5px] px-2 font-hanzi text-h2 text-bark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust ${
                  i === index ? "border-rust bg-rust/10" : "border-line hover:border-bark/30"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <p className="font-body text-body text-bark">
          <span className="font-hanzi">{char}</span>
          {count ? ` · ${count} strokes` : ""}
          {radical && (
            <span className="text-bark-muted">
              {" "}
              · Radical <span className="font-hanzi">{radical}</span>
            </span>
          )}
        </p>
      </div>

      <CharacterWriter key={char} char={char} />
    </div>
  );
}
