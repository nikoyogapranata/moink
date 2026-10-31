"use client";

import { useId, useState } from "react";

import { useHskStandard } from "@/components/app/HskStandard";
import { CARD } from "@/components/app/card";
import { levelLabel } from "@/lib/hsk";
import { numberFormat } from "@/lib/dictionary/words";
import { WORD_STAT_INFO, type LevelProgress } from "@/lib/training/stats";

/** Levels shown before "Show all levels": up to this many above the
 *  target. */
const LEVELS_ABOVE_TARGET = 2;

const pct = (n: number, total: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");

function LevelRow({ row, isTarget }: { row: LevelProgress; isTarget: boolean }) {
  const standard = useHskStandard();
  const label = levelLabel(row.level, standard);
  // On the target row's highlight, bark-muted is under 4.5:1 and the
  // usual track barely shows.
  const muted = isTarget ? "text-bark" : "text-bark-muted";
  return (
    <li className={`rounded-lg px-3 py-2.5 ${isTarget ? "bg-highlight" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-body text-body text-bark">
          <span className={isTarget ? "font-bold" : "font-medium"}>{label}</span>
          {isTarget && <span className="ml-2 font-body text-body-sm text-rust-dark">Your level</span>}
        </p>
        <p className="font-body text-body tabular-nums text-bark">
          <span className="font-bold">{numberFormat.format(row.learned)}</span>
          <span className={muted}> / {numberFormat.format(row.total)}</span>
          <span className="sr-only"> learned, {numberFormat.format(row.started)} started</span>
        </p>
      </div>
      {/* Started behind learned: learned is always part of started. */}
      <div
        aria-hidden="true"
        className={`relative mt-1.5 h-2.5 overflow-hidden rounded-pill ${isTarget ? "bg-surface-raised" : "bg-line/70"}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-pill bg-rust/35" style={{ width: pct(row.started, row.total) }} />
        <div className="absolute inset-y-0 left-0 rounded-pill bg-rust" style={{ width: pct(row.learned, row.total) }} />
      </div>
      {row.started > row.learned && (
        <p aria-hidden="true" className={`mt-1 font-body text-body-sm ${muted}`}>
          {numberFormat.format(row.started)} started
        </p>
      )}
    </li>
  );
}

/** Learned (and started) words per level of the user's standard, the
 *  target level highlighted; levels far above it behind a toggle. */
export function ProgressCard({ levels, target }: { levels: LevelProgress[]; target: number | null }) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const focus = target ?? 1;
  const hidden = levels.filter((row) => row.level > focus + LEVELS_ABOVE_TARGET);
  const shown = showAll ? levels : levels.filter((row) => row.level <= focus + LEVELS_ABOVE_TARGET);

  return (
    <section aria-labelledby="progress-title" className={`${CARD} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="progress-title" className="font-heading text-h2 font-bold text-bark">
          Progress
        </h2>
        <p aria-hidden="true" className="flex items-center gap-3 font-body text-body-sm text-bark-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rust" />
            Learned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rust/35" />
            Started
          </span>
        </p>
      </div>
      <p className="font-body text-body-sm text-bark-muted">{WORD_STAT_INFO.learned.info}</p>
      <ul id={listId} className="-mx-3 flex flex-col gap-1">
        {shown.map((row) => (
          <LevelRow key={row.level} row={row} isTarget={row.level === target} />
        ))}
      </ul>
      {hidden.length > 0 && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((s) => !s)}
          className="self-start rounded-sm font-body text-body font-medium text-rust-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
        >
          {showAll ? "Show fewer levels" : "Show all levels"}
        </button>
      )}
    </section>
  );
}
