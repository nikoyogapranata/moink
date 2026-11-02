import { CARD } from "@/components/app/card";
import { Skeleton, SkeletonLine, SkeletonPage } from "@/components/ui/Skeleton";

export default function WordLoading() {
  return (
    <SkeletonPage className="mx-auto flex w-full max-w-160 flex-col gap-4">
      <SkeletonLine line="h-11" className="h-5 w-28" />
      <div className={`${CARD} flex flex-col gap-5`}>
        <div>
          <SkeletonLine line="h-[52px]" className="h-11 w-24" />
          <SkeletonLine className="h-4 w-20" />
        </div>

        <div className="flex gap-1 border-b-[1.5px] border-line">
          {[0, 1].map((i) => (
            <SkeletonLine key={i} line="mx-4 h-11" className="h-4 w-16" />
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <SkeletonLine line="h-8" className="h-6 w-28" />
            <Skeleton variant="rounded-full" className="h-10 w-10" />
          </div>
          <SkeletonLine line="h-7" className="h-5 w-48 max-w-full" />
          <div className="flex flex-wrap gap-2">
            <Skeleton variant="rounded-full" className="h-7 w-32" />
            <Skeleton variant="rounded-full" className="h-7 w-32" />
          </div>
          <div>
            <SkeletonLine className="h-4 w-28" />
            <SkeletonLine line="mt-1 h-6" className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton variant="rounded-full" className="h-11 w-44" />
        </div>
      </div>
    </SkeletonPage>
  );
}
