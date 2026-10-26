"use client";

import { Check, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type Ref } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { devError } from "@/lib/dev";
import type { QueueWord } from "@/lib/training/queue";
import { promptGloss, QUIZ_QUESTION_LABELS, type QuizShowing } from "@/lib/training/quiz";

import { hanziSize, HINT, MISSING_GLOSS, PILL, REDUCED_TRANSITION_MS, SURFACE, TRANSITION_MS } from "./FlashCard";
import { useReducedMotion } from "./hooks";

const CARD_HEIGHT = "h-[clamp(200px,30dvh,248px)]";
/** The question fading out before the next one rises. Matches .quiz-leave. */
const LEAVE_MS = 200;
/** Gloss options longer than this wrap a lot on the narrowest phones,
 *  which then get one column. */
const LONG_OPTION = 16;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const OPTION = `relative flex min-h-16 min-w-0 items-center justify-center rounded-[16px] border-[1.5px] border-b-4 px-4 py-2 text-center transition-[opacity,background-color,border-color,translate] duration-150 motion-reduce:transition-none ${FOCUS_RING}`;
const OPTION_STATES = {
  open: "border-line bg-surface-raised text-bark hover:bg-highlight/50 active:translate-y-0.5 active:border-b-2 motion-reduce:active:translate-y-0 motion-reduce:active:border-b-4",
  right: "border-deep-grass bg-good-tint text-good-ink",
  wrong: "option-shake border-again-line bg-again-tint text-again-ink",
  dimmed: "border-line bg-surface-raised text-bark opacity-50",
};

export type QuizAnswer = { picked: number; right: boolean };

function wordLine(word: QueueWord) {
  return `${word.simplified}, ${word.pinyin}, ${word.gloss ?? MISSING_GLOSS}`;
}

/**
 * One question: the label, the prompt card on its stack, the four options
 * and, once answered, the feedback bar with Continue. Presentational; the
 * stage owns the answer and the timing.
 */
