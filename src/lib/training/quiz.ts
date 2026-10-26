// Quiz and listening questions: formats, building each word's options
// (the right answer and 3 distractors), and picking how a card is shown.
// Pure and safe on server and client; the server loads the pools
// (buildQuestions in server.ts) and scripts/check-quiz.ts checks every
// HSK 1 to 4 word.

import { pinyinInitial, pinyinSyllables, toPinyinPlain, tonedPinyin } from "../pinyin";
import { shuffle } from "./deck";

/** meaning: see the hanzi, pick the gloss. hanzi: see the gloss, pick the
 *  hanzi. pinyin: see (and hear) the pinyin, pick the hanzi. */
export type QuizFormat = "meaning" | "hanzi" | "pinyin";

/** Listening: hear the word (no text at all), pick its hanzi or its
 *  meaning. */
export type ListenFormat = "listen_hanzi" | "listen_meaning";

export type QuestionFormat = QuizFormat | ListenFormat;

export const QUIZ_FORMATS: readonly QuizFormat[] = ["meaning", "hanzi", "pinyin"];
export const LISTEN_FORMATS: readonly ListenFormat[] = ["listen_hanzi", "listen_meaning"];
export const QUESTION_FORMATS: readonly QuestionFormat[] = [...QUIZ_FORMATS, ...LISTEN_FORMATS];

export function isListenFormat(format: QuestionFormat): format is ListenFormat {
  return format === "listen_hanzi" || format === "listen_meaning";
}

/** Builder chips: "Hanzi → meaning", with the arrow drawn as an icon. */
export const FORMAT_LABELS: Record<QuestionFormat, { from: string; to: string }> = {
  meaning: { from: "Hanzi", to: "meaning" },
  hanzi: { from: "Meaning", to: "hanzi" },
  pinyin: { from: "Pinyin", to: "hanzi" },
  listen_hanzi: { from: "Hear", to: "hanzi" },
  listen_meaning: { from: "Hear", to: "meaning" },
};

export const QUESTION_LABELS: Record<QuestionFormat, string> = {
  meaning: "What does this mean?",
  hanzi: "Pick the hanzi",
  pinyin: "Which hanzi is this?",
  listen_hanzi: "Which word did you hear?",
  listen_meaning: "What does it mean?",
};

/** The formats in `value` (an array), when they're all from `allowed`
 *  without repeats; null otherwise. */
export function parseFormats<F extends QuestionFormat>(value: unknown, allowed: readonly F[]): F[] | null {
  if (!Array.isArray(value)) return null;
  const formats = allowed.filter((f) => value.includes(f));
  return formats.length > 0 && formats.length === new Set(value).size ? formats : null;
}

