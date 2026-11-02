import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";

function Toggles({ className }: { className: string }) {
  return (
    <div className={`h-9 shrink-0 items-center gap-1 rounded-pill border-[1.5px] border-line p-0.5 ${className}`}>
      <Skeleton variant="rounded-full" className="h-full w-14" />
      <Skeleton variant="rounded-full" className="h-full w-16" />
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <SkeletonLine line="h-7" className="h-5 w-44" />
      <div>
        <SkeletonLine className="h-4 w-full" />
        <SkeletonLine className="h-4 w-11/12" />
        <SkeletonLine className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export default function LessonLoading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <Skeleton variant="rounded-full" className="h-11 w-48" />

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        {/* The contents, as in LessonView. */}
        <div className="hidden lg:block">
          <SkeletonLine line="mb-2 mx-3 h-7" className="h-3.5 w-24" />
          <div className="flex flex-col gap-0.5 border-l-[1.5px] border-line">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonLine key={i} line="mx-3 h-8" className="h-3.5 w-28" />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex min-h-7 items-center gap-2">
              <Skeleton variant="rounded-full" className="h-6 w-14 shrink-0" />
              <SkeletonLine line="h-5" className="h-3.5 w-24" />
              <Toggles className="ml-auto inline-flex lg:hidden" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <SkeletonPageTitle className="w-64 max-w-full" />
              </div>
              <Toggles className="hidden lg:inline-flex" />
            </div>
            <SkeletonLine line="-mt-2 h-5" className="h-3.5 w-20" />
            <SkeletonLine line="h-5" className="h-3.5 w-44" />
            <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded-full" className="h-9 w-24 shrink-0" />
              ))}
            </div>
          </div>

          {/* Overview: the summary, the pattern, the first example. */}
          <div className="flex flex-col gap-4 rounded-[22px] border-[1.5px] border-rust/25 bg-rust/[0.06] p-5">
            <div>
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[62px] w-20" />
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-surface-raised p-4">
              <div className="min-w-0 flex-1">
                <SkeletonLine line="h-8" className="h-5 w-48 max-w-full" />
                <SkeletonLine className="h-4 w-40 max-w-full" />
              </div>
              <Skeleton variant="rounded-full" className="h-8 w-8 shrink-0" />
            </div>
          </div>

          <SectionSkeleton />
          <SectionSkeleton />

          <div className={`${CARD} flex flex-col gap-1`}>
            <SkeletonLine line="mb-2 h-7" className="h-5 w-24" />
            <div className="flex flex-col divide-y-[1.5px] divide-line">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <Skeleton variant="rounded-full" className="mt-1 h-6 w-6 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <SkeletonLine line="h-8" className="h-5 w-52 max-w-full" />
                    <SkeletonLine className="h-4 w-44 max-w-full" />
                  </div>
                  <Skeleton variant="rounded-full" className="h-8 w-8 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
