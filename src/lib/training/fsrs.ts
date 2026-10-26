import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from "ts-fsrs";

// The scheduler for rateCard, the source of truth. Default learning steps
// (1m, 10m) and relearning steps (10m). Flashcards answer with Again
// (Still learning) or Good (Got it) only.
export const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true }),
);

export function isGrade(value: unknown): value is Grade {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** A user_words card as plain JSON, safe to pass between server and client. */
export type CardFields = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

/** ts-fsrs Card from stored fields, or an empty (New) card when there's no
 *  row yet. */
export function toCard(fields: CardFields | null, now: Date): Card {
  if (!fields) return createEmptyCard(now);
  return {
    ...fields,
    due: new Date(fields.due),
    last_review: fields.last_review ? new Date(fields.last_review) : undefined,
  };
}

export function toFields(card: Card): CardFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}
