import { Rating, type Grade } from "ts-fsrs";

import type { Database } from "@/lib/supabase/database.types";

import type { CardFields } from "./fsrs";
import type { ListenShowing, QuizShowing } from "./quiz";
import type { WritingShowing } from "./writing";

type QueueRow = Database["public"]["Functions"]["get_review_queue"]["Returns"][number];

export interface QueueWord {
  id: number;
  simplified: string;
  pinyin: string;
  gloss: string | null;
  hsk_level: number;
  classifiers: string[] | null;
}

export interface QueueItem {
  word: QueueWord;
  /** null for a new word with no user_words row yet. */
  card: CardFields | null;
  isNew: boolean;
  /** Shown as this quiz question next time it's up; a flashcard when
   *  null or missing. */
  quiz?: QuizShowing | null;
  /** Shown as this listening question next time it's up. */
  listen?: ListenShowing | null;
  /** Shown on the writing pad (a writing card or writing practice). */
  writing?: WritingShowing | null;
}

/** A card due again within this window (learning and relearning steps)
 *  comes back in the same session; past it, the card is finished. */
export const SESSION_WINDOW_MS = 20 * 60_000;

/** Due cards come back at least this many cards later. */
const MIN_GAP = 3;

/** One new card after every this many due cards. */
const DUE_PER_NEW = 3;

export function toQueueItems(rows: QueueRow[]): QueueItem[] {
  return rows.map((r) => ({
    word: {
      id: r.id,
      simplified: r.simplified,
      pinyin: r.pinyin,
      gloss: r.gloss,
      hsk_level: r.hsk_level,
      classifiers: r.classifiers,
    },
    card: r.has_card
      ? {
          due: r.due!,
          stability: r.stability!,
          difficulty: r.difficulty!,
          elapsed_days: r.elapsed_days!,
          scheduled_days: r.scheduled_days!,
          learning_steps: r.learning_steps!,
          reps: r.reps!,
          lapses: r.lapses!,
          state: r.state!,
          last_review: r.last_review,
        }
      : null,
    isNew: r.is_new,
  }));
}

/** Session order: due cards in order with one new card after every 3,
 *  then whatever is left of either. */
export function interleave(items: QueueItem[]): QueueItem[] {
  const due = items.filter((i) => !i.isNew);
  const fresh = items.filter((i) => i.isNew);
  const out: QueueItem[] = [];
  let n = 0;
  due.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % DUE_PER_NEW === 0 && n < fresh.length) out.push(fresh[n++]);
  });
  return out.concat(fresh.slice(n));
}

/**
 * Where a card that's due again soon goes back into the rest of the queue:
 * at least MIN_GAP cards later, or later still if its due time won't have
 * passed by then (estimated at msPerCard each). Past the end goes last;
 * with nothing else left it's 0, so it shows right away.
 */
export function returnIndex(restLength: number, msUntilDue: number, msPerCard: number) {
  const untilDue = Math.ceil(Math.max(0, msUntilDue) / Math.max(msPerCard, 1000));
  return Math.min(restLength, Math.max(MIN_GAP, untilDue));
}

/** One pass through a queue. In a scheduled run a card is finished once
 *  it's rated with a due date beyond SESSION_WINDOW_MS; in a practice
 *  round, once it's answered anything but Again. */
export interface Run {
  queue: QueueItem[];
  total: number;
  finished: ReadonlySet<number>;
  /** Each card's first rating this run, for the counts. */
  firstAnswers: ReadonlyMap<number, Grade>;
}

/** A scheduled run, in session order. */
export function startRun(items: QueueItem[]): Run {
  return startPractice(interleave(items));
}

/** A practice round over `items` in the order given. Nothing in it is
 *  saved. */
export function startPractice(items: QueueItem[]): Run {
  return {
    queue: items,
    total: items.length,
    finished: new Set(),
    firstAnswers: new Map(),
  };
}

