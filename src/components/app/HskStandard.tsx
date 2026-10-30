"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { HskStandard } from "@/lib/hsk";

const HskStandardContext = createContext<HskStandard | null>(null);

/** The signed-in user's HSK standard, for every page in the app and focus
 *  layouts (both wrap their pages in this). */
export function HskStandardProvider({ standard, children }: { standard: HskStandard; children: ReactNode }) {
  return <HskStandardContext.Provider value={standard}>{children}</HskStandardContext.Provider>;
}

export function useHskStandard(): HskStandard {
  const standard = useContext(HskStandardContext);
  if (!standard) throw new Error("useHskStandard must be used inside <HskStandardProvider>");
  return standard;
}
