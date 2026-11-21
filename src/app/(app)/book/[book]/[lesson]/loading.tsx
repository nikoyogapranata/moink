import { Skeleton, SkeletonLine, SkeletonPage } from "@/components/ui/Skeleton";

const BOOK_CARD = "rounded-[22px] border-[1.5px] border-line bg-surface-raised p-4 sm:p-5";

function Lines({ widths }: { widths: string[] }) {
  return (
    <div>
      {widths.map((w, i) => (
        <SkeletonLine key={i} line="h-10" className={`h-4 ${w}`} />
      ))}
    </div>
  );
}

export default function BookLessonLoading() {
  return (
    <SkeletonPage>
      <div className="mx-auto flex max-w-[760px] flex-col gap-1">
        <Skeleton variant="rounded-full" className="mb-3 h-11 w-36" />
        <div className="flex items-center gap-2">
          <Skeleton variant="rounded-full" className="h-6 w-20" />
          <SkeletonLine line="h-5" className="h-3.5 w-16" />
        </div>
        <SkeletonLine line="h-[59px] lg:h-[67px]" className="h-8 w-64 max-w-full" />
        <SkeletonLine className="h-4 w-56 max-w-full" />
      </div>

      {/* The sticky bar: chips and the three switches. */}
      <div className="-mx-4 mt-4 border-b-[1.5px] border-line px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[760px] items-center gap-2 py-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded-full" className="h-8 w-16 shrink-0" />
            ))}
          </div>
          <Skeleton variant="rounded-full" className="h-9 w-[150px] shrink-0 sm:w-[170px]" />
        </div>
      </div>

      <div className="mx-auto flex max-w-[760px] flex-col gap-6 pt-12">
        <div className="flex items-end gap-3 border-b-[1.5px] border-line pb-2">
          <SkeletonLine line="h-9" className="h-6 w-24" />
          <Skeleton variant="rounded-full" className="ml-auto h-6 w-12" />
        </div>
        <div className="rounded-[22px] bg-highlight/60 p-4 sm:p-5">
          <Lines widths={["w-full", "w-11/12", "w-3/4"]} />
        </div>
        <Lines widths={["w-2/3"]} />
        <div className={BOOK_CARD}>
          <Skeleton className="mb-4 aspect-[2/1] max-h-[220px] w-full !rounded-lg" />
          <Lines widths={["w-full", "w-5/6", "w-11/12", "w-2/3"]} />
        </div>
      </div>
    </SkeletonPage>
  );
}
