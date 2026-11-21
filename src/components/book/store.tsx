"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { clearBookAnswers, saveBookAnswer, saveBookNote } from "@/lib/book/actions";
import type { AutoItem } from "@/lib/book/answers";
import type { BookNote, SavedAnswer } from "@/lib/book/load";
import type { Json } from "@/lib/supabase/database.types";

// The reader's answers and notes. One store per lesson, outside React
// state: each input subscribes to its own key, so typing in one blank
// re-renders that blank only. Writes show at once and save in the
// background (answers: right away or after a pause; notes: after a pause),
// one request per key at a time, retried once on failure.

/** Pause before a text answer saves. */
export const TEXT_DELAY_MS = 600;
/** Pause before a note saves. */
const NOTE_DELAY_MS = 800;
const RETRY_MS = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";
type Listener = () => void;

interface NoteState {
  id: string | null;
  body: string;
  status: SaveStatus;
}

const noteKey = (blockKey: string | null) => blockKey ?? "";

export class BookStore {
  private answers = new Map<string, SavedAnswer>();
  private notes = new Map<string, NoteState>();
  private listeners = new Set<Listener>();
  private timers = new Map<string, number>();
  /** Saves waiting for their timer: key -> the save. */
  private pending = new Map<string, () => Promise<void>>();
  /** The save in flight per key, so a key never has two at once. */
  private inFlight = new Map<string, Promise<void>>();
  private failed = new Set<string>();
  private notesSnapshot: { blockKey: string | null; body: string }[] | null = null;

  constructor(
    readonly lessonId: string,
    answers: Record<string, SavedAnswer>,
    notes: BookNote[],
    readonly autoItems: AutoItem[],
  ) {
    for (const [k, v] of Object.entries(answers)) this.answers.set(k, v);
    for (const n of notes) this.notes.set(noteKey(n.blockKey), { id: n.id, body: n.body, status: "idle" });
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    this.notesSnapshot = null;
    this.listeners.forEach((l) => l());
  }

  /* Saving */

  private schedule(key: string, delay: number, save: () => Promise<boolean>) {
    window.clearTimeout(this.timers.get(key));
    const run = async () => {
      this.pending.delete(key);
      this.timers.delete(key);
      // Wait for this key's previous save, then send the latest.
      const previous = this.inFlight.get(key) ?? Promise.resolve();
      const current = previous.then(async () => {
        let ok = await save().catch(() => false);
        if (!ok) {
          await new Promise((r) => setTimeout(r, RETRY_MS));
          ok = await save().catch(() => false);
        }
        if (ok) this.failed.delete(key);
        else this.failed.add(key);
        this.emit();
      });
      this.inFlight.set(key, current);
      await current;
      if (this.inFlight.get(key) === current) this.inFlight.delete(key);
    };
    this.pending.set(key, run);
    if (delay <= 0) void run();
    else this.timers.set(key, window.setTimeout(run, delay));
  }

  /** Sends every waiting save now (leaving the page, a blur). */
  flush(key?: string) {
    for (const [k, run] of [...this.pending]) {
      if (key && k !== key) continue;
      window.clearTimeout(this.timers.get(k));
      void run();
    }
  }

  /** Whether some save failed even after its retry. */
  hasFailed = () => this.failed.size > 0;

  /* Answers */

  getAnswer = (key: string) => this.answers.get(key);

  setAnswer(key: string, answer: Json, isCorrect: boolean | null, delay = 0) {
    this.answers.set(key, { answer, is_correct: isCorrect });
    this.emit();
    this.schedule(`a:${key}`, delay, async () => {
      const latest = this.answers.get(key);
      if (!latest) return true; // cleared meanwhile
      return (await saveBookAnswer(key, latest.answer, latest.is_correct)).ok;
    });
  }

