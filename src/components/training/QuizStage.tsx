"use client";

import { Check, Snail, Volume2, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type Ref } from "react";

import { AudioButton } from "@/components/dictionary/AudioButton";
import { NORMAL_RATE, SLOW_RATE, speak, stopSpeaking, useChineseVoiceStatus, type VoiceStatus } from "@/lib/dictionary/speech";
import { devError } from "@/lib/dev";
import type { QueueWord } from "@/lib/training/queue";
import { isListenFormat, promptGloss, QUESTION_LABELS, type ListenShowing, type QuizShowing, type Showing } from "@/lib/training/quiz";

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

const CONTROL = `inline-flex h-11 items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface-raised px-4 font-body text-body font-medium text-bark transition-colors hover:bg-highlight/60 disabled:opacity-50 ${FOCUS_RING}`;

export type QuizAnswer = { picked: number; right: boolean };

/** A listening question's audio: whether it's speaking, whether it has
 *  played yet (answers wait for that), and the two buttons. */
export interface ListenControls {
  status: VoiceStatus;
  speaking: boolean;
  heard: boolean;
  onPlay: () => void;
  onSlow: () => void;
}

/** The listening prompt: no text at all, only the big play button and
 *  Slow. Before the first play of a session it asks for a tap (browsers
 *  block speech until the user interacts). */
function ListenPrompt({ listen, leaving }: { listen: ListenControls; leaving: boolean }) {
  const ready = listen.status === "available";
  return (
    <div className={`flex flex-col items-center gap-3 py-3 ${leaving ? "quiz-leave" : "card-rise"}`}>
      <button
        type="button"
        onClick={listen.onPlay}
        disabled={!ready}
        aria-label={listen.heard ? "Play the word again" : "Play the word"}
        aria-keyshortcuts="Space R"
        className={`flex h-24 w-24 items-center justify-center rounded-full bg-rust text-on-rust shadow-float transition-[background-color,scale] hover:bg-rust-dark active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS_RING} ${
          listen.speaking ? "listen-pulse" : ""
        }`}
      >
        <Volume2 size={44} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <p className="min-h-6 font-body text-body font-medium text-bark-muted">
        {!ready ? "Getting the voice ready" : listen.heard ? (listen.speaking ? "Listening…" : "\u00a0") : "Tap to listen"}
      </p>
      <button type="button" onClick={listen.onSlow} disabled={!ready} aria-keyshortcuts="S" className={CONTROL}>
        <Snail size={18} aria-hidden="true" />
        Slow
      </button>
    </div>
  );
}

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
  listen,
}: {
  word: QueueWord;
  quiz: Showing;
  /** Cards left in the run, this one included, for the stack. */
  remaining: number;
  answer: QuizAnswer | null;
  leaving: boolean;
  promptRef: Ref<HTMLDivElement>;
  continueRef: Ref<HTMLButtonElement>;
  onPick: (id: number) => void;
  onContinue: () => void;
  /** Listening formats only. */
  listen?: ListenControls;
}) {
  const label = QUESTION_LABELS[quiz.format];
  const listening = isListenFormat(quiz.format);
  const gloss = word.gloss ?? MISSING_GLOSS;
  const prompt =
    quiz.format === "meaning" ? word.simplified : quiz.format === "hanzi" ? promptGloss(gloss, word.simplified) : word.pinyin;
  const hanziOptions = quiz.format === "hanzi" || quiz.format === "pinyin" || quiz.format === "listen_hanzi";
  // Listening answers wait until the word has played.
  const locked = answer !== null || (listening && !listen?.heard);
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
        aria-label={listening ? label : `${label} ${prompt}`}
        className="mx-auto flex w-full max-w-md flex-col gap-2 outline-none"
      >
        <p aria-hidden="true" className={`text-center font-body text-body font-medium text-bark-muted ${motion}`}>
          {label}
        </p>
        {listening && listen ? (
          <ListenPrompt listen={listen} leaving={leaving} />
        ) : (
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
        )}
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
            aria-disabled={locked}
            aria-keyshortcuts={String(i + 1)}
            className={`${OPTION} flex-col ${optionState(option.id)} ${!answer && locked ? "opacity-60" : ""}`}
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
            {/* After a listening answer every option shows its reading,
                so the tones can be compared. */}
            {answer && listening && option.pinyin && (
              <span className="font-body text-[13px] font-medium leading-5 text-rust-dark">{option.pinyin}</span>
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
          <ResultBar
            right={answer.right}
            title={listening ? (answer.right ? "Good ear!" : "Listen again") : answer.right ? "Nice!" : "Not quite"}
            word={word}
            continueRef={continueRef}
            onContinue={onContinue}
            className={motion}
          />
        ) : (
          <p className={HINT}>
            {listening ? "Space or R to replay · S for slow · 1 to 4 to answer" : "1 to 4 to answer · Enter to continue"}
          </p>
        )}
      </div>
    </>
  );
}

/** The result under a quiz question or the writing pad: green or red,
 *  a title (and a detail line), the full word with audio, and Continue
 *  (white text on got-it 5.1:1, on miss 6.5:1). */
