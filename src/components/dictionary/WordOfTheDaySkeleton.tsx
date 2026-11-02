import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";

/** WordOfTheDayCard, in the same two sizes. */
export function WordOfTheDaySkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <Skeleton variant="rounded-full" className="h-7 w-28" />
        <SkeletonLine className="h-4 w-24" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <SkeletonLine
            line={compact ? "h-12" : "h-[60px]"}
            className={compact ? "h-10 w-20" : "h-12 w-24"}
          />
          <SkeletonLine line="mt-1 h-8" className="h-5 w-24" />
          <SkeletonLine line="mt-1 h-6" className="h-4 w-36" />
        </div>
        <Skeleton className={`${compact ? "h-20 w-16" : "h-24 w-20"} shrink-0`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* The real buttons' widths: compact's longer label wraps on phones. */}
        <Skeleton variant="rounded-full" className="h-11 w-44" />
        <Skeleton variant="rounded-full" className={`h-11 ${compact ? "w-[170px]" : "w-22"}`} />
      </div>
    </div>
  );
}
