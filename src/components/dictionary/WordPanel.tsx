"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { rememberWord } from "@/lib/dictionary/recent";
import { hanziOf, type WordDetail } from "@/lib/dictionary/words";
import { levelNumber } from "@/lib/hsk";
import { createClient } from "@/lib/supabase/client";

import { AudioButton } from "./AudioButton";
import { TrainingButton } from "./TrainingButton";
import { WritingTab } from "./WritingTab";

export type WordTab = "meaning" | "writing";

const TABS: { id: WordTab; label: string }[] = [
  { id: "meaning", label: "Meaning" },
  { id: "writing", label: "Writing" },
];

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-highlight px-3 py-1 font-body text-[13px] leading-5 text-bark">
      {children}
    </span>
  );
}

function MeaningTab({ word }: { word: WordDetail }) {
  const classifiers = word.classifiers ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <p className="font-body text-h1 font-medium text-rust-dark">{word.pinyin}</p>
        <AudioButton text={word.simplified} />
      </div>

      {word.gloss && (
        <p className="font-body text-[18px] font-medium leading-7 text-bark">{word.gloss}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Both standards, when the word has a level in them; the 2021
            HSK 3.0 level (hsk3_level) isn't shown. */}
        {word.hsk3_2025_level !== null && (
          <Chip>HSK 3.0 · level {levelNumber(word.hsk3_2025_level, "hsk3")}</Chip>
        )}
        {word.hsk_level !== null && <Chip>HSK 2.0 · level {levelNumber(word.hsk_level, "hsk2")}</Chip>}
        {word.traditional && word.traditional !== word.simplified && (
          <Chip>
            Traditional <span className="ml-1 font-hanzi">{word.traditional}</span>
          </Chip>
        )}
        {classifiers.length > 0 && (
          <Chip>
            Measure word: <span className="ml-1 font-hanzi">{classifiers.join(" ")}</span>
          </Chip>
        )}
      </div>

      <div>
        <h3 className="font-body text-body font-medium text-bark">All meanings</h3>
        <p className="mt-1 font-body text-body text-bark-muted">{word.meanings.join(" · ")}</p>
      </div>

      <TrainingButton key={word.id} wordId={word.id} simplified={word.simplified} />
    </div>
  );
}

/**
 * A selected word: header, then Meaning / Writing tabs. `onClose` adds a
 * close button (the desktop panel); the standalone word page leaves it out.
 */
export function WordPanel({
  word,
  tab,
  onTabChange,
  onClose,
}: {
  word: WordDetail;
  tab: WordTab;
  onTabChange: (tab: WordTab) => void;
  onClose?: () => void;
}) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [radicals, setRadicals] = useState<Record<string, string>>({});

  useEffect(() => {
    rememberWord(word);
  }, [word]);

  // Radical per character: a single-character word's own row has it; the
  // word's radical belongs to its first character.
  useEffect(() => {
    const chars = [...new Set(hanziOf(word.simplified))];
    let cancelled = false;
    createClient()
      .from("words")
      .select("simplified, radical")
      .in("simplified", chars)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        if (chars[0] && word.radical) map[chars[0]] = word.radical;
        for (const row of data ?? []) if (row.radical) map[row.simplified] = row.radical;
        setRadicals(map);
      });
    return () => {
      cancelled = true;
    };
  }, [word.simplified, word.radical]);

  function onTabKeyDown(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    onTabChange(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <article aria-labelledby={`${baseId}-title`} className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${baseId}-title`} className="font-hanzi text-[44px] font-medium leading-[52px] text-bark">
            {word.simplified}
          </h2>
          <p className="font-body text-body font-medium text-rust-dark">{word.pinyin}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close word"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-bark-muted transition-colors hover:bg-highlight/60 hover:text-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </header>

      <div role="tablist" aria-label="Word details" className="flex gap-1 border-b-[1.5px] border-line">
        {TABS.map((t, i) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`-mb-[1.5px] h-11 rounded-t-md border-b-2 px-4 font-heading text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust ${
                selected ? "border-rust-dark text-bark" : "border-transparent text-bark-muted hover:text-bark"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {tab === "meaning" ? (
          <MeaningTab word={word} />
        ) : (
          <WritingTab word={word.simplified} radicals={radicals} />
        )}
      </div>
    </article>
  );
}