function withFirstAnswer(run: Run, id: number, grade: Grade) {
  return run.firstAnswers.has(id) ? run.firstAnswers : new Map(run.firstAnswers).set(id, grade);
}

/** The run after the front card was rated `grade` and saved as `card`:
 *  it comes back later in the queue if it's due again within the window,
 *  and is finished otherwise. */
export function afterRating(run: Run, grade: Grade, card: CardFields, now: number, msPerCard: number): Run {
  const [current, ...rest] = run.queue;
  const id = current.word.id;
  const msUntilDue = Date.parse(card.due) - now;
  let queue = rest;
  let finished = run.finished;
  if (msUntilDue <= SESSION_WINDOW_MS) {
    const at = returnIndex(rest.length, msUntilDue, msPerCard);
    queue = [...rest.slice(0, at), { ...current, card, isNew: false }, ...rest.slice(at)];
  } else {
    finished = new Set(finished).add(id);
  }
  return { ...run, queue, finished, firstAnswers: withFirstAnswer(run, id, grade) };
}

/** The practice round after the front card was answered: Again goes to
 *  the end of the round, anything else finishes it. */
export function afterPractice(run: Run, grade: Grade): Run {
  const [current, ...rest] = run.queue;
  const id = current.word.id;
  const again = grade === Rating.Again;
  return {
    ...run,
    queue: again ? [...rest, current] : rest,
    finished: again ? run.finished : new Set(run.finished).add(id),
    firstAnswers: withFirstAnswer(run, id, grade),
  };
}

/** The run with its cards not answered yet put in `order`, apart from the
 *  front card. Every other card, and the counts, stay as they are. */
export function reorderUnanswered(run: Run, order: (items: QueueItem[]) => QueueItem[]): Run {
  const slots = run.queue.flatMap((item, i) => (i > 0 && !run.firstAnswers.has(item.word.id) ? [i] : []));
  if (slots.length < 2) return run;
  const reordered = order(slots.map((i) => run.queue[i]));
  const queue = [...run.queue];
  slots.forEach((slot, n) => {
    queue[slot] = reordered[n];
  });
  return { ...run, queue };
}

/** A quiz or writing practice round after the front word was answered: a
 *  miss comes back as `again` (a new question, or Recall only) MIN_GAP
 *  words later, or last when fewer are left; a right answer finishes the
 *  word. */
export function afterRetryPractice(run: Run, grade: Grade, again: QueueItem): Run {
  const [current, ...rest] = run.queue;
  const id = current.word.id;
  if (grade !== Rating.Again) {
    return { ...run, queue: rest, finished: new Set(run.finished).add(id), firstAnswers: withFirstAnswer(run, id, grade) };
  }
  const at = returnIndex(rest.length, 0, 1);
  return {
    ...run,
    queue: [...rest.slice(0, at), again, ...rest.slice(at)],
    firstAnswers: withFirstAnswer(run, id, grade),
  };
}

/** The run without its front card, which counts as finished: a word the
 *  writing pad can't write (its stroke data didn't load). */
export function skipFront(run: Run): Run {
  const [current, ...rest] = run.queue;
  return { ...run, queue: rest, finished: new Set(run.finished).add(current.word.id) };
}

/** The run with the card for word `id`, if it's still queued, replaced by
 *  `reshow(card)`: how a card that comes back is shown again. */
export function reshowCard(run: Run, id: number, reshow: (item: QueueItem) => QueueItem): Run {
  const at = run.queue.findIndex((item) => item.word.id === id);
  if (at === -1) return run;
  const queue = [...run.queue];
  queue[at] = reshow(queue[at]);
  return { ...run, queue };
}

/** Counts of first answers so far: Got it is anything but Again. */
export function runStats(run: Run) {
  const answers = [...run.firstAnswers.values()];
  const stillLearning = answers.filter((g) => g === Rating.Again).length;
  return {
    reviewed: answers.length,
    gotIt: answers.length - stillLearning,
    stillLearning,
  };
}
