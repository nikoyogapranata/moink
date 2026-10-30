"use client";

import { useEffect, useState } from "react";

import { useHskStandard } from "@/components/app/HskStandard";
import { NO_VOICE_HELP, useChineseVoiceStatus } from "@/lib/dictionary/speech";
import { devError } from "@/lib/dev";
import { fetchQuizDeck } from "@/lib/training/actions";
import { byGridOrder, shuffle } from "@/lib/training/deck";
import type { QueueItem } from "@/lib/training/queue";
import { pickShowing, showingFields, type QuizBank } from "@/lib/training/quiz";

import { usePracticeQuiz, type PracticeQuiz, type QuestionKind } from "./deckStore";
import { DeckLoadError, DeckLoading, NoDeck } from "./PracticeDeck";
import { QuizSession } from "./QuizSession";

type Loaded = { quiz: PracticeQuiz; items: QueueItem[]; bank: QuizBank } | { quiz: PracticeQuiz; error: true };

const TEXT: Record<QuestionKind, { loading: string; error: string; none: string; build: string }> = {
  quiz: {
    loading: "Loading your quiz",
    error: "Couldn't load your quiz",
    none: "No quiz to take",
    build: "Build a quiz from Quiz in Training.",
  },
  listening: {
    loading: "Loading your listening set",
    error: "Couldn't load your listening set",
    none: "No listening set",
    build: "Build a listening set from Listening in Training.",
  },
};

/** Loads the quiz or listening set the builder handed over
 *  (sessionStorage), with its questions, and runs it. Words with no
 *  question in the chosen formats are left out. Listening needs a Chinese
 *  voice, and says so when the browser has none. */
export function QuizDeck({ kind }: { kind: QuestionKind }) {
  const quiz = usePracticeQuiz(kind);
  const standard = useHskStandard();
  const voice = useChineseVoiceStatus();
  const text = TEXT[kind];
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!quiz) return;
    let cancelled = false;
    fetchQuizDeck(quiz.ids, quiz.formats, standard)
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
        const ordered = quiz.shuffle ? shuffle(deck.words) : [...deck.words].sort(byGridOrder(standard));
        const items = ordered.flatMap((word) => {
          const showing = pickShowing(deck.bank[word.id], quiz.formats);
          return showing ? [{ word, card: null, isNew: false, ...showingFields(showing) }] : [];
        });
        if (items.length < ordered.length) {
          devError(`QuizDeck: ${ordered.length - items.length} words have no question in ${quiz.formats.join(", ")}; left out.`);
        }
        setLoaded({ quiz, items, bank: deck.bank });
      });
    return () => {
      cancelled = true;
    };
  }, [quiz, standard]);

  const current = loaded?.quiz === quiz ? loaded : null;

  if (kind === "listening" && voice === "none") {
    return <NoDeck title="Your browser has no Chinese voice">{NO_VOICE_HELP}</NoDeck>;
  }
  if (quiz === undefined || (quiz && !current)) return <DeckLoading>{text.loading}</DeckLoading>;
  if (current && "error" in current) return <DeckLoadError title={text.error} />;
  if (!current || current.items.length === 0) return <NoDeck title={text.none}>{text.build}</NoDeck>;

  return (
    <QuizSession
      kind={kind}
      items={current.items}
      bank={current.bank}
      formats={current.quiz.formats}
      shuffled={current.quiz.shuffle}
    />
  );
}