  clearAnswers(keys: string[]) {
    for (const k of keys) {
      this.answers.delete(k);
      window.clearTimeout(this.timers.get(`a:${k}`));
      this.pending.delete(`a:${k}`);
    }
    this.emit();
    this.schedule(`clear:${keys.join("|")}`, 0, async () => (await clearBookAnswers(keys)).ok);
  }

  /* Notes */

  getNote = (blockKey: string | null) => this.notes.get(noteKey(blockKey));

  /** Every note with text, the lesson note first, then in `order`. */
  listNotes(order: string[]) {
    if (!this.notesSnapshot) {
      const rank = new Map(order.map((k, i) => [k, i]));
      this.notesSnapshot = [...this.notes.entries()]
        .filter(([, n]) => n.body.trim())
        .map(([k, n]) => ({ blockKey: k === "" ? null : k, body: n.body }))
        .sort((a, b) => (a.blockKey === null ? -1 : b.blockKey === null ? 1 : (rank.get(a.blockKey) ?? 1e9) - (rank.get(b.blockKey) ?? 1e9)));
    }
    return this.notesSnapshot;
  }

  setNote(blockKey: string | null, body: string) {
    const k = noteKey(blockKey);
    const current = this.notes.get(k) ?? { id: null, body: "", status: "idle" as SaveStatus };
    this.notes.set(k, { ...current, body, status: "saving" });
    this.emit();
    this.schedule(`n:${k}`, NOTE_DELAY_MS, async () => {
      const note = this.notes.get(k);
      if (!note) return true;
      const result = await saveBookNote(this.lessonId, blockKey, note.id, note.body);
      const latest = this.notes.get(k)!;
      this.notes.set(k, { ...latest, id: result.id, status: result.ok ? (latest.body === note.body ? "saved" : "saving") : "error" });
      return result.ok;
    });
  }
}

const StoreContext = createContext<BookStore | null>(null);

export function useBookStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useBookStore must be used inside <BookStoreProvider>");
  return store;
}

export function BookStoreProvider({
  lessonId,
  answers,
  notes,
  autoItems,
  children,
}: {
  lessonId: string;
  answers: Record<string, SavedAnswer>;
  notes: BookNote[];
  autoItems: AutoItem[];
  children: ReactNode;
}) {
  const [store] = useState(() => new BookStore(lessonId, answers, notes, autoItems));

  // Leaving the page: send what's waiting.
  useEffect(() => {
    const flush = () => store.flush();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** One saved answer, re-rendering only when it changes. */
export function useAnswer(key: string) {
  const store = useBookStore();
  return useSyncExternalStore(store.subscribe, () => store.getAnswer(key), () => store.getAnswer(key));
}

export function useNote(blockKey: string | null) {
  const store = useBookStore();
  return useSyncExternalStore(store.subscribe, () => store.getNote(blockKey), () => store.getNote(blockKey));
}

export function useNotes(order: string[]) {
  const store = useBookStore();
  return useSyncExternalStore(store.subscribe, () => store.listNotes(order), () => store.listNotes(order));
}

export function useSaveFailed() {
  const store = useBookStore();
  return useSyncExternalStore(store.subscribe, store.hasFailed, () => false);
}

/** Auto-checked items right / total. */
export function useScore() {
  const store = useBookStore();
  const compute = () => {
    let right = 0;
    let total = 0;
    for (const item of store.autoItems) {
      if (item.kind === "single") {
        total += 1;
        if (store.getAnswer(item.key)?.answer === item.answer) right += 1;
      } else {
        total += item.answers.length;
        const saved = store.getAnswer(item.key);
        // Blanks count once the passage is checked.
        if (saved && saved.is_correct !== null && Array.isArray(saved.answer)) {
          item.answers.forEach((a, i) => {
            if ((saved.answer as Json[])[i] === a) right += 1;
          });
        }
      }
    }
    return `${right}/${total}`;
  };
  return useSyncExternalStore(store.subscribe, compute, compute);
}
