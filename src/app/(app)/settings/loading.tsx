"use client";

import { useHskStandard } from "@/components/app/HskStandard";
import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";
import { HSK_STANDARDS, STANDARD_LEVELS } from "@/lib/hsk";

export default function SettingsLoading() {
  const standard = useHskStandard();
  return (
    <SkeletonPage>
      <header>
        <SkeletonPageTitle className="w-32" />
        <SkeletonLine line="mt-1 h-6" className="h-4 w-48" />
      </header>

      <div className="mt-6 flex flex-col gap-6">
        <div className={`${CARD} flex flex-col gap-5`}>
          <SkeletonLine line="h-7" className="h-5 w-16" />

          <div className="flex flex-col gap-3">
            <SkeletonLine className="h-4 w-28" />
            <div className="grid gap-3 sm:grid-cols-2">
              {HSK_STANDARDS.map((option) => (
                <div key={option} className="flex flex-col gap-1 rounded-lg border-2 border-bark/15 px-4 py-3">
                  <SkeletonLine className="h-4 w-32" />
                  <SkeletonLine line="h-5" className="h-3.5 w-48 max-w-full" />
                  {/* The HSK 3.0 card's longer line wraps on phones. */}
                  {option === "hsk3" && <SkeletonLine line="h-5 sm:hidden" className="h-3.5 w-16" />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <SkeletonLine className="h-4 w-20" />
            <div className="flex flex-wrap gap-2">
              {STANDARD_LEVELS[standard].map((level) => (
                <Skeleton key={level} className="h-12 w-20" />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <SkeletonLine className="h-4 w-24" />
              <SkeletonLine line="h-5" className="h-3.5 w-72 max-w-full" />
              <SkeletonLine line="h-5 sm:hidden" className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-12 w-full max-w-md" />
          </div>

          <Skeleton variant="rounded-full" className="h-11 w-20" />
        </div>

        <Skeleton variant="rounded-full" className="h-11 w-32" />
      </div>
    </SkeletonPage>
  );
}
