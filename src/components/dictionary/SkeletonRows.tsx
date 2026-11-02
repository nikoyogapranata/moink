import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";

/** Dictionary list rows, each as tall as a real one. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-8 w-12 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-4 w-40 max-w-full" />
          </span>
        </li>
      ))}
    </ul>
  );
}
