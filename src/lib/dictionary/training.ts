"use client";

import { createContext, useContext } from "react";

/**
 * Which words the user has in training, for the dots in the list. Kept by
 * the dictionary view; the Add/Remove button reports changes through
 * `setInTraining` so the dot updates without a refetch. Optional: the
 * standalone word page has no list, so the context may be missing.
 */
export interface TrainingIds {
  ids: ReadonlySet<number>;
  setInTraining: (wordId: number, inTraining: boolean) => void;
}

export const TrainingIdsContext = createContext<TrainingIds | null>(null);

export function useTrainingIds() {
  return useContext(TrainingIdsContext);
}

/** "due tomorrow", "due in 3 days", "due in 5 hours"; null once it's due. */
export function dueLabel(due: string, now = Date.now()) {
  const ms = new Date(due).getTime() - now;
  if (ms <= 0) return null;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `due ${rtf.format(Math.max(minutes, 1), "minute")}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `due ${rtf.format(hours, "hour")}`;
  const days = Math.round(ms / 86_400_000);
  if (days < 45) return `due ${rtf.format(days, "day")}`;
  return `due ${rtf.format(Math.round(days / 30), "month")}`;
}
