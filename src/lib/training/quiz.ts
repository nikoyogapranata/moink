// Quiz questions: formats, building each word's options (the right answer
// and 3 distractors), and picking how a card is shown. Pure and safe on
// server and client; the server loads the pools (loadQuizBank in
// server.ts) and scripts/check-quiz.ts checks every HSK 1 to 4 word.

import { toPinyinPlain } from "../pinyin";
import { shuffle } from "./deck";

/** meaning: see the hanzi, pick the gloss. hanzi: see the gloss, pick the
 *  hanzi. pinyin: see (and hear) the pinyin, pick the hanzi. */
export type QuizFormat = "meaning" | "hanzi" | "pinyin";

export const QUIZ_FORMATS: readonly QuizFormat[] = ["meaning", "hanzi", "pinyin"];

/** Builder chips: "Hanzi → meaning", with the arrow drawn as an icon. */
export const QUIZ_FORMAT_LABELS: Record<QuizFormat, { from: string; to: string }> = {
  meaning: { from: "Hanzi", to: "meaning" },
  hanzi: { from: "Meaning", to: "hanzi" },
  pinyin: { from: "Pinyin", to: "hanzi" },
};

export const QUIZ_QUESTION_LABELS: Record<QuizFormat, string> = {
  meaning: "What does this mean?",
  hanzi: "Pick the hanzi",
  pinyin: "Which hanzi is this?",
};

export function parseQuizFormats(value: unknown): QuizFormat[] | null {
  if (!Array.isArray(value)) return null;
  const formats = QUIZ_FORMATS.filter((f) => value.includes(f));
  return formats.length > 0 && formats.length === new Set(value).size ? formats : null;
}

/** reviews.mode for a quiz answer in Today's review. */
export function quizReviewMode(format: QuizFormat) {
  return `quiz_${format}` as const;
}

/** What a question needs of a word. */
export interface QuizWord {
  id: number;
  simplified: string;
  pinyin: string;
  pinyin_plain: string | null;
  gloss: string | null;
  hsk_level: number;
}

/** One option: the word it stands for and the text on the button. */
export interface QuizOption {
  id: number;
  text: string;
}

/** A word's questions: each format's 4 options (the right one included),
 *  or no entry when the format can't be asked about it. */
export type QuizQuestions = Partial<Record<QuizFormat, QuizOption[]>>;

/** Questions by word id. */
export type QuizBank = Record<number, QuizQuestions>;

/** How a card is shown this time when it's a quiz question: the format
 *  and its options in display order. */
export interface QuizShowing {
  format: QuizFormat;
  options: QuizOption[];
}

/** Glosses longer than this show only their first sense as an option. */
const MAX_OPTION_GLOSS = 40;

/** A level with fewer words than this borrows from its neighbors. */
const MIN_POOL = 30;

/** Distractors per question, and how many of them may come from the
 *  similar tiers (shared character, same first syllable). */
const DISTRACTORS = 3;
const MAX_SIMILAR = 2;

/** The gloss as an option: the whole gloss, or its first sense when it's
 *  long. */
export function optionGloss(gloss: string) {
  if (gloss.length <= MAX_OPTION_GLOSS) return gloss;
  return gloss.split(";")[0].trim() || gloss;
}

/** The gloss as the prompt of a "Pick the hanzi" question, with the word
 *  itself masked: some glosses quote it ("(一边...一边...) while"). */
export function promptGloss(gloss: string, simplified: string) {
  return gloss.split(simplified).join("～");
}

const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** The keys two options may never share: an option set with a repeat
 *  could have two right answers, or two identical buttons. */
function keys(word: QuizWord) {
  return {
    simplified: word.simplified,
    gloss: norm(word.gloss),
    plain: word.pinyin_plain || toPinyinPlain(word.pinyin) || word.pinyin,
    shown: norm(word.gloss === null ? null : optionGloss(word.gloss)),
  };
}

type Keys = ReturnType<typeof keys>;

function clashes(a: Keys, b: Keys) {
  return a.simplified === b.simplified || a.gloss === b.gloss || a.plain === b.plain || a.shown === b.shown;
}

