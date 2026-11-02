"use client";

import { useAppUser } from "@/components/app/AppShell";
import { CARD } from "@/components/app/card";
import { WordOfTheDaySkeleton } from "@/components/dictionary/WordOfTheDaySkeleton";
import { TodayCardSkeleton } from "@/components/training/TodayCardSkeleton";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";
import { STANDARD_LEVELS } from "@/lib/hsk";
import { LEVELS_ABOVE_TARGET } from "@/lib/training/stats";

// Relative heights for the Coming up bars.
const BARS = ["h-3/5", "h-2/5", "h-1/2", "h-1/4", "h-1/3", "h-1/5", "h-1/4"];

export default function DashboardLoading() {
  // As many level rows as ProgressCard will show this user.
  const { hskLevel, hskStandard } = useAppUser();
  const levels = STANDARD_LEVELS[hskStandard];
  const rows = levels.filter((level) => level <= (hskLevel ?? 1) + LEVELS_ABOVE_TARGET);
  return (
    <SkeletonPage className="flex flex-col gap-6">
      <header>
        <SkeletonPageTitle className="w-56" />
        <SkeletonLine line="mt-1 h-6" className="h-4 w-52" />
      </header>

      <TodayCardSkeleton />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className={`${CARD} flex flex-col gap-4`}>
          <SkeletonLine line="h-7" className="h-5 w-20" />
          <div className="flex items-end justify-between gap-4">
            <SkeletonLine line="h-11" className="h-9 w-28" />
            <SkeletonLine className="h-4 w-24" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {BARS.map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton variant="rounded-full" className="h-8 w-8" />
                <SkeletonLine line="h-5" className="h-3 w-3" />
              </div>
            ))}
          </div>
          <div>
            <SkeletonLine line="h-5" className="h-3.5 w-full" />
            <SkeletonLine line="h-5" className="h-3.5 w-3/4" />
            <SkeletonLine line="h-5 sm:hidden" className="h-3.5 w-1/2" />
          </div>
        </div>

        <div className={`${CARD} flex flex-col gap-3`}>
          {/* Taller than the title's line: it sits on a baseline with the legend. */}
          <SkeletonLine line="h-8" className="h-5 w-24" />
          <div>
            <SkeletonLine line="h-5" className="h-3.5 w-full" />
            <SkeletonLine line="h-5" className="h-3.5 w-1/3" />
          </div>
          <div className="flex flex-col gap-1">
            {rows.map((level) => (
              <div key={level} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonLine className="h-4 w-14" />
                  <SkeletonLine className="h-4 w-20" />
                </div>
                <Skeleton variant="rounded-full" className="mt-1.5 h-2.5 w-full" />
              </div>
            ))}
          </div>
          {rows.length < levels.length && <SkeletonLine className="h-4 w-28" />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${CARD} flex flex-col gap-1`}>
          <SkeletonLine line="h-7" className="h-5 w-28" />
          <SkeletonLine className="h-4 w-44" />
          <div className="mt-8 grid h-36 grid-cols-7 items-end gap-2">
            {BARS.map((height, i) => (
              <div key={i} className="flex h-full min-w-0 flex-col items-center gap-1.5">
                <div className="flex w-full max-w-10 flex-1 items-end">
                  <Skeleton className={`w-full ${height}`} />
                </div>
                <SkeletonLine line="h-5" className="h-3 w-6" />
              </div>
            ))}
          </div>
        </div>
        <WordOfTheDaySkeleton compact />
      </div>
    </SkeletonPage>
  );
}
