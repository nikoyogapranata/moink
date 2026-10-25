"use client";

import { Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useAppUser } from "@/components/app/AppShell";
import { CARD, RecentlyViewedCard, WordOfTheDayCard } from "@/components/dictionary/SideCards";
import { WordPanel, type WordTab } from "@/components/dictionary/WordPanel";
import { TrainingIdsContext } from "@/lib/dictionary/training";
import {
  LEVEL_FILTERS,
  WORD_DETAIL_COLUMNS,
  WORD_LIST_COLUMNS,
  levelLabel,
  listQuery,
  numberFormat,
  parseLevel,
  type LevelFilter,
  type WordDetail,
  type WordListItem,
} from "@/lib/dictionary/words";
import { createClient } from "@/lib/supabase/client";

const PAGE = 50;
const DEBOUNCE_MS = 250;
const EMPTY_BAO = { src: "/images/mascot/bao/feature-2-reading.webp", width: 717, height: 900 };

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

interface ListState {
  key: string;
  items: WordListItem[];
  total: number;
  done: boolean;
  error: boolean;
}

async function fetchPage(q: string, level: LevelFilter, offset: number) {
  const supabase = createClient();
  if (q) {
    const { data, error } = await supabase.rpc("search_words", {
      p_query: q,
      p_level: level === "all" ? null : Number(level),
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw error;
    return { items: data ?? [], total: data?.[0]?.total_count ?? (offset === 0 ? 0 : null) };
  }
  let query = supabase.from("words").select(WORD_LIST_COLUMNS, { count: "exact" });
  if (level === "5") query = query.gte("hsk_level", 5);
  else if (level !== "all") query = query.eq("hsk_level", Number(level));
  const { data, error, count } = await query
    .order("hsk_level")
    .order("sort_order", { nullsFirst: false })
    .order("id")
    .range(offset, offset + PAGE - 1);
  if (error) throw error;
  return { items: data ?? [], total: count };
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

export function DictionaryView({
  defaultLevel,
  wordOfTheDay,
  dateLabel,
}: {
  defaultLevel: LevelFilter;
  wordOfTheDay: WordDetail | null;
  dateLabel: string;
}) {
  const router = useRouter();
  const user = useAppUser();
  const params = useSearchParams();

  const q = (params.get("q") ?? "").trim();
  const levelParam = parseLevel(params.get("level"));
  const level = levelParam ?? defaultLevel;
  const wordId = Number(params.get("word")) || null;
  const tab: WordTab = params.get("tab") === "writing" ? "writing" : "meaning";
  const listKey = `${level}|${q}`;

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

  /* List: first page per (level, query), more pages on scroll. Responses
     for an older key are dropped. */
  const [list, setList] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const request = ++requestRef.current;
    fetchPage(q, level, 0)
      .then(({ items, total }) => {
        if (requestRef.current !== request) return;
        setList({ key: listKey, items, total: total ?? items.length, done: items.length < PAGE, error: false });
      })
      .catch(() => {
        if (requestRef.current !== request) return;
        setList({ key: listKey, items: [], total: 0, done: true, error: true });
      });
  }, [q, level, listKey]);

  const current = list?.key === listKey ? list : null;

  const loadMore = useCallback(() => {
    if (!current || current.done || loadingMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    fetchPage(q, level, current.items.length)
      .then(({ items }) => {
        if (requestRef.current !== request) return;
        setList((prev) =>
          prev && prev.key === listKey
            ? { ...prev, items: [...prev.items, ...items], done: items.length < PAGE }
            : prev,
        );
      })
      .catch(() => {
        if (requestRef.current === request) setList((prev) => (prev ? { ...prev, done: true } : prev));
      })
      .finally(() => setLoadingMore(false));
  }, [current, loadingMore, q, level, listKey]);

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
  const [selected, setSelected] = useState<{ id: number; word: WordDetail | null } | null>(null);
  useEffect(() => {
    if (!wordId) return;
    let cancelled = false;
    createClient()
      .from("words")
      .select(WORD_DETAIL_COLUMNS)
      .eq("id", wordId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSelected({ id: wordId, word: data ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [wordId]);
  const selectedWord = wordId && selected?.id === wordId ? selected.word : null;
  const selectedLoading = wordId !== null && selected?.id !== wordId;

  const wordHref = (id: number) => `/dictionary/${id}${listQuery(q, levelParam)}`;

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
                onDetails={() => openWord(wordOfTheDay.id)}
              />
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

          <div>
            <p aria-live="polite" className="mb-2 min-h-6 px-1 font-body text-body text-bark-muted">
              {countLine}
            </p>

            {!current && <SkeletonRows />}

            {current?.error && (
              <p role="alert" className="px-1 font-body text-body text-bark">
                Couldn&apos;t load words. Check your connection and try again.
              </p>
            )}

            {current && !current.error && current.items.length === 0 && q && (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <Image src={EMPTY_BAO.src} alt="" width={EMPTY_BAO.width} height={EMPTY_BAO.height} className="h-28 w-auto" />
                <p className="font-body text-body text-bark">No words match &ldquo;{q}&rdquo;</p>
              </div>
            )}

            {current && current.items.length > 0 && (
              <ul aria-label="Words" onKeyDown={onListKeyDown} className="flex flex-col gap-0.5">
                {current.items.map((w, i) => {
                  const isSelected = w.id === wordId;
                  return (
                    <li key={w.id}>
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
                        {showLevelPill && (
                          <span className="shrink-0 rounded-pill border-[1.5px] border-line px-2 py-0.5 font-body text-[12px] leading-4 text-bark-muted">
                            HSK {w.hsk_level}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {current && !current.done && (
              <div ref={sentinelRef}>{loadingMore && <SkeletonRows count={3} />}</div>
            )}
          </div>
        </div>

        {/* Right column (desktop) */}
        <aside aria-label="Word details" className="hidden min-w-0 lg:block">
          <div className="sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto">
            {wordId ? (
              <div className={CARD}>
                {selectedLoading && <SkeletonRows count={4} />}
                {!selectedLoading && !selectedWord && (
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
                    onDetails={() => openWord(wordOfTheDay.id)}
                  />
                )}
                <RecentlyViewedCard onOpen={(w) => openWord(w.id)} />
              </>
            )}
          </div>
        </aside>
      </div>
    </TrainingIdsContext.Provider>
  );
}
