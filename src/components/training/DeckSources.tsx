"use client";

import { Check, ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { BookVocabBook } from "@/lib/book/vocab";
import { devError } from "@/lib/dev";
import { levelLabel, wordLevel, type HskStandard } from "@/lib/hsk";
import { createClient } from "@/lib/supabase/client";
import { deckSets } from "@/lib/training/deck";
import { bookMatchRank } from "@/lib/training/deckSearch";
import { groupId, groupKeys, wordKey, type DeckGroup, type DeckKey, type SearchPick } from "@/lib/training/flashDeck";

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

/**
 * The HSK Book source: a switch between the books, and a tile per lesson
 * (number and word count, proper nouns left out). A tile adds the
 * lesson's words as one group; tapping it again takes the group out.
 */
export function BookSource({
  books,
  book,
  onBook,
  groups,
  onToggle,
  onRetry,
}: {
  books: BookData;
  book: string | null;
  onBook: (slug: string) => void;
  groups: readonly DeckGroup[];
  onToggle: (group: Extract<DeckGroup, { kind: "lesson" }>) => void;
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
  const added = new Set(groups.map(groupId));
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
          const group = {
            kind: "lesson" as const,
            book: current.slug,
            label: current.short,
            lesson: lesson.number,
            keys: lesson.words.map((w) => w.key),
          };
          const on = added.has(groupId(group));
          return (
            <button
              key={lesson.number}
              type="button"
              aria-pressed={on}
              aria-label={`Lesson ${lesson.number}, ${lesson.words.length} words${lesson.title_en ? `: ${lesson.title_en}` : ""}`}
              title={lesson.title_en}
              onClick={() => onToggle(group)}
              className={`relative flex min-h-16 flex-col items-center justify-center rounded-[12px] border-[1.5px] px-1 py-2 transition-colors ${FOCUS_RING} ${
                on ? "border-rust bg-rust/12" : "border-line bg-surface-raised hover:bg-highlight/50"
              }`}
            >
              {on && <Check size={14} aria-hidden="true" className="absolute right-1.5 top-1.5 text-rust-dark" />}
              <span className="font-heading text-[19px] font-bold leading-6 text-bark">L{lesson.number}</span>
              <span className="font-body text-[13px] leading-5 text-bark-muted">{lesson.words.length} words</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Your deck */

/**
 * What's in the deck: each level or set picked from and each book lesson
 * as a row with its word count, words added by search as chips, all
 * removable, and the total (a word in two groups counts once). On phones
 * it sits under the grid and folds; from lg it's a side column.
 */
export function DeckPanel({
  groups,
  total,
  standard,
  onRemoveGroup,
  onRemovePick,
}: {
  groups: readonly DeckGroup[];
  total: number;
  standard: HskStandard;
  onRemoveGroup: (id: string) => void;
  onRemovePick: (pick: SearchPick) => void;
}) {
  const [open, setOpen] = useState(false);
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
          onClick={() => setOpen((o) => !o)}
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
                  const label =
                    g.kind === "set" ? (labels.get(g.set) ?? g.set.toUpperCase()) : `${g.label} · Lesson ${g.lesson}`;
                  const count = groupKeys(g).length;
                  return (
                    <li key={id} className="flex items-center gap-2 py-0.5">
                      <span lang={g.kind === "lesson" ? "zh-CN" : undefined} className="min-w-0 flex-1 truncate font-body text-body font-medium text-bark">
                        {label}
                      </span>
                      <span className="font-body text-body-sm tabular-nums text-bark-muted">
                        {count} {count === 1 ? "word" : "words"}
                      </span>
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