export function ResultBar({
  right,
  title,
  detail,
  word,
  continueRef,
  onContinue,
  className = "",
}: {
  right: boolean;
  title: string;
  detail?: string;
  word: QueueWord;
  continueRef: Ref<HTMLButtonElement>;
  onContinue: () => void;
  className?: string;
}) {
  return (
    <div className={`rounded-[18px] p-4 ${right ? "bg-good-tint" : "bg-again-tint"} ${className}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-1.5 font-heading text-h2 font-bold ${right ? "text-good-ink" : "text-again-ink"}`}>
            {right ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : <X size={20} strokeWidth={3} aria-hidden="true" />}
            {title}
          </p>
          {detail && <p className={`font-body text-body font-medium ${right ? "text-good-ink" : "text-again-ink"}`}>{detail}</p>}
          <p className="mt-0.5 font-body text-body wrap-break-word text-bark">
            <span lang="zh-CN" className="font-hanzi font-medium">
              {word.simplified}
            </span>{" "}
            {word.pinyin} · {word.gloss ?? MISSING_GLOSS}
          </p>
        </div>
        <AudioButton text={word.simplified} />
      </div>
      <button
        ref={continueRef}
        type="button"
        onClick={onContinue}
        className={`mt-3 flex h-12 w-full items-center justify-center rounded-pill font-heading text-h3 font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 ${
          right
            ? "bg-got-it hover:bg-got-it-strong focus-visible:ring-offset-good-tint"
            : "bg-miss hover:bg-miss-strong focus-visible:ring-offset-again-tint"
        }`}
      >
        Continue
      </button>
    </div>
  );
}

type Phase = "rising" | "asking" | "answered" | "leaving";

/** A session's listening audio: whether questions may play on their own
 *  yet (after the first tap of the session), and the tap. */
export interface SessionAudio {
  autoPlay: boolean;
  onPlayed: () => void;
}

/**
 * A quiz or listening question. Picking an option answers it: the result
 * shows right away while `onAnswer` saves it; Continue (or Enter) fades
 * the question out, runs the commit (the parent moves on) and the next
 * question rises. A failed save (`onAnswer` resolves to null) opens the
 * same question again. Same contract as CardStage, so a session can show
 * either. A listening question plays its word when it appears (once the
 * session has had its first tap, see `audio`), and takes answers once it
 * has played.
 */
function QuestionStage({
  word,
  quiz,
  remaining,
  onAnswer,
  audio,
}: {
  word: QueueWord;
  quiz: Showing;
  remaining: number;
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
  audio?: SessionAudio;
}) {
  const reducedMotion = useReducedMotion();
  const riseMs = reducedMotion ? REDUCED_TRANSITION_MS : TRANSITION_MS;
  const listening = isListenFormat(quiz.format);
  const voice = useChineseVoiceStatus();

  const [answer, setAnswer] = useState<QuizAnswer | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [questionKey, setQuestionKey] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState(false);
  const heardRef = useRef(false);

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

  function play(rate: number) {
    if (!listening || voice !== "available" || phase.current === "leaving") return;
    speak(word.simplified, {
      rate,
      // Heard once speech really starts (a blocked play changes nothing),
      // and answering time starts then.
      onStart: () => {
        setSpeaking(true);
        if (!heardRef.current) {
          heardRef.current = true;
          setHeard(true);
          shownAt.current = performance.now();
        }
        audio?.onPlayed();
      },
      onEnd: () => setSpeaking(false),
    });
  }

  // A listening question plays on its own once the session has had its
  // first tap (and the voice is ready). Speech stops when it goes.
  const autoPlay = useEffectEvent(() => {
    if (listening && audio?.autoPlay && !heardRef.current) play(NORMAL_RATE);
  });
  useEffect(() => {
    autoPlay();
  }, [questionKey, voice]);
  useEffect(() => () => stopSpeaking(), [questionKey]);

  function pick(id: number) {
    if (phase.current !== "asking" || (listening && !heard)) return;
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
    heardRef.current = false;
    setHeard(false);
    setSpeaking(false);
    setQuestionKey((k) => k + 1);
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest("input, textarea, select, [role=dialog]")) return;
    const n = Number(e.key);
    const key = e.key.toLowerCase();
    if (Number.isInteger(n) && n >= 1 && n <= quiz.options.length) {
      if (phase.current !== "asking") return;
      e.preventDefault();
      pick(quiz.options[n - 1].id);
    } else if (listening && (key === "r" || key === "s" || (key === " " && !target?.closest("button, a")))) {
      e.preventDefault();
      play(key === "s" ? SLOW_RATE : NORMAL_RATE);
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
      ? `${listening ? "Good ear!" : "Right."} ${wordLine(word)}.`
      : `${listening ? "Listen again." : "Not quite."} The answer is ${wordLine(word)}.`
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
          listen={
            listening
              ? {
                  status: voice,
                  speaking,
                  heard,
                  onPlay: () => play(NORMAL_RATE),
                  onSlow: () => play(SLOW_RATE),
                }
              : undefined
          }
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** A quiz question on the card stack. */
export function QuizStage(props: {
  word: QueueWord;
  quiz: QuizShowing;
  remaining: number;
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
}) {
  return <QuestionStage {...props} />;
}

/** A listening question: the word is heard, never shown, until answered. */
export function ListenStage(props: {
  word: QueueWord;
  quiz: ListenShowing;
  remaining: number;
  onAnswer: (gotIt: boolean, durationMs: number) => Promise<(() => void) | null>;
  audio: SessionAudio;
}) {
  return <QuestionStage {...props} />;
}
