import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";

/** TodayCard with a review to start, its most common and tallest state. */
export function TodayCardSkeleton() {
  return (
    <div className={`${CARD} flex items-end justify-between gap-4`}>
      <div className="min-w-0">
        <SkeletonLine line="h-7" className="h-5 w-36" />
        <div className="mt-3 flex gap-6 sm:gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SkeletonLine line="h-11" className="h-9 w-10" />
              <SkeletonLine className="h-4 w-10" />
            </div>
          ))}
        </div>
        <Skeleton variant="rounded-full" className="mt-4 h-11 w-36" />
        {/* Two lines beside Bao on phones. */}
        <SkeletonLine line="mt-2 h-5" className="h-3.5 w-52 max-w-full" />
        <SkeletonLine line="h-5 sm:hidden" className="h-3.5 w-24" />
        <SkeletonLine line="mt-2 h-6" className="h-4 w-20" />
      </div>
      <Skeleton className="h-28 w-24 shrink-0 sm:h-36 sm:w-32" />
    </div>
  );
}
