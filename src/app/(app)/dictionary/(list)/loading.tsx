import { SkeletonRows } from "@/components/dictionary/SkeletonRows";
import { WordOfTheDaySkeleton } from "@/components/dictionary/WordOfTheDaySkeleton";
import { Skeleton, SkeletonLine, SkeletonPage, SkeletonPageTitle } from "@/components/ui/Skeleton";
import { LEVEL_FILTERS } from "@/lib/dictionary/words";

// The real pills' widths, so they wrap at the same point (five fit a row on a
// laptop, and "5+" drops to the next).
const PILL_WIDTHS = ["w-[45px]", "w-16", "w-[66px]", "w-[67px]", "w-[67px]", "w-[46px]"];

export default function DictionaryLoading() {
  return (
    <SkeletonPage className="grid grid-cols-1 gap-4 lg:grid-cols-[42fr_58fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <SkeletonPageTitle className="w-40" />

        <div className="lg:hidden">
          <WordOfTheDaySkeleton />
        </div>

        <Skeleton variant="rounded-full" className="h-12 w-full" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            {LEVEL_FILTERS.map(({ value }, i) => (
              <Skeleton key={value} variant="rounded-full" className={`h-9 ${PILL_WIDTHS[i]}`} />
            ))}
          </div>
          <Skeleton variant="rounded-full" className="ml-auto h-9 w-[173px] shrink-0" />
        </div>

        <div>
          <SkeletonLine line="mb-2 mx-1 h-6" className="h-4 w-32" />
          <SkeletonRows />
        </div>
      </div>

      <div className="hidden min-w-0 lg:block">
        <WordOfTheDaySkeleton />
      </div>
    </SkeletonPage>
  );
}
