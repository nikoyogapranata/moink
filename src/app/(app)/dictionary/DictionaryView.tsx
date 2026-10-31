"use client";

import { Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { useAppUser } from "@/components/app/AppShell";
import { useHskStandard } from "@/components/app/HskStandard";
import { RetryButton } from "@/components/app/RetryButton";
import { CARD, RecentlyViewedCard, WordOfTheDayCard } from "@/components/dictionary/SideCards";
import { WordPanel, type WordTab } from "@/components/dictionary/WordPanel";
import { devError } from "@/lib/dev";
import { storeSort, useStoredSort } from "@/lib/dictionary/sort";
import { TrainingIdsContext } from "@/lib/dictionary/training";
import {
  LEVEL_FILTERS,
  WORD_DETAIL_COLUMNS,
  WORD_LIST_COLUMNS,
  levelLabel,
  listQuery,
  numberFormat,
  parseLevel,
  parseSort,
  type LevelFilter,
  type ListSort,
  type WordDetail,
  type WordListItem,
} from "@/lib/dictionary/words";
import {
  levelLabel as hskLevelLabel,
  LEVEL_COLUMN,
  SORT_COLUMN,
  wordLevel,
  type HskStandard,
} from "@/lib/hsk";
import { toPinyinPlain } from "@/lib/pinyin";
import { createClient } from "@/lib/supabase/client";

const PAGE = 50;
const DEBOUNCE_MS = 250;
const EMPTY_BAO = { src: "/images/mascot/bao/feature-2-reading.webp", width: 717, height: 900 };

const SORTS: { value: ListSort; label: string }[] = [
  { value: "common", label: "Common first" },
  { value: "az", label: "A to Z" },
];
const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const SEARCH_ORDER_HINT = "Sorted by best match";

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/** Change the URL's search params without a server round trip. Next keeps
 *  useSearchParams in sync with history.pushState / replaceState, so back
 *  and forward restore every piece of state kept here. */
function setParams(patch: Record<string, string | null>, mode: "push" | "replace") {
  const next = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  const url = query ? `?${query}` : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** A stretch of the list: `items` are rows start, start + 1, ... After a
 *  jump to a letter it starts partway in, and scrolling up loads earlier
 *  pages. */
interface ListState {
  key: string;
  start: number;
  items: WordListItem[];
  total: number;
  /** Nothing more after the last item. */
  done: boolean;
  error: boolean;
}

/** Rows from..from+count-1 of the list: search results (search_words,
 *  which reads the standard from the profile, always by relevance), or
 *  every word at `level`, in level order in `standard` (words with no
 *  level in it last) or A to Z (words.sort_az). */
async function fetchPage(
  q: string,
  level: LevelFilter,
  sort: ListSort,
  standard: HskStandard,
  from: number,
  count = PAGE,
) {
  const supabase = createClient();
  if (q) {
    const { data, error } = await supabase.rpc("search_words", {
      p_query: q,
      p_level: level === "all" ? null : Number(level),
      p_limit: count,
      p_offset: from,
    });
    if (error) throw error;
    return { items: data ?? [], total: data?.[0]?.total_count ?? (from === 0 ? 0 : null) };
  }
  const column = LEVEL_COLUMN[standard];
  let query = supabase.from("words").select(WORD_LIST_COLUMNS, { count: "exact" });
  if (level === "5") query = query.gte(column, 5);
  else if (level !== "all") query = query.eq(column, Number(level));
  query =
    sort === "az"
      ? query.order("sort_az").order("id")
      : query
          .order(column, { nullsFirst: false })
          .order(SORT_COLUMN[standard], { nullsFirst: false })
          .order("id");
  const { data, error, count: total } = await query.range(from, from + count - 1);
  if (error) throw error;
  return { items: data ?? [], total };
}

/** Where each letter's words start in the A to Z list at `level`
 *  (word_letter_counts, added up). Letters with no words are missing. */
async function fetchLetterStarts(level: LevelFilter, standard: HskStandard) {
  const { data, error } = await createClient().rpc("word_letter_counts", {
    p_standard: standard,
    p_level: level === "all" ? null : Number(level),
  });
  if (error) throw error;
  const starts = new Map<string, number>();
  let offset = 0;
  for (const { letter, word_count } of data ?? []) {
    starts.set(letter, offset);
    offset += word_count;
  }
  return starts;
}

/** The A to Z header a word sits under: its pinyin's first letter, as
 *  in words.sort_az. */
function letterOf(word: WordListItem) {
  return toPinyinPlain(word.pinyin)?.[0]?.toUpperCase() ?? "#";
}

const letterId = (letter: string) => `dictionary-letter-${letter}`;

/** Runs of words under the same letter; `from` is the first one's index
 *  in `items`. */
function groupByLetter(items: WordListItem[]) {
  const groups: { letter: string; from: number; items: WordListItem[] }[] = [];
  items.forEach((w, i) => {
    const letter = letterOf(w);
    const last = groups.at(-1);
    if (last?.letter === letter) last.items.push(w);
    else groups.push({ letter, from: i, items: [w] });
  });
  return groups;
}

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <span className="h-8 w-12 rounded-md bg-highlight/60 motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-4 w-24 rounded bg-highlight/60 motion-safe:animate-pulse" />
            <span className="h-4 w-40 rounded bg-highlight/40 motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** In place of the word of the day when the page couldn't load it. */
function WordOfTheDayError() {
  return (
    <section aria-label="Word of the day" className={`${CARD} flex flex-col items-start gap-3`}>
      <p role="alert" className="font-body text-body text-bark">
        Couldn&apos;t load the word of the day.
      </p>
      <RetryButton />
    </section>
  );
}

/** Common first / A to Z. Off while searching: results come by relevance. */
function SortControl({
  sort,
  searching,
  onChange,
}: {
  sort: ListSort;
  searching: boolean;
  onChange: (sort: ListSort) => void;
}) {
  const hint = searching ? SEARCH_ORDER_HINT : undefined;
  return (
    <div
      role="group"
      aria-label="Sort"
      title={hint}
      className="ml-auto inline-flex h-9 shrink-0 items-center rounded-pill border-[1.5px] border-line p-0.5"
    >
      {SORTS.map(({ value, label }) => {
        const active = !searching && value === sort;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={searching}
            title={hint}
            onClick={() => onChange(value)}
            className={`h-full rounded-pill px-3 font-body text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:cursor-not-allowed disabled:opacity-60 ${
              active ? "bg-highlight text-bark" : "text-bark-muted enabled:hover:text-bark"
            }`}
          >
            {label}
          </button>
        );
      })}
      {searching && <span className="sr-only">{SEARCH_ORDER_HINT}</span>}
    </div>
  );
}

/** A to Z down the list's right edge (desktop): each letter jumps to its
 *  words; letters with none are dimmed. */
function LetterIndex({
  starts,
  onJump,
}: {
  starts: ReadonlyMap<string, number> | null;
  onJump: (letter: string) => void;
}) {
  return (
    <nav aria-label="Jump to letter" className="sticky top-4 hidden shrink-0 flex-col self-start pt-8 lg:flex">
      {ALPHABET.map((letter) => (
        <button
          key={letter}
          type="button"
          disabled={!starts?.has(letter)}
          onClick={() => onJump(letter)}
          className="flex h-5 w-6 items-center justify-center rounded font-body text-[11px] font-semibold leading-none text-rust-dark transition-colors hover:bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:text-bark-muted/40 disabled:hover:bg-transparent"
        >
          {letter}
        </button>
      ))}
    </nav>
  );
}

export function DictionaryView({
  defaultLevel,
  wordOfTheDay,
  wordOfTheDayFailed = false,
  dateLabel,
}: {
  defaultLevel: LevelFilter;
  wordOfTheDay: WordDetail | null;
  /** The page's word_of_the_day call failed (not: there's none today). */
  wordOfTheDayFailed?: boolean;
  dateLabel: string;
}) {
  const router = useRouter();
  const user = useAppUser();
  const standard = useHskStandard();
  const params = useSearchParams();

  const q = (params.get("q") ?? "").trim();
  const levelParam = parseLevel(params.get("level"));
  const level = levelParam ?? defaultLevel;
  const wordId = Number(params.get("word")) || null;
  const tab: WordTab = params.get("tab") === "writing" ? "writing" : "meaning";

  /* Browse order: ?sort= if given, else the one picked last time. The
     remembered one isn't known until hydration, so the list waits for it.
     Search results ignore it. */
  const sortParam = parseSort(params.get("sort"));
  const storedSort = useStoredSort();
  const sort = sortParam ?? storedSort ?? "common";
  const sortKnown = sortParam !== null || storedSort !== null;
  const browseAz = sort === "az" && !q;
  const listKey = `${standard}|${level}|${q}|${q ? "rank" : sort}`;

  // The URL shows a remembered A to Z, so a reload or a shared link keeps it.
  useEffect(() => {
    if (sortParam === null && storedSort === "az") setParams({ sort: "az" }, "replace");
  }, [sortParam, storedSort]);

  function chooseSort(next: ListSort) {
    storeSort(next);
    // A preference, not a place: replace, so Back doesn't step through it.
    setParams({ sort: next === "az" ? "az" : null }, "replace");
  }

  /* Search field: local while typing, written to ?q= after a pause. When
     ?q= changes from outside (back/forward), the field follows. */
  const [input, setInput] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setInput(q);
  }
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = input.trim();
    if (next === q) return;
    const timer = setTimeout(() => setParams({ q: next || null }, "replace"), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, q]);

  // "/" focuses the search field (desktop).
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!isDesktop()) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* List: first page per (level, query, sort), more pages on scroll; in
     A to Z, a jump to a letter starts it there and scrolling up loads
     earlier pages. Responses for an older key, or from before a jump, are
     dropped. */
  const [list, setList] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  // Bumped by Try again: the first page loads again.
  const [listAttempt, setListAttempt] = useState(0);
  // The list whose later page failed: scrolling stops loading it until
  // Try again. Keyed, so another query or level starts clean.
  const [moreErrorKey, setMoreErrorKey] = useState<string | null>(null);
  const moreError = moreErrorKey === listKey;
  const [earlierErrorKey, setEarlierErrorKey] = useState<string | null>(null);
  const earlierError = earlierErrorKey === listKey;
  const requestRef = useRef(0);

  useEffect(() => {
    if (!sortKnown && !q) return;
    const request = ++requestRef.current;
    fetchPage(q, level, sort, standard, 0)
      .then(({ items, total }) => {
        if (requestRef.current !== request) return;
        setList({
          key: listKey,
          start: 0,
          items,
          total: total ?? items.length,
          done: items.length < PAGE,
          error: false,
        });
      })
      .catch((error) => {
        if (requestRef.current !== request) return;
        devError(`DictionaryView: couldn't load the list (${listKey}).`, error);
        setList({ key: listKey, start: 0, items: [], total: 0, done: true, error: true });
      });
  }, [q, level, sort, sortKnown, standard, listKey, listAttempt]);

  const current = list?.key === listKey ? list : null;

  const loadMore = useCallback(() => {
    if (!current || current.done || loadingMore || moreError) return;
    const request = requestRef.current;
    setLoadingMore(true);
    fetchPage(q, level, sort, standard, current.start + current.items.length)
      .then(({ items }) => {
        if (requestRef.current !== request) return;
        setList((prev) =>
          prev && prev.key === listKey
            ? { ...prev, items: [...prev.items, ...items], done: items.length < PAGE }
            : prev,
        );
      })
      .catch((error) => {
        devError(`DictionaryView: couldn't load more of the list (${listKey}).`, error);
        if (requestRef.current === request) setMoreErrorKey(listKey);
      })
      .finally(() => setLoadingMore(false));
  }, [current, loadingMore, moreError, q, level, sort, standard, listKey]);

  // Rows added above keep what's on screen in place: the first row before
  // the prepend is put back where it was. The browser's own scroll
  // anchoring is off here, so the two don't both adjust (and Safari has
  // none). These scrolls are instant: the page scrolls smoothly, and a
  // correction still animating when the next page lands would compound.
  const anchorRef = useRef<{ id: number; top: number } | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    return () => {
      root.style.overflowAnchor = previous;
    };
  }, []);

  const loadEarlier = useCallback(() => {
    if (!current || current.start === 0 || loadingEarlier || earlierError) return;
    const request = requestRef.current;
    const from = Math.max(0, current.start - PAGE);
    setLoadingEarlier(true);
    fetchPage(q, level, sort, standard, from, current.start - from)
      .then(({ items }) => {
        if (requestRef.current !== request) return;
        const first = current.items[0];
        const el = first && document.querySelector(`[data-word-id="${first.id}"]`);
        anchorRef.current = el ? { id: first.id, top: el.getBoundingClientRect().top } : null;
        setList((prev) =>
          prev && prev.key === listKey ? { ...prev, start: from, items: [...items, ...prev.items] } : prev,
        );
      })
      .catch((error) => {
        devError(`DictionaryView: couldn't load earlier words (${listKey}).`, error);
        if (requestRef.current === request) setEarlierErrorKey(listKey);
      })
      .finally(() => setLoadingEarlier(false));
  }, [current, loadingEarlier, earlierError, q, level, sort, standard, listKey]);

  /* A to Z: where each letter starts, for the jump index. */
  const [letterStarts, setLetterStarts] = useState<{ key: string; starts: Map<string, number> } | null>(null);
  const lettersKey = `${standard}|${level}`;
  useEffect(() => {
    if (!browseAz) return;
    let cancelled = false;
    fetchLetterStarts(level, standard)
      .then((starts) => {
        if (!cancelled) setLetterStarts({ key: lettersKey, starts });
      })
      // Without them the index stays dimmed; the list itself still works.
      .catch((error) => devError(`DictionaryView: couldn't load the letter index (${lettersKey}).`, error));
    return () => {
      cancelled = true;
    };
  }, [browseAz, level, standard, lettersKey]);
  const starts = letterStarts?.key === lettersKey ? letterStarts.starts : null;

  // The letter to scroll to once its rows are in.
  const pendingLetterRef = useRef<string | null>(null);

  function jumpTo(letter: string) {
    const offset = starts?.get(letter);
    if (offset === undefined || !current) return;
    if (offset >= current.start && offset < current.start + current.items.length) {
      document.getElementById(letterId(letter))?.scrollIntoView({ block: "start", behavior: "instant" });
      return;
    }
    // Not loaded yet: start the list at that letter.
    const request = ++requestRef.current;
    setEarlierErrorKey(null);
    setMoreErrorKey(null);
    fetchPage(q, level, sort, standard, offset)
      .then(({ items, total }) => {
        if (requestRef.current !== request) return;
        pendingLetterRef.current = letter;
        setList({
          key: listKey,
          start: offset,
          items,
          total: total ?? current.total,
          done: items.length < PAGE,
          error: false,
        });
      })
      .catch((error) => {
        if (requestRef.current !== request) return;
        devError(`DictionaryView: couldn't jump to ${letter} (${listKey}).`, error);
        setList({ key: listKey, start: 0, items: [], total: 0, done: true, error: true });
      });
  }

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor) {
      anchorRef.current = null;
      const el = document.querySelector(`[data-word-id="${anchor.id}"]`);
      if (el) window.scrollBy({ top: el.getBoundingClientRect().top - anchor.top, behavior: "instant" });
    }
    const letter = pendingLetterRef.current;
    if (letter) {
      pendingLetterRef.current = null;
      document.getElementById(letterId(letter))?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [current]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !current || current.done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [current, loadMore]);

  const topSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el || !current || current.start === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadEarlier();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [current, loadEarlier]);

  /* Words in the user's training, for the dots. */
  const [trainingIds, setTrainingIds] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = new Set<number>();
      const supabase = createClient();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("user_words")
          .select("word_id")
          .eq("user_id", user.id)
          .eq("skill", "recognition")
          .range(from, from + 999);
        if (error || !data) break;
        for (const row of data) ids.add(row.word_id);
        if (data.length < 1000) break;
      }
      if (!cancelled) setTrainingIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);
  const training = useMemo(
    () => ({
      ids: trainingIds,
      setInTraining: (id: number, inTraining: boolean) =>
        setTrainingIds((prev) => {
          const next = new Set(prev);
          if (inTraining) next.add(id);
          else next.delete(id);
          return next;
        }),
    }),
    [trainingIds],
  );

  /* Selected word (desktop panel). */
  // failed: the load errored (as opposed to no such word).
  const [selected, setSelected] = useState<{ id: number; word: WordDetail | null; failed: boolean } | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState(0);
  useEffect(() => {
    if (!wordId) return;
    let cancelled = false;
    createClient()
      .from("words")
      .select(WORD_DETAIL_COLUMNS)
      .eq("id", wordId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) devError(`DictionaryView: couldn't load word ${wordId}.`, error);
        setSelected({ id: wordId, word: data ?? null, failed: Boolean(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [wordId, selectedAttempt]);
  const selectedWord = wordId && selected?.id === wordId ? selected.word : null;
  const selectedLoading = wordId !== null && selected?.id !== wordId;
  const selectedFailed = wordId !== null && selected?.id === wordId && selected.failed;

  const wordHref = (id: number) => `/dictionary/${id}${listQuery(q, levelParam, sortParam)}`;

  function openWord(id: number) {
    if (isDesktop()) setParams({ word: String(id), tab: null }, "push");
    else router.push(wordHref(id));
  }

  function onRowClick(event: MouseEvent, id: number) {
    // Desktop: select in place. Mobile (or a modified click): follow the
    // link to the standalone word page.
    if (event.metaKey || event.ctrlKey || event.shiftKey || !isDesktop()) return;
    event.preventDefault();
    setParams({ word: String(id), tab: null }, "push");
  }

  /* Arrow keys move through the rows; on desktop the selection follows. */
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const items = current?.items ?? [];
  const selectedIndex = items.findIndex((w) => w.id === wordId);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : Math.min(focusIndex, Math.max(items.length - 1, 0));

  function onListKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const index = rowRefs.current.findIndex((el) => el === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    rowRefs.current[next]?.focus();
    setFocusIndex(next);
    if (isDesktop()) setParams({ word: String(items[next].id), tab: null }, "replace");
  }

  function renderRow(w: WordListItem, i: number) {
    const isSelected = w.id === wordId;
    return (
      <li key={w.id} data-word-id={w.id}>
        <Link
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          href={wordHref(w.id)}
          onClick={(e) => onRowClick(e, w.id)}
          onFocus={() => setFocusIndex(i)}
          tabIndex={i === tabbableIndex ? 0 : -1}
          aria-current={isSelected ? "true" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rust ${
            isSelected ? "bg-highlight" : "hover:bg-highlight/50"
          }`}
        >
          <span lang="zh-CN" className="min-w-12 shrink-0 font-hanzi text-[22px] leading-8 text-bark">
            {w.simplified}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 font-body text-body font-medium text-rust-dark">
              {w.pinyin}
              {trainingIds.has(w.id) && (
                <span title="In your training" className="inline-flex">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-deep-grass" />
                  <span className="sr-only">(in your training)</span>
                </span>
              )}
            </span>
            <span
              className={`truncate font-body text-body ${isSelected ? "text-bark" : "text-bark-muted"}`}
            >
              {w.gloss ?? ""}
            </span>
          </span>
          {showLevelPill && wordLevel(w, standard) !== null && (
            <span className="shrink-0 rounded-pill border-[1.5px] border-line px-2 py-0.5 font-body text-[12px] leading-4 text-bark-muted">
              {hskLevelLabel(wordLevel(w, standard)!, standard)}
            </span>
          )}
        </Link>
      </li>
    );
  }

  const showLevelPill = Boolean(q) || level === "all";
  const countLine = current
    ? q
      ? `${numberFormat.format(current.total)} ${current.total === 1 ? "result" : "results"}`
      : `${levelLabel(level)} · ${numberFormat.format(current.total)} words`
    : null;

  return (
    <TrainingIdsContext.Provider value={training}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[42fr_58fr]">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-4">
          <h1 className="font-heading text-h1 font-bold text-bark lg:text-[1.875rem] lg:leading-[2.375rem]">
            Dictionary
          </h1>

          {!q && wordOfTheDay && (
            <div className="lg:hidden">
              <WordOfTheDayCard
                word={wordOfTheDay}
                dateLabel={dateLabel}
                details={{ onClick: () => openWord(wordOfTheDay.id) }}
              />
            </div>
          )}
          {!q && wordOfTheDayFailed && (
            <div className="lg:hidden">
              <WordOfTheDayError />
            </div>
          )}

          <div className="relative">
            <Search
              size={20}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-bark-muted"
            />
            <input
              ref={inputRef}
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && input) {
                  e.preventDefault();
                  setInput("");
                  setParams({ q: null }, "replace");
                }
              }}
              placeholder="Search hanzi, pinyin, or English"
              aria-label="Search the dictionary"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 w-full rounded-pill border-[1.5px] border-line bg-surface-raised pl-11 pr-12 font-body text-h3 text-bark outline-none transition-[border-color,box-shadow] placeholder:text-bark-muted focus:border-bark-muted focus:ring-2 focus:ring-rust/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setParams({ q: null }, "replace");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="HSK level" className="flex flex-wrap gap-2">
              {LEVEL_FILTERS.map(({ value, label }) => {
                const active = value === level;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setParams({ level: value }, "push")}
                    className={`h-9 rounded-pill border-[1.5px] px-3.5 font-body text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust ${
                      active
                        ? "border-transparent bg-highlight text-bark"
                        : "border-line text-bark-muted hover:bg-highlight/50 hover:text-bark"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <SortControl sort={sort} searching={Boolean(q)} onChange={chooseSort} />
          </div>

          <div className="flex gap-1">
            <div className="min-w-0 flex-1">
              <p aria-live="polite" className="mb-2 min-h-6 px-1 font-body text-body text-bark-muted">
                {countLine}
              </p>

              {!current && <SkeletonRows />}

              {current?.error && (
                <div className="flex flex-col items-start gap-3 px-1">
                  <p role="alert" className="font-body text-body text-bark">
                    Couldn&apos;t load words. Check your connection and try again.
                  </p>
                  <RetryButton
                    onRetry={() => {
                      setList(null);
                      setListAttempt((n) => n + 1);
                    }}
                  />
                </div>
              )}

              {current && !current.error && current.items.length === 0 && q && (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <Image src={EMPTY_BAO.src} alt="" width={EMPTY_BAO.width} height={EMPTY_BAO.height} className="h-28 w-auto" />
                  <p className="font-body text-body text-bark">No words match &ldquo;{q}&rdquo;</p>
                </div>
              )}

              {/* Shown the whole time there are earlier rows, not just while
                  loading, so starting a load doesn't push the list down. */}
              {current && current.start > 0 && !earlierError && (
                <div ref={topSentinelRef}>
                  <SkeletonRows count={3} />
                </div>
              )}
              {current && current.start > 0 && earlierError && (
                <div className="flex flex-wrap items-center gap-3 px-1 py-3">
                  <p role="alert" className="font-body text-body text-bark">
                    Couldn&apos;t load earlier words.
                  </p>
                  <RetryButton onRetry={() => setEarlierErrorKey(null)} />
                </div>
              )}

              {current && current.items.length > 0 && (
                <ul aria-label="Words" onKeyDown={onListKeyDown} className="flex flex-col gap-0.5">
                  {browseAz
                    ? groupByLetter(current.items).map((group) => (
                        <li key={group.letter} id={letterId(group.letter)} aria-labelledby={`${letterId(group.letter)}-title`}>
                          <h2
                            id={`${letterId(group.letter)}-title`}
                            className="sticky top-0 z-10 bg-background px-3 pb-1 pt-2 font-heading text-[13px] font-bold leading-5 text-bark-muted"
                          >
                            {group.letter}
                          </h2>
                          <ul className="flex flex-col gap-0.5">
                            {group.items.map((w, j) => renderRow(w, group.from + j))}
                          </ul>
                        </li>
                      ))
                    : current.items.map((w, i) => renderRow(w, i))}
                </ul>
              )}

              {current && !current.done && moreError && (
                <div className="flex flex-wrap items-center gap-3 px-1 py-3">
                  <p role="alert" className="font-body text-body text-bark">
                    Couldn&apos;t load more words.
                  </p>
                  <RetryButton onRetry={() => setMoreErrorKey(null)} />
                </div>
              )}
              {current && !current.done && !moreError && (
                <div ref={sentinelRef}>{loadingMore && <SkeletonRows count={3} />}</div>
              )}
            </div>
            {browseAz && <LetterIndex starts={starts} onJump={jumpTo} />}
          </div>
        </div>

        {/* Right column (desktop) */}
        <aside aria-label="Word details" className="hidden min-w-0 lg:block">
          <div className="sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto">
            {wordId ? (
              <div className={CARD}>
                {selectedLoading && <SkeletonRows count={4} />}
                {selectedFailed && (
                  <div className="flex flex-col items-start gap-3">
                    <p role="alert" className="font-body text-body text-bark">
                      Couldn&apos;t load this word.
                    </p>
                    <RetryButton
                      onRetry={() => {
                        setSelected(null);
                        setSelectedAttempt((n) => n + 1);
                      }}
                    />
                  </div>
                )}
                {!selectedLoading && !selectedFailed && !selectedWord && (
                  <p className="font-body text-body text-bark">That word couldn&apos;t be found.</p>
                )}
                {selectedWord && (
                  <WordPanel
                    word={selectedWord}
                    tab={tab}
                    onTabChange={(t) => setParams({ tab: t === "writing" ? "writing" : null }, "replace")}
                    onClose={() => setParams({ word: null, tab: null }, "push")}
                  />
                )}
              </div>
            ) : (
              <>
                {wordOfTheDay && (
                  <WordOfTheDayCard
                    word={wordOfTheDay}
                    dateLabel={dateLabel}
                    details={{ onClick: () => openWord(wordOfTheDay.id) }}
                  />
                )}
                {wordOfTheDayFailed && <WordOfTheDayError />}
                <RecentlyViewedCard onOpen={(w) => openWord(w.id)} />
              </>
            )}
          </div>
        </aside>
      </div>
    </TrainingIdsContext.Provider>
  );
}
