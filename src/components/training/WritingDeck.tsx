"use client";

import { useEffect, useState } from "react";

import { devError } from "@/lib/dev";
import { fetchDeckWords } from "@/lib/training/actions";
import { byGridOrder, shuffle } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";
import { isWritable } from "@/lib/training/writing";

import { usePracticeWriting, type PracticeWriting } from "./deckStore";
import { DeckLoadError, DeckLoading, NoDeck } from "./PracticeDeck";
import { WritingSession } from "./WritingSession";

type Loaded = { set: PracticeWriting; items: QueueItem[] } | { set: PracticeWriting; error: true };

/** Loads the writing set the builder handed over (sessionStorage) and runs
 *  it. Words the pad can't write are left out. */
export function WritingDeck() {
  const set = usePracticeWriting();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!set) return;
    let cancelled = false;
    fetchDeckWords(set.ids)
      .catch((error) => {
        devError("WritingDeck: fetchDeckWords threw.", error);
        return null;
      })
      .then((words) => {
        if (cancelled) return;
        if (!words) {
          devError(`WritingDeck: couldn't load the set's ${set.ids.length} words (fetchDeckWords returned null; see the server log).`);
          setLoaded({ set, error: true });
          return;
        }
        const writable = words.filter((w) => isWritable(w.simplified));
        if (writable.length < words.length) {
          devError(`WritingDeck: ${words.length - writable.length} words have no stroke data; left out.`);
        }
        const ordered = set.shuffle ? shuffle(writable) : [...writable].sort(byGridOrder);
        setLoaded({ set, items: ordered.map((word) => ({ word, card: null, isNew: false })) });
      });
    return () => {
      cancelled = true;
    };
  }, [set]);

  const current = loaded?.set === set ? loaded : null;

  if (set === undefined || (set && !current)) return <DeckLoading>Loading your writing set</DeckLoading>;
  if (current && "error" in current) return <DeckLoadError title="Couldn't load your writing set" />;
  if (!current || current.items.length === 0) {
    return <NoDeck title="No writing set">Build a writing set from Writing in Training.</NoDeck>;
  }

  return <WritingSession items={current.items} initialStyle={current.set.style} shuffled={current.set.shuffle} />;
}
