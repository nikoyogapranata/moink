"use client";

import { useHskStandard } from "@/components/app/HskStandard";
import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";
import { GRAMMAR_LEVELS } from "@/lib/grammar/display";

function GroupSkeleton({ rows }: { rows: number }) {
  return (
    <div className={`${CARD} px-2 py-3 sm:px-3`}>
      <SkeletonLine line="mx-3 mb-1 h-7" className="h-5 w-32" />
      <ul className="flex flex-col divide-y-[1.5px] divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <SkeletonLine className="h-4 w-56 max-w-full" />
              <SkeletonLine className="h-4 w-32 max-w-full" />
            </span>
            <Skeleton variant="rounded-full" className="h-2.5 w-2.5 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GrammarLoading() {
  const standard = useHskStandard();
  return (
    <SkeletonPage className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <SkeletonPageTitle className="w-32" />
          {standard === "hsk2" && <SkeletonLine line="mt-1 h-5" className="h-3.5 w-52 max-w-full" />}
        </div>
        <div className="flex flex-wrap gap-2">
          {GRAMMAR_LEVELS.map((level) => (
            <Skeleton key={level} variant="rounded-full" className="h-9 w-16" />
          ))}
        </div>
      </header>
      <GroupSkeleton rows={3} />
      <GroupSkeleton rows={3} />
    </SkeletonPage>
  );
}
