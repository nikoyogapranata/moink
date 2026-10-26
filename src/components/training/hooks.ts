"use client";

import { useState, useSyncExternalStore } from "react";

import { devErrorOnce } from "@/lib/dev";
import { parseDirection, type Direction } from "@/lib/training/deck";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(motionQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
}

/* The last direction picked in each session mode, in localStorage. Kept
   in memory too, so it still works for the visit when storage throws. */

export type SessionMode = "review" | "practice";

const storageKey = (mode: SessionMode) => `moink:flashcards-direction:${mode}`;
const remembered = new Map<SessionMode, Direction>();
const listeners = new Set<() => void>();

function subscribeDirection(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readDirection(mode: SessionMode): Direction {
  const inMemory = remembered.get(mode);
  if (inMemory) return inMemory;
  try {
    return parseDirection(window.localStorage.getItem(storageKey(mode))) ?? "hanzi";
  } catch (error) {
    devErrorOnce(`read:${mode}`, `useDirection: couldn't read the ${mode} direction from localStorage; using hanzi first.`, error);
    return "hanzi";
  }
}

function storeDirection(mode: SessionMode, direction: Direction) {
  remembered.set(mode, direction);
  try {
    window.localStorage.setItem(storageKey(mode), direction);
  } catch (error) {
    devErrorOnce(`write:${mode}`, `useDirection: couldn't save the ${mode} direction to localStorage; it's kept in memory for this visit only.`, error);
  }
  listeners.forEach((l) => l());
}

/** The session's card direction: `initial` (from the URL) if given, else
 *  the last one picked in this mode. Changing it remembers the choice. */
export function useDirection(mode: SessionMode, initial: Direction | null) {
  const stored = useSyncExternalStore(subscribeDirection, () => readDirection(mode), () => "hanzi" as const);
  const [picked, setPicked] = useState(initial);
  const direction = picked ?? stored;
  function setDirection(next: Direction) {
    setPicked(next);
    storeDirection(mode, next);
  }
  return [direction, setDirection] as const;
}