/** reviews.mode for a quiz or listening answer in Today's review. */
export function questionReviewMode(format: QuestionFormat) {
  return isListenFormat(format) ? format : (`quiz_${format}` as const);
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

/** One option: the word it stands for and the text on the button.
 *  Listening options carry the word's pinyin too, shown after answering
 *  so the tones can be compared. */
export interface QuizOption {
  id: number;
  text: string;
  pinyin?: string;
}

/** A word's questions: each format's 4 options (the right one included),
 *  or no entry when the format can't be asked about it. */
export type QuizQuestions = Partial<Record<QuestionFormat, QuizOption[]>>;

/** Questions by word id. */
export type QuizBank = Record<number, QuizQuestions>;

/** How a card is shown this time when it's a question: the format and its
 *  options in display order. */
export interface Showing<F extends QuestionFormat = QuestionFormat> {
  format: F;
  options: QuizOption[];
}

export type QuizShowing = Showing<QuizFormat>;
export type ListenShowing = Showing<ListenFormat>;

/** Glosses longer than this show only their first sense as an option. */
const MAX_OPTION_GLOSS = 40;

/** A level with fewer words than this borrows from its neighbors. */
const MIN_POOL = 30;

/** Distractors per question, and how many of them a quiz may take from
 *  the similar tiers (shared character, same first syllable). Listening
 *  has no such limit: sound-alikes are the point. */
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
 *  could have two right answers, or two identical buttons. A quiz also
 *  keeps plain pinyin apart; listening keeps toned pinyin apart instead
 *  (true homophones can't be told apart by ear), so tone pairs like
 *  买 mǎi / 卖 mài can meet. */
function keys(word: QuizWord) {
  return {
    simplified: word.simplified,
    gloss: norm(word.gloss),
    plain: word.pinyin_plain || toPinyinPlain(word.pinyin) || word.pinyin,
    toned: tonedPinyin(word.pinyin),
    shown: norm(word.gloss === null ? null : optionGloss(word.gloss)),
  };
}

type Keys = ReturnType<typeof keys>;

function clashes(a: Keys, b: Keys, listening: boolean) {
  return (
    a.simplified === b.simplified ||
    a.gloss === b.gloss ||
    a.shown === b.shown ||
    (listening ? a.toned === b.toned : a.plain === b.plain)
  );
}

/** What distractor picking compares, worked out once per word: pools are
 *  scanned for every question, so nothing here is recomputed per scan.
 *  Keyed by the word object, so a refreshed pool starts fresh. */
interface Features {
  keys: Keys;
  chars: string[];
  firstSyllable: string;
  syllables: ReturnType<typeof pinyinSyllables>;
  /** Plain syllables joined: equal for words that differ only in tone. */
  plainSyllables: string;
  initial: string;
}

const featureCache = new WeakMap<QuizWord, Features>();

function features(word: QuizWord): Features {
  let f = featureCache.get(word);
  if (!f) {
    const syllables = pinyinSyllables(word.pinyin);
    f = {
      keys: keys(word),
      chars: [...word.simplified],
      firstSyllable: toPinyinPlain(word.pinyin.trim().split(/\s+/)[0]) ?? "",
      syllables,
      plainSyllables: syllables.map((x) => x.base).join(" "),
      initial: syllables.length ? pinyinInitial(syllables[0].base) : "",
    };
    featureCache.set(word, f);
  }
  return f;
}

/** `items` in random order, shuffled lazily (Fisher-Yates one step per
 *  item taken), so stopping after a few costs a few random draws, not a
 *  shuffle of the whole pool. */
function* randomOrder<T>(items: readonly T[], random: () => number): Generator<T> {
  const out = [...items];
  for (let i = out.length - 1; i >= 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
    yield out[i];
  }
}

/** Takes words from tiers in order until `upTo` are picked, skipping any
 *  that clash with the target or an earlier pick. */
function picker(target: QuizWord, listening: boolean, random: () => number) {
  const taken = [features(target).keys];
  const picked: QuizWord[] = [];
  return {
    picked,
    take(words: readonly QuizWord[], upTo: number) {
      if (picked.length >= upTo) return;
      for (const word of randomOrder(words, random)) {
        if (word.id === target.id || word.gloss === null) continue;
        const k = features(word).keys;
        if (taken.some((t) => clashes(t, k, listening))) continue;
        taken.push(k);
        picked.push(word);
        if (picked.length >= upTo) return;
      }
    },
  };
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

/** Listening's sound-alike pool: every word at old-HSK `level` + 1 or
 *  below, so tone pairs turn up more often. */
export function soundPool(byLevel: ReadonlyMap<number, readonly QuizWord[]>, level: number): QuizWord[] {
  return [...byLevel.entries()].filter(([l]) => l <= level + 1).flatMap(([, words]) => words);
}

/**
 * A quiz's three distractors for `target` from `pool`: at most
 * MAX_SIMILAR that share a character with it, then that share its first
 * syllable; the rest with its character count first, then anything.
 * Null when the pool can't fill the question.
 */
function pickDistractors(target: QuizWord, pool: readonly QuizWord[], random: () => number): QuizWord[] | null {
  const t = features(target);
  const chars = new Set(t.chars);

  const sharesChar: QuizWord[] = [];
  const sharesSyllable: QuizWord[] = [];
  const sameLength: QuizWord[] = [];
  const rest: QuizWord[] = [];
  for (const word of pool) {
    const w = features(word);
    if (w.chars.some((c) => chars.has(c))) sharesChar.push(word);
    else if (w.firstSyllable === t.firstSyllable) sharesSyllable.push(word);
    else if (w.chars.length === t.chars.length) sameLength.push(word);
    else rest.push(word);
  }

  const { picked, take } = picker(target, false, random);
  take(sharesChar, MAX_SIMILAR);
  take(sharesSyllable, MAX_SIMILAR);
  // Left-over similar words don't come back as filler.
  take(sameLength, DISTRACTORS);
  take(rest, DISTRACTORS);
  return picked.length === DISTRACTORS ? picked : null;
}

/**
 * Listening's three distractors: sound-alikes from `sounds` first, in
 * order: the same syllables with other tones (买 mǎi / 卖 mài), then the
 * same syllables but one, whose final changed (same initial), then the
 * same initial and character count; then anything from `pool` (the
 * target's level). Never a true homophone (the same toned pinyin).
 */
function pickListenDistractors(
  target: QuizWord,
  sounds: readonly QuizWord[],
  pool: readonly QuizWord[],
  random: () => number,
): QuizWord[] | null {
  const t = features(target);
  const ts = t.syllables;

  const otherTones: QuizWord[] = [];
  const oneFinal: QuizWord[] = [];
  const sameInitial: QuizWord[] = [];
  for (const word of sounds) {
    const w = features(word);
    const ws = w.syllables;
    if (ws.length === ts.length) {
      if (w.plainSyllables === t.plainSyllables) {
        otherTones.push(word);
        continue;
      }
      let differ = -1;
      let count = 0;
      for (let i = 0; i < ws.length && count < 2; i++) {
        if (ws[i].base !== ts[i].base || ws[i].tone !== ts[i].tone) {
          differ = i;
          count++;
        }
      }
      if (count === 1 && ws[differ].base !== ts[differ].base && pinyinInitial(ws[differ].base) === pinyinInitial(ts[differ].base)) {
        oneFinal.push(word);
        continue;
      }
    }
    if (w.initial === t.initial && w.chars.length === t.chars.length) sameInitial.push(word);
  }

  const { picked, take } = picker(target, true, random);
  take(otherTones, DISTRACTORS);
  take(oneFinal, DISTRACTORS);
  take(sameInitial, DISTRACTORS);
  take(pool, DISTRACTORS);
  return picked.length === DISTRACTORS ? picked : null;
}

/** Where a word's distractors come from: its level (quiz, and listening's
 *  fallback) and the wider sound-alike pool (listening). */
export interface QuestionPools {
  level: readonly QuizWord[];
  sounds: readonly QuizWord[];
}

/** Each requested format's options for `target`, in random order. Every
 *  format is skipped when the word has no gloss (the feedback shows it). */
export function buildWordQuestions(
  target: QuizWord,
  pools: QuestionPools,
  formats: readonly QuestionFormat[],
  random: () => number = Math.random,
): QuizQuestions {
  const questions: QuizQuestions = {};
  if (target.gloss === null) return questions;
  for (const format of formats) {
    const listening = isListenFormat(format);
    const distractors = listening
      ? pickListenDistractors(target, pools.sounds, pools.level, random)
      : pickDistractors(target, pools.level, random);
    if (!distractors) continue;
    questions[format] = shuffle([target, ...distractors], random).map((word) => ({
      id: word.id,
      text: format === "meaning" || format === "listen_meaning" ? optionGloss(word.gloss!) : word.simplified,
      ...(listening ? { pinyin: word.pinyin } : {}),
    }));
  }
  return questions;
}

/** A showing in one of `formats` (at random among those the word has
 *  questions for), options reshuffled; null when there's none. */
export function pickShowing<F extends QuestionFormat>(
  questions: QuizQuestions | undefined,
  formats: readonly F[],
  random: () => number = Math.random,
): Showing<F> | null {
  const available = formats.filter((f) => questions?.[f]);
  if (!questions || available.length === 0) return null;
  const format = available[Math.floor(random() * available.length)];
  return { format, options: shuffle(questions[format]!, random) };
}

/** Today's review: how a card past New is shown, about 40% flashcard, 35%
 *  quiz and 25% listening. A new card is always a flashcard. */
export const REVIEW_MIX = { flashcard: 0.4, quiz: 0.35, listen: 0.25 } as const;

export interface ReviewShowing {
  quiz: QuizShowing | null;
  listen: ListenShowing | null;
}

/** How a recognition card is shown in Today's review (see REVIEW_MIX); a
 *  kind with no questions for the word falls back to a flashcard. Without
 *  `canListen` (no Chinese voice) listening's share goes to the other two,
 *  in proportion. */
export function reviewShowing(
  isNew: boolean,
  questions: QuizQuestions | undefined,
  canListen = true,
  random: () => number = Math.random,
): ReviewShowing {
  const none = { quiz: null, listen: null };
  if (isNew) return none;
  const scale = canListen ? 1 : REVIEW_MIX.flashcard + REVIEW_MIX.quiz;
  const r = random() * scale;
  if (r < REVIEW_MIX.flashcard) return none;
  if (r < REVIEW_MIX.flashcard + REVIEW_MIX.quiz) return { quiz: pickShowing(questions, QUIZ_FORMATS, random), listen: null };
  return { quiz: null, listen: pickShowing(questions, LISTEN_FORMATS, random) };
}

/**
 * A card the server picked for listening, on a client with no Chinese
 * voice: a flashcard or a quiz question instead, in REVIEW_MIX's
 * proportion. Decided by the word id, not at random, so every render of
 * the card agrees.
 */
export function withoutListening<T extends { word: { id: number }; quiz?: QuizShowing | null; listen?: ListenShowing | null }>(
  item: T,
  questions: QuizQuestions | undefined,
): T {
  if (!item.listen) return item;
  const share = REVIEW_MIX.flashcard / (REVIEW_MIX.flashcard + REVIEW_MIX.quiz);
  const spread = ((item.word.id * 2654435761) % 2 ** 32) / 2 ** 32;
  if (spread < share) return { ...item, listen: null };
  const formats = QUIZ_FORMATS.filter((f) => questions?.[f]);
  if (formats.length === 0) return { ...item, listen: null };
  const format = formats[item.word.id % formats.length];
  return { ...item, listen: null, quiz: { format, options: questions![format]! } };
}

/** A showing as a queue item's fields: quiz or listen, the other null. */
export function showingFields(showing: Showing | null): ReviewShowing {
  if (!showing) return { quiz: null, listen: null };
  return isListenFormat(showing.format)
    ? { quiz: null, listen: showing as ListenShowing }
    : { quiz: showing as QuizShowing, listen: null };
}
