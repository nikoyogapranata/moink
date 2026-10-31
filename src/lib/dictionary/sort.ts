"use client";

import { useSyncExternalStore } from "react";

import { devErrorOnce } from "@/lib/dev";

import { parseSort, type ListSort } from "./words";

// The dictionary's last browse order, in localStorage. Kept in memory
// too, so a choice still holds for the visit when storage throws.

const KEY = "moink:dictionary:sort";
const EVENT = "moink:dictionary-sort";
let remembered: ListSort | null = null;

function read(): ListSort {
  if (remembered) return remembered;
  try {
    return parseSort(window.localStorage.getItem(KEY)) ?? "common";
  } catch (error) {
    devErrorOnce("read:dictionary-sort", "useStoredSort: couldn't read the sort from localStorage; using common first.", error);
    return "common";
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

/** The remembered order, or null on the server and while hydrating
 *  (storage isn't readable there yet). */
export function useStoredSort(): ListSort | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function storeSort(sort: ListSort) {
  remembered = sort;
  try {
    window.localStorage.setItem(KEY, sort);
  } catch (error) {
    devErrorOnce("write:dictionary-sort", "storeSort: couldn't save the sort to localStorage; it's kept in memory for this visit only.", error);
  }
  window.dispatchEvent(new Event(EVENT));
}
