"use client";

import { Check, ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { BookVocabBook } from "@/lib/book/vocab";
import { devError } from "@/lib/dev";
import { levelLabel, wordLevel, type HskStandard } from "@/lib/hsk";
import { createClient } from "@/lib/supabase/client";
import { deckSets } from "@/lib/training/deck";
import { bookMatchRank } from "@/lib/training/deckSearch";
import {
  describeLessonPick,
  groupId,
  groupKeys,
  LESSON_SIZES,
  lessonPickText,
  lessonRanges,
  parseLessonSize,
  wordKey,
  type DeckGroup,
  type DeckKey,
  type LessonSize,
  type SearchPick,
} from "@/lib/training/flashDeck";

import { SegmentedControl } from "./SessionParts";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

/** Results shown for one search. */
const SEARCH_LIMIT = 30;
const DEBOUNCE_MS = 250;

export type BookData = BookVocabBook[] | "error" | null;

/* Search */

interface Hit {
  key: DeckKey;
  hanzi: string;
  pinyin: string;
  meaning: string | null;
  tags: string[];
}

/** "4下 L20" for each book word key, the first lesson it's in. */
function bookTags(books: BookVocabBook[]) {
  const tags = new Map<DeckKey, string>();
  for (const book of books) {
    for (const lesson of book.lessons) {
      for (const word of lesson.words) if (!tags.has(word.key)) tags.set(word.key, `${book.short} L${lesson.number}`);
    }
  }
  return tags;
}

/**
 * Search results for `query` (debounced): search_words over the words
 * table, then HSK Book words with no words row that match. Book words that
 * are in the words table come with it and get their lesson as a second
 * tag. At most SEARCH_LIMIT, each with Add / Added.
 */
export function SearchResults({
  query,
  standard,
  books,
  inDeck,
  onToggle,
}: {
  query: string;
  standard: HskStandard;
  books: BookVocabBook[] | null;
  inDeck: ReadonlySet<DeckKey>;
  onToggle: (pick: SearchPick, add: boolean) => void;
}) {
  const q = query.trim();
  const [result, setResult] = useState<{ q: string; hits: Hit[] } | { q: string; error: true } | null>(null);
  const tags = useMemo(() => (books ? bookTags(books) : new Map<DeckKey, string>()), [books]);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await createClient().rpc("search_words", { p_query: q, p_limit: SEARCH_LIMIT });
        if (error) throw error;
        const hits: Hit[] = (data ?? []).map((w) => {
          const key = wordKey(w.id);
          const level = wordLevel({ id: w.id, hsk_level: w.hsk_level, hsk3_2025_level: w.hsk3_2025_level }, standard);
          const book = tags.get(key);
          return {
            key,
            hanzi: w.simplified,
            pinyin: w.pinyin,
            meaning: w.gloss,
            tags: [...(level !== null ? [levelLabel(level, standard)] : []), ...(book ? [book] : [])],
          };
        });
        // Book-only words: strong matches (hanzi, exact pinyin) first,
        // the rest after the words table's.
        const bookHits = (books ?? [])
          .flatMap((book) =>
            book.lessons.flatMap((lesson) =>
              lesson.words.flatMap((w) => {
                if (w.wordId !== null) return [];
                const rank = bookMatchRank(w, q);
                return rank === null ? [] : [{ rank, hit: { key: w.key, hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.en, tags: [tags.get(w.key)!] } }];
              }),
            ),
          )
          .filter((b, i, all) => all.findIndex((o) => o.hit.key === b.hit.key) === i)
          .sort((a, b) => a.rank - b.rank);
        const strong = bookHits.filter((b) => b.rank <= 4).map((b) => b.hit);
        const weak = bookHits.filter((b) => b.rank > 4).map((b) => b.hit);
        if (!cancelled) setResult({ q, hits: [...strong, ...hits, ...weak].slice(0, SEARCH_LIMIT) });
      } catch (error) {
        devError(`DeckBuilder: search for "${q}" failed.`, error);
        if (!cancelled) setResult({ q, error: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, standard, books, tags]);

  if (!result || result.q !== q) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 font-body text-body text-bark-muted">
        <LoaderCircle size={20} aria-hidden="true" className="spin" />
        Searching
      </p>
    );
  }
  if ("error" in result) {
    return (
      <p role="alert" className="py-12 text-center font-body text-body text-bark">
        Couldn&apos;t search. Check your connection and try again.
      </p>
    );
  }
  if (result.hits.length === 0) {
    return <p className="py-12 text-center font-body text-body text-bark-muted">No words match &ldquo;{q}&rdquo;.</p>;
  }
  return (
    <ul aria-label={`Results for ${q}`} className="flex flex-col divide-y-[1.5px] divide-line">
      {result.hits.map((hit) => {
        const added = inDeck.has(hit.key);
        return (
          <li key={hit.key} className="flex items-center gap-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="flex flex-wrap items-baseline gap-x-2.5">
                <span lang="zh-CN" className="font-hanzi text-[20px] font-medium leading-7 text-bark">
                  {hit.hanzi}
                </span>
                <span className="font-body text-body font-medium text-rust-dark">{hit.pinyin}</span>
                {hit.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill bg-highlight px-2 py-px font-body text-[12px] font-medium leading-5 text-bark"
                  >
                    {tag}
                  </span>
                ))}
              </p>
              {hit.meaning && <p className="truncate font-body text-body-sm text-bark-muted">{hit.meaning}</p>}
            </div>
            <button
              type="button"
              aria-pressed={added}
              aria-label={`${added ? "Remove" : "Add"} ${hit.hanzi}`}
              onClick={() => onToggle({ key: hit.key, hanzi: hit.hanzi }, !added)}
              className={`inline-flex h-11 w-24 shrink-0 items-center justify-center gap-1 rounded-pill border-[1.5px] font-body text-body font-medium transition-colors ${FOCUS_RING} ${
                added ? "border-rust-dark bg-highlight text-bark" : "border-line text-bark hover:bg-highlight/60"
              }`}
            >
              {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {added ? "Added" : "Add"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* HSK Book */

type LessonGroup = Extract<DeckGroup, { kind: "lesson" }>;

const SIZE_KEY = "moink:book-group-size";

/** The group size used last (10 until one is chosen). */
function readLessonSize(): LessonSize {
  try {
    const saved = window.localStorage.getItem(SIZE_KEY);
    return (saved === null ? null : parseLessonSize(Number(saved))) ?? 10;
  } catch {
    return 10;
  }
}

function saveLessonSize(size: LessonSize) {
  try {
    window.localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    // Private mode or storage off: the size just isn't remembered.
  }
}

const SIZE_OPTIONS = LESSON_SIZES.map((size) => ({ id: String(size), label: size === 0 ? "All" : String(size) }));

const CHIP = `inline-flex h-11 shrink-0 items-center gap-1 rounded-pill border-[1.5px] px-3.5 font-body text-body font-medium tabular-nums transition-colors ${FOCUS_RING}`;

/**
 * The HSK Book source: a switch between the books, and a tile per lesson
 * (number and word count, proper nouns left out; "10/41" when part of it
 * is in the deck). A tile opens the lesson's panel under the grid, where
 * the words to take are chosen.
 */
export function BookSource({
  books,
  book,
  onBook,
  groups,
  openLesson,
  onOpenLesson,
  onSetLesson,
  onRetry,
}: {
  books: BookData;
  book: string | null;
  onBook: (slug: string) => void;
  groups: readonly DeckGroup[];
  /** The lesson whose panel is open, in `book`. */
  openLesson: number | null;
  onOpenLesson: (lesson: number | null) => void;
  /** Sets the lesson's group (no keys: takes it out). */
  onSetLesson: (group: LessonGroup) => void;
  onRetry: () => void;
}) {
  if (books === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 font-body text-body text-bark-muted">
        <LoaderCircle size={20} aria-hidden="true" className="spin" />
        Loading the book
      </p>
    );
  }
  if (books === "error" || books.length === 0) {
    return (
      <p role="alert" className="py-12 text-center font-body text-body text-bark">
        {books === "error" ? "Couldn't load the book. " : "No book lessons yet. "}
        {books === "error" && (
          <button type="button" onClick={onRetry} className={`font-medium text-rust-dark underline underline-offset-4 ${FOCUS_RING}`}>
            Try again
          </button>
        )}
      </p>
    );
  }
  const current = books.find((b) => b.slug === book) ?? books[0];
  const lessonGroups = new Map(
    groups.flatMap((g) => (g.kind === "lesson" && g.book === current.slug ? [[g.lesson, g] as const] : [])),
  );
  const open = current.lessons.find((l) => l.number === openLesson) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span lang="zh-CN" className="font-hanzi text-[17px] font-bold text-bark">
          新HSK教程
        </span>
        <SegmentedControl
          label="Book"
          options={books.map((b) => ({ id: b.slug, label: b.short }))}
          value={current.slug}
          onChange={onBook}
          large
        />
      </div>
      <div role="group" aria-label={`${current.title_zh} lessons`} className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {current.lessons.map((lesson) => {
          const total = lesson.words.length;
          const have = new Set(lessonGroups.get(lesson.number)?.keys);
          const taken = lesson.words.filter((w) => have.has(w.key)).length;
          const full = taken > 0 && taken === total;
          const partial = taken > 0 && !full;
          const isOpen = open?.number === lesson.number;
          const state = full ? `all ${total} words in your deck` : partial ? `${taken} of ${total} words in your deck` : `${total} words`;
          return (
            <button
              key={lesson.number}
              type="button"
              aria-expanded={isOpen}
              aria-controls={isOpen ? "book-lesson-panel" : undefined}
              aria-label={`Lesson ${lesson.number}, ${state}${lesson.title_en ? `: ${lesson.title_en}` : ""}`}
              title={lesson.title_en}
              onClick={() => onOpenLesson(isOpen ? null : lesson.number)}
              className={`relative flex min-h-16 flex-col items-center justify-center rounded-[12px] border-[1.5px] px-1 py-2 transition-colors ${FOCUS_RING} ${
                full ? "border-rust bg-rust/12" : partial ? "border-rust bg-rust/5" : "border-line bg-surface-raised hover:bg-highlight/50"
              } ${isOpen ? "ring-2 ring-rust-dark ring-offset-2 ring-offset-background" : ""}`}
            >
              {full && <Check size={14} aria-hidden="true" className="absolute right-1.5 top-1.5 text-rust-dark" />}
              <span className="font-heading text-[19px] font-bold leading-6 text-bark">L{lesson.number}</span>
              <span className={`font-body text-[13px] leading-5 tabular-nums ${partial ? "font-medium text-rust-dark" : "text-bark-muted"}`}>
                {partial ? `${taken}/${total}` : `${total} words`}
              </span>
            </button>
          );
        })}
      </div>
      {open && (
        <LessonPanel
          key={`${current.slug}:${open.number}`}
          book={current}
          lesson={open}
          group={lessonGroups.get(open.number) ?? null}
          onClose={() => onOpenLesson(null)}
          onSave={(keys, size) => {
            onSetLesson({ kind: "lesson", book: current.slug, label: current.short, lesson: open.number, keys, size });
            onOpenLesson(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * One lesson's words to take: a group size (10 / 20 / 30 / All, the last
 * used remembered), range chips in the book's order that tick or untick
 * their words (the first one ticked for a lesson not in the deck yet),
 * and Pick words, the whole list with a box per word. Add
 * (Update when the lesson is in the deck already; nothing ticked then
 * takes it out) or Cancel.
 */
function LessonPanel({
  book,
  lesson,
  group,
  onClose,
  onSave,
}: {
  book: BookVocabBook;
  lesson: BookVocabBook["lessons"][number];
  group: LessonGroup | null;
  onClose: () => void;
  onSave: (keys: DeckKey[], size: LessonSize) => void;
}) {
  const words = lesson.words;
  const [initialSize] = useState<LessonSize>(() => group?.size ?? readLessonSize());
  const [size, setSize] = useState(initialSize);
  // The lesson's current pick, or its first range for a lesson not in the
  // deck yet.
  const [ticked, setTicked] = useState<ReadonlySet<DeckKey>>(() => {
    if (group) return new Set(group.keys);
    const [first] = lessonRanges(words.length, initialSize);
    return new Set(first ? words.slice(first[0] - 1, first[1]).map((w) => w.key) : []);
  });
  // Open on a pick that isn't whole ranges, so it shows what's ticked.
  const [picking, setPicking] = useState(
    () => !!group && describeLessonPick(words.map((w) => w.key), group.keys, group.size).kind === "picked",
  );
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const count = words.filter((w) => ticked.has(w.key)).length;
  const ranges = lessonRanges(words.length, size);

  // Into view when it opens (it's under the grid): all of it, or, when
  // it's taller than the scroller (phones), its end, so Add / Update and
  // Cancel are on screen.
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const scroller = panel.parentElement?.closest<HTMLElement>(".overflow-y-auto");
    const tall = !!scroller && panel.offsetHeight > scroller.clientHeight;
    panel.scrollIntoView({ block: tall ? "end" : "nearest" });
  }, []);

  function setKeys(keys: DeckKey[], on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function chooseSize(next: LessonSize) {
    setSize(next);
    saveLessonSize(next);
  }

  return (
    <section
      ref={ref}
      id="book-lesson-panel"
      aria-labelledby={titleId}
      className="flex scroll-my-3 flex-col gap-3 rounded-[16px] border-[1.5px] border-rust/50 bg-surface-raised p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 id={titleId} className="font-heading text-h3 font-bold text-bark">
          <span lang="zh-CN">{book.short}</span> L{lesson.number}
        </h4>
        {lesson.title_en && <span className="font-body text-body-sm text-bark-muted">{lesson.title_en}</span>}
        <span className="ml-auto font-body text-body-sm tabular-nums text-bark-muted">{words.length} words</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className="font-body text-body-sm text-bark-muted">
          Group size
        </span>
        <SegmentedControl
          label="Group size"
          options={SIZE_OPTIONS}
          value={String(size)}
          onChange={(id) => chooseSize(parseLessonSize(Number(id)) ?? 10)}
          large
        />
      </div>

      <div role="group" aria-label="Word ranges" className="flex flex-wrap gap-2">
        {ranges.map(([a, b]) => {
          const keys = words.slice(a - 1, b).map((w) => w.key);
          const on = keys.filter((k) => ticked.has(k)).length;
          const pressed = on === keys.length ? true : on > 0 ? "mixed" : false;
          return (
            <button
              key={`${a}-${b}`}
              type="button"
              aria-pressed={pressed}
              aria-label={a === b ? `Word ${a}` : `Words ${a} to ${b}`}
              onClick={() => setKeys(keys, pressed !== true)}
              className={`${CHIP} ${
                pressed === true
                  ? "border-rust-dark bg-highlight text-bark"
                  : pressed === "mixed"
                    ? "border-dashed border-rust-dark text-bark hover:bg-highlight/60"
                    : "border-line text-bark hover:bg-highlight/60"
              }`}
            >
              {pressed === true && <Check size={16} aria-hidden="true" className="text-rust-dark" />}
              {a === b ? a : `${a}–${b}`}
            </button>
          );
        })}
      </div>

      <div>
        <button
          type="button"
          aria-expanded={picking}
          aria-controls={`${titleId}-words`}
          onClick={() => setPicking((p) => !p)}
          className={`-ml-2 inline-flex h-11 items-center gap-1 rounded-pill px-2 font-body text-body font-medium text-rust-dark hover:bg-highlight/60 ${FOCUS_RING}`}
        >
          Pick words
          <ChevronDown size={18} aria-hidden="true" className={`transition-transform ${picking ? "rotate-180" : ""}`} />
        </button>
        {picking && (
          <ul
            id={`${titleId}-words`}
            aria-label={`${book.short} lesson ${lesson.number} words`}
            className="mt-1 max-h-[min(40dvh,360px)] overflow-y-auto overscroll-contain rounded-[12px] border-[1.5px] border-line"
          >
            {words.map((word) => (
              <li key={word.key} className="border-b border-line last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-highlight/40">
                  <input
                    type="checkbox"
                    checked={ticked.has(word.key)}
                    onChange={(e) => setKeys([word.key], e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-rust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-dark"
                  />
                  <span className="w-6 shrink-0 text-right font-body text-body-sm tabular-nums text-bark-muted">{word.num}</span>
                  <span lang="zh-CN" className="shrink-0 font-hanzi text-[19px] font-medium text-bark">
                    {word.hanzi}
                  </span>
                  <span className="min-w-0 flex-1 font-body text-body-sm leading-5 text-bark-muted">
                    <span className="text-bark">{word.pinyin}</span> {word.en}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!group && count === 0}
          onClick={() => onSave(words.filter((w) => ticked.has(w.key)).map((w) => w.key), size)}
        >
          {group ? "Update" : `Add ${count} ${count === 1 ? "word" : "words"}`}
        </Button>
      </div>
    </section>
  );
}

/* Your deck */

/**
 * What's in the deck: each level or set picked from and each book lesson
 * as a row with its word count, words added by search as chips, all
 * removable, and the total (a word in two groups counts once). A lesson
 * row says what was taken ("words 1–10", "12 picked") and reopens the
 * lesson's panel. On phones it sits under the grid and folds; from lg
 * it's a side column.
 */
export function DeckPanel({
  groups,
  total,
  standard,
  books,
  open,
  onOpenChange,
  onOpenLesson,
  onRemoveGroup,
  onRemovePick,
}: {
  groups: readonly DeckGroup[];
  total: number;
  standard: HskStandard;
  /** For describing lesson rows; without it they show their count. */
  books: BookVocabBook[] | null;
  /** Unfolded, below lg (from lg it's always open). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLesson: (book: string, lesson: number) => void;
  onRemoveGroup: (id: string) => void;
  onRemovePick: (pick: SearchPick) => void;
}) {
  const labels = new Map(deckSets(standard).map((s) => [s.id as string, s.label]));
  const rows = groups.filter((g) => g.kind !== "search");
  const picks = groups.find((g) => g.kind === "search")?.picks ?? [];
  const remove = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING}`;

  return (
    <section
      aria-labelledby="deck-panel-title"
      className="flex min-h-0 shrink-0 flex-col border-line lg:w-72 lg:border-l-[1.5px]"
    >
      <h3 id="deck-panel-title" className="shrink-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={`flex h-12 w-full items-center gap-2 px-4 text-left sm:px-6 lg:pointer-events-none lg:px-4 ${FOCUS_RING}`}
        >
          <span className="font-heading text-h3 font-bold text-bark">Your deck</span>
          <span className="font-body text-body font-medium tabular-nums text-bark-muted" aria-live="polite">
            {total} {total === 1 ? "card" : "cards"}
          </span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`ml-auto text-bark-muted transition-transform lg:hidden ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6 lg:block lg:max-h-none lg:px-4 ${
          open ? "max-h-[32dvh]" : "hidden"
        }`}
      >
        {groups.length === 0 ? (
          <p className="py-2 font-body text-body-sm text-bark-muted">
            Empty. Pick words, add a level or lesson, or search.
          </p>
        ) : (
          <>
            {rows.length > 0 && (
              <ul className="flex flex-col divide-y-[1.5px] divide-line">
                {rows.map((g) => {
                  const id = groupId(g);
                  const count = groupKeys(g).length;
                  const words = `${count} ${count === 1 ? "word" : "words"}`;
                  if (g.kind === "lesson") {
                    const label = `${g.label} L${g.lesson}`;
                    const lessonKeys = books
                      ?.find((b) => b.slug === g.book)
                      ?.lessons.find((l) => l.number === g.lesson)
                      ?.words.map((w) => w.key);
                    const pick = lessonKeys ? describeLessonPick(lessonKeys, g.keys, g.size) : null;
                    const detail = pick && pick.kind !== "all" ? lessonPickText(pick, lessonKeys!.length) : null;
                    return (
                      <li key={id} className="flex items-center gap-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenLesson(g.book, g.lesson)}
                          aria-label={`Edit ${label}${detail ? `, ${detail}` : ""}, ${words}`}
                          className={`-ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1 text-left transition-colors hover:bg-highlight/60 ${FOCUS_RING}`}
                        >
                          <span className="min-w-0 flex-1 font-body text-body font-medium text-bark">
                            <span lang="zh-CN">{g.label}</span> L{g.lesson}
                            {detail && <span className="font-normal text-bark-muted"> · {detail}</span>}
                          </span>
                          {!detail && <span className="shrink-0 font-body text-body-sm tabular-nums text-bark-muted">{words}</span>}
                        </button>
                        <button type="button" onClick={() => onRemoveGroup(id)} aria-label={`Remove ${label}`} className={`-mr-2 ${remove}`}>
                          <X size={18} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  }
                  const label = labels.get(g.set) ?? g.set.toUpperCase();
                  return (
                    <li key={id} className="flex items-center gap-2 py-0.5">
                      <span className="min-w-0 flex-1 truncate font-body text-body font-medium text-bark">{label}</span>
                      <span className="font-body text-body-sm tabular-nums text-bark-muted">{words}</span>
                      <button type="button" onClick={() => onRemoveGroup(id)} aria-label={`Remove ${label}`} className={`-mr-2 ${remove}`}>
                        <X size={18} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {picks.length > 0 && (
              <div className="pt-2">
                <p className="font-body text-body-sm text-bark-muted">Added by search</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {picks.map((pick) => (
                    <li key={pick.key}>
                      <button
                        type="button"
                        onClick={() => onRemovePick(pick)}
                        aria-label={`Remove ${pick.hanzi}`}
                        className={`inline-flex h-11 items-center gap-1 rounded-pill border-[1.5px] border-line bg-surface-raised pl-3 pr-2 transition-colors hover:bg-highlight/60 ${FOCUS_RING}`}
                      >
                        <span lang="zh-CN" className="font-hanzi text-[17px] font-medium text-bark">
                          {pick.hanzi}
                        </span>
                        <X size={16} aria-hidden="true" className="text-bark-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
