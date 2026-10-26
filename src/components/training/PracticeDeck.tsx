"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { devError } from "@/lib/dev";
import { fetchDeckWords } from "@/lib/training/actions";
import { byGridOrder, shuffle, type Direction } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";

import { usePracticeDeck, type PracticeDeck as Deck } from "./deckStore";
import { PracticeSession } from "./PracticeSession";
import { DoneScreen } from "./SessionParts";

type Loaded = { deck: Deck; items: QueueItem[] } | { deck: Deck; error: true };

/** Loads the deck the builder handed over (sessionStorage) and runs it. */
export function PracticeDeck({ initialDirection }: { initialDirection: Direction | null }) {
  const deck = usePracticeDeck();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!deck) return;
    let cancelled = false;
    fetchDeckWords(deck.ids)
      .catch((error) => {
        devError("PracticeDeck: fetchDeckWords threw.", error);
        return null;
      })
      .then((words) => {
        if (cancelled) return;
        if (!words) {
          devError(`PracticeDeck: couldn't load the deck's ${deck.ids.length} words (fetchDeckWords returned null; see the server log).`);
          setLoaded({ deck, error: true });
          return;
        }
        const ordered = deck.shuffle ? shuffle(words) : [...words].sort(byGridOrder);
        setLoaded({ deck, items: ordered.map((word) => ({ word, card: null, isNew: false })) });
      });
    return () => {
      cancelled = true;
    };
  }, [deck]);

  const current = loaded?.deck === deck ? loaded : null;

  if (deck === undefined || (deck && !current)) return <DeckLoading>Loading your deck</DeckLoading>;
  if (current && "error" in current) return <DeckLoadError title="Couldn't load your deck" />;
  if (!current || current.items.length === 0) {
    return <NoDeck title="No deck to practice">Build a deck from Flashcards in Training.</NoDeck>;
  }

  return <PracticeSession items={current.items} shuffled={current.deck.shuffle} initialDirection={initialDirection} />;
}

/* The loader's screens, shared with QuizDeck. */

export function DeckLoading({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center gap-2 font-body text-body text-bark-muted">
      <LoaderCircle size={20} aria-hidden="true" className="spin" />
      {children}
    </main>
  );
}

export function DeckLoadError({ title }: { title: string }) {
  return (
    <DoneScreen title={title} stats={[]} pose="ready">
      <Button onClick={() => window.location.reload()}>Try again</Button>
      <Button variant="secondary" asChild>
        <Link href="/training">Back to Training</Link>
      </Button>
    </DoneScreen>
  );
}

export function NoDeck({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DoneScreen title={title} stats={[]} pose="ready">
      <p className="w-full font-body text-body text-bark-muted">{children}</p>
      <Button asChild>
        <Link href="/training">Back to Training</Link>
      </Button>
    </DoneScreen>
  );
}
