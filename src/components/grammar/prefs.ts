"use client";

import { useSyncExternalStore } from "react";

import { devErrorOnce } from "@/lib/dev";

// The lesson pages' Pinyin and English toggles, in localStorage, so they
// hold from lesson to lesson. Kept in memory too, so a choice still holds
// for the visit when storage throws. Until the user picks, pinyin starts
// hidden and English shown.

export type LessonPref = "pinyin" | "english";

const key = (pref: LessonPref) => `moink:grammar:show-${pref}`;
const EVENT = "moink:grammar-prefs";
const remembered = new Map<LessonPref, boolean>();

const DEFAULT_SHOWN: Record<LessonPref, boolean> = { pinyin: false, english: true };

function read(pref: LessonPref): boolean {
  const inMemory = remembered.get(pref);
  if (inMemory !== undefined) return inMemory;
  try {
    const stored = window.localStorage.getItem(key(pref));
    return stored === null ? DEFAULT_SHOWN[pref] : stored === "shown";
  } catch (error) {
    devErrorOnce(`read:grammar-${pref}`, `useLessonPref: couldn't read ${pref} from localStorage; using the default.`, error);
    return DEFAULT_SHOWN[pref];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Whether `pref` is shown: the default on the server and while
 *  hydrating. */
export function useLessonPref(pref: LessonPref): boolean {
  return useSyncExternalStore(subscribe, () => read(pref), () => DEFAULT_SHOWN[pref]);
}

export function storeLessonPref(pref: LessonPref, shown: boolean) {
  remembered.set(pref, shown);
  try {
    window.localStorage.setItem(key(pref), shown ? "shown" : "hidden");
  } catch (error) {
    devErrorOnce(`write:grammar-${pref}`, `storeLessonPref: couldn't save ${pref} to localStorage; it's kept in memory for this visit only.`, error);
  }
  window.dispatchEvent(new Event(EVENT));
}
