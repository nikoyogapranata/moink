"use client";

import { useEffect, useState } from "react";

import { devError } from "@/lib/dev";
import { fetchQuizDeck } from "@/lib/training/actions";
import { byGridOrder, shuffle } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";
import { pickShowing, type QuizBank } from "@/lib/training/quiz";

import { usePracticeQuiz, type PracticeQuiz } from "./deckStore";
import { DeckLoadError, DeckLoading, NoDeck } from "./PracticeDeck";
import { QuizSession } from "./QuizSession";

type Loaded = { quiz: PracticeQuiz; items: QueueItem[]; bank: QuizBank } | { quiz: PracticeQuiz; error: true };

/** Loads the quiz the builder handed over (sessionStorage), with its
 *  questions, and runs it. Words with no question in the chosen formats
 *  are left out. */
export function QuizDeck() {
  const quiz = usePracticeQuiz();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!quiz) return;
    let cancelled = false;
    fetchQuizDeck(quiz.ids, quiz.formats)
      .catch((error) => {
        devError("QuizDeck: fetchQuizDeck threw.", error);
        return null;
      })
      .then((deck) => {
        if (cancelled) return;
        if (!deck) {
          devError(`QuizDeck: couldn't load the quiz's ${quiz.ids.length} words (fetchQuizDeck returned null; see the server log).`);
          setLoaded({ quiz, error: true });
          return;
        }
        const ordered = quiz.shuffle ? shuffle(deck.words) : [...deck.words].sort(byGridOrder);
        const items = ordered.flatMap((word) => {
          const showing = pickShowing(deck.bank[word.id], quiz.formats);
          return showing ? [{ word, card: null, isNew: false, quiz: showing }] : [];
        });
        if (items.length < ordered.length) {
          devError(`QuizDeck: ${ordered.length - items.length} words have no question in ${quiz.formats.join(", ")}; left out.`);
        }
        setLoaded({ quiz, items, bank: deck.bank });
      });
    return () => {
      cancelled = true;
    };
  }, [quiz]);

  const current = loaded?.quiz === quiz ? loaded : null;

  if (quiz === undefined || (quiz && !current)) return <DeckLoading>Loading your quiz</DeckLoading>;
  if (current && "error" in current) return <DeckLoadError title="Couldn't load your quiz" />;
  if (!current || current.items.length === 0) {
    return <NoDeck title="No quiz to take">Build a quiz from Quiz in Training.</NoDeck>;
  }

  return (
    <QuizSession items={current.items} bank={current.bank} formats={current.quiz.formats} shuffled={current.quiz.shuffle} />
  );
}
