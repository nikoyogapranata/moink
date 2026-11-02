import { CARD } from "@/components/app/card";
import { TodayCardSkeleton } from "@/components/training/TodayCardSkeleton";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";

function ModeHeading() {
  return (
    <>
      <Skeleton className="h-11 w-11" />
      <div>
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-4 w-44 max-w-full" />
      </div>
    </>
  );
}

function ModeCardSkeleton() {
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <ModeHeading />
      <div className="mt-auto flex flex-col gap-3">
        <Skeleton variant="rounded-full" className="h-11 w-40" />
        <div className="min-h-6" />
      </div>
    </div>
  );
}

export default function TrainingLoading() {
  return (
    <SkeletonPage className="flex flex-col gap-6">
      <header>
        <SkeletonPageTitle className="w-36" />
        <SkeletonLine line="mt-1 h-6" className="h-4 w-72 max-w-full" />
      </header>

      <TodayCardSkeleton />

      <section>
        <SkeletonLine line="h-7" className="h-5 w-40" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className={`${CARD} flex flex-col gap-3`}>
            <ModeHeading />
            <div className="mt-auto flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="@container flex min-w-0 flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-line bg-background p-3.5 max-[360px]:flex-row"
                  >
                    {/* The real pair of mini cards zooms to 70% when narrow. */}
                    <Skeleton className="h-[104px] w-full max-w-40 @max-[160px]:h-[73px] max-[360px]:h-[73px] max-[360px]:w-28" />
                    <div className="flex w-full min-w-0 flex-col items-center max-[360px]:items-start">
                      <SkeletonLine className="h-4 w-24 max-w-full" />
                      <SkeletonLine line="h-5" className="h-3 w-28 max-w-full" />
                      <span className="hidden w-full @max-[160px]:block">
                        <SkeletonLine line="h-5 justify-center" className="h-3 w-16" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="min-h-6" />
            </div>
          </div>
          <ModeCardSkeleton />
          <ModeCardSkeleton />
          <ModeCardSkeleton />
        </div>
      </section>

      <div className={`${CARD} flex flex-col gap-4`}>
        <div className="grid grid-cols-3 gap-x-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SkeletonLine line="h-7" className="h-5 w-8" />
              <SkeletonLine className="h-4 w-16" />
              <SkeletonLine line="h-6 sm:hidden" className="h-4 w-10" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t-[1.5px] border-line pt-4">
          <SkeletonLine className="h-4 w-48 max-w-full" />
          <Skeleton variant="rounded-full" className="h-9 w-20" />
        </div>
      </div>
    </SkeletonPage>
  );
}
