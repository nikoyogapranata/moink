"use client";

import { useMemo, useSyncExternalStore } from "react";

import { devErrorOnce } from "@/lib/dev";
import { MAX_DECK_WORDS, parseDeckSet, parseDirection, type DeckSet, type Direction } from "@/lib/training/deck";
import { LISTEN_FORMATS, parseFormats, QUIZ_FORMATS, type QuestionFormat } from "@/lib/training/quiz";
import { parseWritingStyle, type WritingStyle } from "@/lib/training/writing";

/* Two decks each for flashcards, the quiz, listening and writing, all kept in memory too so
   they still work for the visit when storage throws:
   - the last deck built, in localStorage, which the builder restores and
     the hub's quick-start link uses;
   - the deck being practiced, in sessionStorage, which /training/flashcards
     /training/quiz, /training/listening or /training/writing reads (ids only; the page loads the words). */

export interface SavedDeck {
  direction: Direction;
  set: DeckSet;
  ids: number[];
  shuffle: boolean;
}

export interface PracticeDeck {
  ids: number[];
  shuffle: boolean;
}

/** Question decks: the quiz and listening, stored apart but alike. */
export type QuestionKind = "quiz" | "listening";

const QUESTION_KINDS: Record<QuestionKind, { formats: readonly QuestionFormat[]; last: string; practice: string; href: string }> = {
  quiz: { formats: QUIZ_FORMATS, last: "moink:last-quiz", practice: "moink:practice-quiz", href: "/training/quiz" },
  listening: {
    formats: LISTEN_FORMATS,
    last: "moink:last-listening",
    practice: "moink:practice-listening",
    href: "/training/listening",
  },
};

export interface SavedQuiz {
  formats: QuestionFormat[];
  set: DeckSet;
  ids: number[];
  shuffle: boolean;
}

export interface PracticeQuiz {
  ids: number[];
  formats: QuestionFormat[];
  shuffle: boolean;
}

const LAST_DECK_KEY = "moink:last-deck";
const PRACTICE_DECK_KEY = "moink:practice-deck";
const LAST_WRITING_KEY = "moink:last-writing";
const PRACTICE_WRITING_KEY = "moink:practice-writing";

export interface SavedWriting {
  style: WritingStyle;
  set: DeckSet;
  ids: number[];
  shuffle: boolean;
}

export interface PracticeWriting {
  ids: number[];
  style: WritingStyle;
  shuffle: boolean;
}

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(storage: () => Storage, key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return storage().getItem(key);
  } catch (error) {
    devErrorOnce(`read:${key}`, `deckStore: couldn't read "${key}" from storage; treating it as empty.`, error);
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string) {
  memory.set(key, value);
  try {
    storage().setItem(key, value);
  } catch (error) {
    devErrorOnce(`write:${key}`, `deckStore: couldn't save "${key}" to storage; it's kept in memory for this visit only.`, error);
  }
  listeners.forEach((l) => l());
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_DECK_WORDS) return null;
  return value.every((id) => Number.isSafeInteger(id) && id > 0) ? value : null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function parseSavedDeck(raw: string | null): SavedDeck | null {
  const value = parseJson(raw);
  const direction = parseDirection(value?.direction);
  const set = parseDeckSet(value?.set);
  const ids = parseIds(value?.ids);
  if (!direction || !set || !ids) return null;
  return { direction, set, ids, shuffle: value?.shuffle !== false };
}

export function readLastDeck() {
  return parseSavedDeck(read(local, LAST_DECK_KEY));
}

export function saveLastDeck(deck: SavedDeck) {
  write(local, LAST_DECK_KEY, JSON.stringify(deck));
}

/** Keeps a shuffle choice made mid-session for the builder's next open. */
export function saveLastDeckShuffle(shuffle: boolean) {
  const last = readLastDeck();
  if (last && last.shuffle !== shuffle) saveLastDeck({ ...last, shuffle });
}

/** The last deck built, or null (always null on the server). */
export function useLastDeck() {
  const raw = useSyncExternalStore(subscribe, () => read(local, LAST_DECK_KEY), () => null);
  return useMemo(() => parseSavedDeck(raw), [raw]);
}

/** Hands the deck to the practice page and returns where to go. */
export function practiceDeckHref(deck: SavedDeck) {
  const practice: PracticeDeck = { ids: deck.ids, shuffle: deck.shuffle };
  write(session, PRACTICE_DECK_KEY, JSON.stringify(practice));
  return `/training/flashcards?dir=${deck.direction}`;
}

function parsePracticeDeck(raw: string | null): PracticeDeck | null {
  const value = parseJson(raw);
  const ids = parseIds(value?.ids);
  return ids ? { ids, shuffle: value?.shuffle !== false } : null;
}

/** The deck to practice: undefined until the page is on the client, then
 *  the deck or null when there's none. */
