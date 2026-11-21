import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";

export default function BookShelfLoading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-[760px] flex-col gap-6">
      <header>
        <SkeletonPageTitle className="w-36" />
        <SkeletonLine line="mt-1 h-6" className="h-4 w-72 max-w-full" />
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`${CARD} flex items-center gap-4 !p-3 sm:!p-4`}>
          <Skeleton className="h-24 w-[72px] shrink-0 !rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine line="h-7" className="h-5 w-32" />
            <SkeletonLine className="h-4 w-40 max-w-full" />
            <SkeletonLine line="h-5" className="h-3.5 w-28" />
            <Skeleton variant="rounded-full" className="mt-1.5 h-1.5 w-full max-w-60" />
          </div>
        </div>
      </div>
      <SkeletonLine line="h-7" className="h-5 w-32" />
      <div className={`${CARD} flex flex-col divide-y-[1.5px] divide-line !px-2 !py-1 sm:!px-3`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3 sm:px-3">
            <Skeleton variant="rounded-full" className="h-9 w-9 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <SkeletonLine line="h-[38px]" className="h-5 w-44 max-w-full" />
              <SkeletonLine line="h-5" className="h-3.5 w-56 max-w-full" />
            </div>
            <Skeleton variant="rounded-full" className="h-7 w-7 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