function firstSyllable(word: QuizWord) {
  return toPinyinPlain(word.pinyin.trim().split(/\s+/)[0]) ?? "";
}

/** The words at `level`, borrowing from the nearest levels (below first,
 *  then above) until there are at least MIN_POOL. */
export function levelPool(byLevel: ReadonlyMap<number, readonly QuizWord[]>, level: number): QuizWord[] {
  const pool = [...(byLevel.get(level) ?? [])];
  for (let step = 1; pool.length < MIN_POOL && step <= 5; step++) {
    pool.push(...(byLevel.get(level - step) ?? []), ...(byLevel.get(level + step) ?? []));
  }
  return pool;
}

/**
 * Three distractors for `target` from `pool`: at most MAX_SIMILAR that
 * share a character with it, then that share its first syllable; the rest
 * with its character count first, then anything. No two options share a
 * simplified form, gloss, plain pinyin or option text, so exactly one is
 * right. Null when the pool can't fill the question.
 */
function pickDistractors(target: QuizWord, pool: readonly QuizWord[], random: () => number): QuizWord[] | null {
  const chars = new Set(target.simplified);
  const length = [...target.simplified].length;
  const syllable = firstSyllable(target);

  const sharesChar: QuizWord[] = [];
  const sharesSyllable: QuizWord[] = [];
  const sameLength: QuizWord[] = [];
  const rest: QuizWord[] = [];
  for (const word of shuffle(pool, random)) {
    if (word.id === target.id || word.gloss === null) continue;
    if ([...word.simplified].some((c) => chars.has(c))) sharesChar.push(word);
    else if (firstSyllable(word) === syllable) sharesSyllable.push(word);
    else if ([...word.simplified].length === length) sameLength.push(word);
    else rest.push(word);
  }

  const taken = [keys(target)];
  const picked: QuizWord[] = [];
  function take(words: QuizWord[], upTo: number) {
    for (const word of words) {
      if (picked.length >= upTo) return;
      const k = keys(word);
      if (taken.some((t) => clashes(t, k))) continue;
      taken.push(k);
      picked.push(word);
    }
  }
  take(sharesChar, MAX_SIMILAR);
  take(sharesSyllable, MAX_SIMILAR);
  // Left-over similar words don't come back as filler.
  take(sameLength, DISTRACTORS);
  take(rest, DISTRACTORS);
  return picked.length === DISTRACTORS ? picked : null;
}

/** Each requested format's options for `target`, in random order. A format
 *  that needs the gloss is skipped when the word has none. */
export function buildWordQuestions(
  target: QuizWord,
  pool: readonly QuizWord[],
  formats: readonly QuizFormat[],
  random: () => number = Math.random,
): QuizQuestions {
  const questions: QuizQuestions = {};
  for (const format of formats) {
    if (target.gloss === null) continue;
    const distractors = pickDistractors(target, pool, random);
    if (!distractors) continue;
    questions[format] = shuffle([target, ...distractors], random).map((word) => ({
      id: word.id,
      text: format === "meaning" ? optionGloss(word.gloss!) : word.simplified,
    }));
  }
  return questions;
}

/** A quiz showing in one of `formats` (at random among those the word has
 *  questions for), options reshuffled; null when there's none. */
export function pickShowing(
  questions: QuizQuestions | undefined,
  formats: readonly QuizFormat[] = QUIZ_FORMATS,
  random: () => number = Math.random,
): QuizShowing | null {
  const available = formats.filter((f) => questions?.[f]);
  if (!questions || available.length === 0) return null;
  const format = available[Math.floor(random() * available.length)];
  return { format, options: shuffle(questions[format]!, random) };
}

/** Today's review: a card past New is a quiz question about half the
 *  time, in any format; a new card is always a flashcard. */
export const REVIEW_QUIZ_CHANCE = 0.5;

export function reviewShowing(
  isNew: boolean,
  questions: QuizQuestions | undefined,
  random: () => number = Math.random,
): QuizShowing | null {
  if (isNew || random() >= REVIEW_QUIZ_CHANCE) return null;
  return pickShowing(questions, QUIZ_FORMATS, random);
}