export function usePracticeDeck() {
  const raw = useSyncExternalStore(subscribe, () => read(session, PRACTICE_DECK_KEY), () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parsePracticeDeck(raw)), [raw]);
}

/* Quiz and listening decks */

function parseSavedQuiz(kind: QuestionKind, raw: string | null): SavedQuiz | null {
  const value = parseJson(raw);
  const formats = parseFormats(value?.formats, QUESTION_KINDS[kind].formats);
  const set = parseDeckSet(value?.set);
  const ids = parseIds(value?.ids);
  if (!formats || !set || !ids) return null;
  return { formats, set, ids, shuffle: value?.shuffle !== false };
}

export function readLastQuiz(kind: QuestionKind) {
  return parseSavedQuiz(kind, read(local, QUESTION_KINDS[kind].last));
}

export function saveLastQuiz(kind: QuestionKind, quiz: SavedQuiz) {
  write(local, QUESTION_KINDS[kind].last, JSON.stringify(quiz));
}

/** Keeps a shuffle choice made mid-session for the builder's next open. */
export function saveLastQuizShuffle(kind: QuestionKind, shuffle: boolean) {
  const last = readLastQuiz(kind);
  if (last && last.shuffle !== shuffle) saveLastQuiz(kind, { ...last, shuffle });
}

/** The last deck of `kind` built, or null (always null on the server). */
export function useLastQuiz(kind: QuestionKind) {
  const raw = useSyncExternalStore(subscribe, () => read(local, QUESTION_KINDS[kind].last), () => null);
  return useMemo(() => parseSavedQuiz(kind, raw), [kind, raw]);
}

/** Hands the deck to its practice page and returns where to go. */
export function practiceQuizHref(kind: QuestionKind, quiz: SavedQuiz) {
  const practice: PracticeQuiz = { ids: quiz.ids, formats: quiz.formats, shuffle: quiz.shuffle };
  write(session, QUESTION_KINDS[kind].practice, JSON.stringify(practice));
  return QUESTION_KINDS[kind].href;
}

function parsePracticeQuiz(kind: QuestionKind, raw: string | null): PracticeQuiz | null {
  const value = parseJson(raw);
  const ids = parseIds(value?.ids);
  const formats = parseFormats(value?.formats, QUESTION_KINDS[kind].formats);
  return ids && formats ? { ids, formats, shuffle: value?.shuffle !== false } : null;
}

/** The deck of `kind` to practice: undefined until the page is on the
 *  client, then the deck or null when there's none. */
export function usePracticeQuiz(kind: QuestionKind) {
  const raw = useSyncExternalStore(subscribe, () => read(session, QUESTION_KINDS[kind].practice), () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parsePracticeQuiz(kind, raw)), [kind, raw]);
}

/* Writing sets */

function parseSavedWriting(raw: string | null): SavedWriting | null {
  const value = parseJson(raw);
  const style = parseWritingStyle(value?.style);
  const set = parseDeckSet(value?.set);
  const ids = parseIds(value?.ids);
  if (!style || !set || !ids) return null;
  return { style, set, ids, shuffle: value?.shuffle !== false };
}

export function readLastWriting() {
  return parseSavedWriting(read(local, LAST_WRITING_KEY));
}

export function saveLastWriting(writing: SavedWriting) {
  write(local, LAST_WRITING_KEY, JSON.stringify(writing));
}

/** Keeps a style or shuffle choice made mid-session for the builder's
 *  next open. */
export function updateLastWriting(patch: Partial<Pick<SavedWriting, "style" | "shuffle">>) {
  const last = readLastWriting();
  if (last) saveLastWriting({ ...last, ...patch });
}

/** The last writing set built, or null (always null on the server). */
export function useLastWriting() {
  const raw = useSyncExternalStore(subscribe, () => read(local, LAST_WRITING_KEY), () => null);
  return useMemo(() => parseSavedWriting(raw), [raw]);
}

/** Hands the set to the writing page and returns where to go. */
export function practiceWritingHref(writing: SavedWriting) {
  const practice: PracticeWriting = { ids: writing.ids, style: writing.style, shuffle: writing.shuffle };
  write(session, PRACTICE_WRITING_KEY, JSON.stringify(practice));
  return "/training/writing";
}

function parsePracticeWriting(raw: string | null): PracticeWriting | null {
  const value = parseJson(raw);
  const ids = parseIds(value?.ids);
  const style = parseWritingStyle(value?.style);
  return ids && style ? { ids, style, shuffle: value?.shuffle !== false } : null;
}

/** The set to write: undefined until the page is on the client, then the
 *  set or null when there's none. */
export function usePracticeWriting() {
  const raw = useSyncExternalStore(subscribe, () => read(session, PRACTICE_WRITING_KEY), () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parsePracticeWriting(raw)), [raw]);
}
