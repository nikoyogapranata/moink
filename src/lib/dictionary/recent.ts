"use client";

import { useSyncExternalStore } from "react";

// Recently viewed words, newest first, kept in this browser only. Storage
// can be missing or throw (private mode, blocked site data), so every
// access is guarded and the card simply hides when there is nothing.

export interface RecentWord {
  id: number;
  simplified: string;
  pinyin: string;
}

const KEY = "moink:dictionary:recent";
const MAX = 8;
const EVENT = "moink:recent-words";
const EMPTY: RecentWord[] = [];

let cacheRaw: string | null = null;
let cacheValue: RecentWord[] = EMPTY;

function read(): RecentWord[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // Same string, same array: useSyncExternalStore needs a stable snapshot.
  if (raw === cacheRaw) return cacheValue;
  cacheRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cacheValue = Array.isArray(parsed)
      ? parsed
          .filter(
            (w): w is RecentWord =>
              typeof w?.id === "number" &&
              typeof w?.simplified === "string" &&
              typeof w?.pinyin === "string",
          )
          .slice(0, MAX)
      : EMPTY;
  } catch {
    cacheValue = EMPTY;
  }
  return cacheValue;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useRecentWords() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function rememberWord(word: RecentWord) {
  try {
    const next = [
      { id: word.id, simplified: word.simplified, pinyin: word.pinyin },
      ...read().filter((w) => w.id !== word.id),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage unavailable: recents just don't persist.
  }
}