export function QuizQuestion({
  word,
  quiz,
  remaining,
  answer,
  leaving,
  promptRef,
  continueRef,
  onPick,
  onContinue,
}: {
  word: QueueWord;
  quiz: QuizShowing;
  /** Cards left in the run, this one included, for the stack. */
  remaining: number;
  answer: QuizAnswer | null;
  leaving: boolean;
  promptRef: Ref<HTMLDivElement>;
  continueRef: Ref<HTMLButtonElement>;
  onPick: (id: number) => void;
  onContinue: () => void;
}) {
  const label = QUIZ_QUESTION_LABELS[quiz.format];
  const gloss = word.gloss ?? MISSING_GLOSS;
  const prompt =
    quiz.format === "meaning" ? word.simplified : quiz.format === "hanzi" ? promptGloss(gloss, word.simplified) : word.pinyin;
  const hanziOptions = quiz.format !== "meaning";
  const longOptions = !hanziOptions && quiz.options.some((o) => o.text.length > LONG_OPTION);
  const shape = `absolute inset-x-0 top-0 origin-bottom ${CARD_HEIGHT} ${SURFACE}`;
  const motion = leaving ? "quiz-leave" : "quiz-in";

  function optionState(id: number) {
    if (!answer) return OPTION_STATES.open;
    if (id === word.id) return OPTION_STATES.right;
    return id === answer.picked ? OPTION_STATES.wrong : OPTION_STATES.dimmed;
  }

  return (
    <>
      <div
        ref={promptRef}
        tabIndex={-1}
        role="group"
        aria-label={`${label} ${prompt}`}
        className="mx-auto flex w-full max-w-md flex-col gap-2 outline-none"
      >
        <p aria-hidden="true" className={`text-center font-body text-body font-medium text-bark-muted ${motion}`}>
          {label}
        </p>
        <div className="relative w-full pb-5">
          {remaining > 2 && <div aria-hidden="true" className={`${shape} translate-y-5 scale-90`} />}
          {remaining > 1 && <div aria-hidden="true" className={`${shape} translate-y-2.5 scale-95`} />}
          <div className={`relative flex flex-col p-5 ${CARD_HEIGHT} ${SURFACE} ${leaving ? "quiz-leave" : "card-rise"}`}>
            <div aria-hidden="true" className="flex justify-end">
              <span className={`${PILL} bg-highlight text-bark`}>HSK {word.hsk_level}</span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center text-center">
              {quiz.format === "meaning" ? (
                <p
                  aria-hidden="true"
                  lang="zh-CN"
                  className={`font-hanzi font-medium leading-[1.15] wrap-break-word text-bark ${hanziSize(word.simplified)}`}
                >
                  {word.simplified}
                </p>
              ) : quiz.format === "hanzi" ? (
                <p aria-hidden="true" className="max-w-full font-body text-[24px] font-medium leading-8 wrap-break-word text-bark">
                  {prompt}
                </p>
              ) : (
                <div className="flex items-center gap-1">
                  <p aria-hidden="true" className="font-body text-[34px] font-medium leading-11 text-rust-dark">
                    {word.pinyin}
                  </p>
                  <AudioButton text={word.simplified} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-label="Answers"
        className={`mx-auto grid w-full max-w-md grid-cols-2 gap-3 ${longOptions ? "max-[359px]:grid-cols-1" : ""} ${motion}`}
      >
        {quiz.options.map((option, i) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.id)}
            aria-disabled={answer !== null}
            aria-keyshortcuts={String(i + 1)}
            className={`${OPTION} ${optionState(option.id)}`}
          >
            <span
              aria-hidden="true"
              className="absolute left-2.5 top-1.5 hidden font-body text-[12px] font-medium leading-4 opacity-70 lg:block"
            >
              {i + 1}
            </span>
            {hanziOptions ? (
              <span lang="zh-CN" className="font-hanzi text-[28px] font-medium leading-9 wrap-break-word">
                {option.text}
              </span>
            ) : (
              <span className="font-body text-[16px] font-medium leading-6 wrap-break-word">{option.text}</span>
            )}
            {answer && option.id === word.id && <span className="sr-only">, right answer</span>}
            {answer && !answer.right && option.id === answer.picked && <span className="sr-only">, your answer</span>}
          </button>
        ))}
      </div>

      {/* Room for the feedback bar from the start, so nothing jumps when
          it shows. */}
      <div className="mx-auto min-h-44 w-full max-w-md">
        {answer ? (
          <div className={`rounded-[18px] p-4 ${answer.right ? "bg-good-tint" : "bg-again-tint"} ${motion}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={`flex items-center gap-1.5 font-heading text-h2 font-bold ${
                    answer.right ? "text-good-ink" : "text-again-ink"
                  }`}
                >
                  {answer.right ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : <X size={20} strokeWidth={3} aria-hidden="true" />}
                  {answer.right ? "Nice!" : "Not quite"}
                </p>
                <p className="mt-0.5 font-body text-body wrap-break-word text-bark">
                  <span lang="zh-CN" className="font-hanzi font-medium">
                    {word.simplified}
                  </span>{" "}
                  {word.pinyin} · {gloss}
                </p>
              </div>
              <AudioButton text={word.simplified} />
            </div>
            <button
              ref={continueRef}
              type="button"
              onClick={onContinue}
              className={`mt-3 flex h-12 w-full items-center justify-center rounded-pill font-heading text-h3 font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 ${
                answer.right
                  ? "bg-got-it hover:bg-got-it-strong focus-visible:ring-offset-good-tint"
                  : "bg-miss hover:bg-miss-strong focus-visible:ring-offset-again-tint"
              }`}
            >
              Continue
            </button>
          </div>
        ) : (
          <p className={HINT}>1 to 4 to answer · Enter to continue</p>
        )}
      </div>
    </>
  );
}

type Phase = "rising" | "asking" | "answered" | "leaving";

/**
 * A quiz question on the card stack. Picking an option answers it: the
 * result shows right away while `onAnswer` saves it; Continue (or Enter or
 * Space) fades the question out, runs the commit (the parent moves on) and
 * the next question rises from the stack. A failed save (`onAnswer`
 * resolves to null) opens the same question again. Same contract as
 * CardStage, so a session can show either.
 */
export function QuizStage({
  word,
  quiz,
  remaining,
  onAnswer,
}: {
  word: QueueWord;
  quiz: QuizShowing;
  remaining: number;
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
}) {
  const reducedMotion = useReducedMotion();
  const riseMs = reducedMotion ? REDUCED_TRANSITION_MS : TRANSITION_MS;

  const [answer, setAnswer] = useState<QuizAnswer | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [questionKey, setQuestionKey] = useState(0);

  const phase = useRef<Phase>("rising");
  const mounted = useRef(false);
  const shownAt = useRef(0);
  const pending = useRef<Promise<(() => void) | null> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Each question rises in and takes answers once it's up. Keyboard focus
  // moves to it unless the user is somewhere else on the page.
  useEffect(() => {
    phase.current = "rising";
    shownAt.current = performance.now();
    const active = document.activeElement;
    if (!active || active === document.body || stageRef.current?.contains(active)) {
      promptRef.current?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(() => {
      if (phase.current === "rising") phase.current = "asking";
    }, riseMs);
    return () => window.clearTimeout(timer);
  }, [questionKey, riseMs]);

  function pick(id: number) {
    if (phase.current !== "asking") return;
    phase.current = "answered";
    const right = id === word.id;
    setAnswer({ picked: id, right });
    const duration = performance.now() - shownAt.current;
    const saving = onAnswer(right, duration)
      .catch((error) => {
        devError("QuizStage: onAnswer threw; the same question opens again.", error);
        return null;
      })
      .then((commit) => {
        if (!commit && mounted.current && pending.current === saving) {
          pending.current = null;
          phase.current = "asking";
          setAnswer(null);
          promptRef.current?.focus({ preventScroll: true });
        }
        return commit;
      });
    pending.current = saving;
  }

  // Continue takes focus once the result shows.
  useEffect(() => {
    if (answer) continueRef.current?.focus({ preventScroll: true });
  }, [answer]);

  async function next() {
    if (phase.current !== "answered" || !pending.current) return;
    phase.current = "leaving";
    setLeaving(true);
    const [commit] = await Promise.all([
      pending.current,
      new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? REDUCED_TRANSITION_MS : LEAVE_MS)),
    ]);
    if (!mounted.current) return;
    setLeaving(false);
    if (!commit) return;
    pending.current = null;
    commit();
    setAnswer(null);
    setQuestionKey((k) => k + 1);
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= quiz.options.length) {
      if (phase.current !== "asking") return;
      e.preventDefault();
      pick(quiz.options[n - 1].id);
    } else if (e.key === "Enter" || e.key === " ") {
      // A focused button or link (Continue included) acts on its own.
      if (phase.current !== "answered" || target?.closest("button, a")) return;
      e.preventDefault();
      void next();
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const announcement = answer
    ? answer.right
      ? `Right. ${wordLine(word)}.`
      : `Not quite. The answer is ${wordLine(word)}.`
    : "";

  return (
    <div ref={stageRef} className="flex flex-1 flex-col justify-center gap-5">
      <div key={questionKey} className="contents">
        <QuizQuestion
          word={word}
          quiz={quiz}
          remaining={remaining}
          answer={answer}
          leaving={leaving}
          promptRef={promptRef}
          continueRef={continueRef}
          onPick={pick}
          onContinue={() => void next()}
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
