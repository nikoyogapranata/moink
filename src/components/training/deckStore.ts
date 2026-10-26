"use client";

import { useMemo, useSyncExternalStore } from "react";

import { devErrorOnce } from "@/lib/dev";
import { MAX_DECK_WORDS, parseDeckSet, parseDirection, type DeckSet, type Direction } from "@/lib/training/deck";
import { parseQuizFormats, type QuizFormat } from "@/lib/training/quiz";

/* Two decks for flashcards and two for the quiz, all kept in memory too so
   they still work for the visit when storage throws:
   - the last deck built, in localStorage, which the builder restores and
     the hub's quick-start link uses;
   - the deck being practiced, in sessionStorage, which /training/flashcards
     or /training/quiz reads (ids only; the page loads the words). */

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

export interface SavedQuiz {
  formats: QuizFormat[];
  set: DeckSet;
  ids: number[];
  shuffle: boolean;
}

export interface PracticeQuiz {
  ids: number[];
  formats: QuizFormat[];
  shuffle: boolean;
}

const LAST_DECK_KEY = "moink:last-deck";
const PRACTICE_DECK_KEY = "moink:practice-deck";
const LAST_QUIZ_KEY = "moink:last-quiz";
const PRACTICE_QUIZ_KEY = "moink:practice-quiz";

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

/* Quiz decks */

function parseSavedQuiz(raw: string | null): SavedQuiz | null {
  const value = parseJson(raw);
  const formats = parseQuizFormats(value?.formats);
  const set = parseDeckSet(value?.set);
  const ids = parseIds(value?.ids);
  if (!formats || !set || !ids) return null;
  return { formats, set, ids, shuffle: value?.shuffle !== false };
}

export function readLastQuiz() {
  return parseSavedQuiz(read(local, LAST_QUIZ_KEY));
}

export function saveLastQuiz(quiz: SavedQuiz) {
  write(local, LAST_QUIZ_KEY, JSON.stringify(quiz));
}

/** Keeps a shuffle choice made mid-quiz for the builder's next open. */
export function saveLastQuizShuffle(shuffle: boolean) {
  const last = readLastQuiz();
  if (last && last.shuffle !== shuffle) saveLastQuiz({ ...last, shuffle });
}

/** The last quiz built, or null (always null on the server). */
export function useLastQuiz() {
  const raw = useSyncExternalStore(subscribe, () => read(local, LAST_QUIZ_KEY), () => null);
  return useMemo(() => parseSavedQuiz(raw), [raw]);
}

/** Hands the quiz to the quiz page and returns where to go. */
export function practiceQuizHref(quiz: SavedQuiz) {
  const practice: PracticeQuiz = { ids: quiz.ids, formats: quiz.formats, shuffle: quiz.shuffle };
  write(session, PRACTICE_QUIZ_KEY, JSON.stringify(practice));
  return "/training/quiz";
}

function parsePracticeQuiz(raw: string | null): PracticeQuiz | null {
  const value = parseJson(raw);
  const ids = parseIds(value?.ids);
  const formats = parseQuizFormats(value?.formats);
  return ids && formats ? { ids, formats, shuffle: value?.shuffle !== false } : null;
}

/** The quiz to practice: undefined until the page is on the client, then
 *  the quiz or null when there's none. */
export function usePracticeQuiz() {
  const raw = useSyncExternalStore(subscribe, () => read(session, PRACTICE_QUIZ_KEY), () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parsePracticeQuiz(raw)), [raw]);
}
