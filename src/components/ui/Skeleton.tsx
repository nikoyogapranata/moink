import type { ReactNode } from "react";

import { HoldNavProgress } from "@/components/app/NavProgress";

type SkeletonVariant = "default" | "rounded-full";

interface SkeletonProps {
  /** Sizing, and anything else about the block. */
  className?: string;
  /** rounded-full for pills and avatars. */
  variant?: SkeletonVariant;
}

const variantClasses: Record<SkeletonVariant, string> = {
  default: "rounded-sm",
  "rounded-full": "rounded-full",
};

/** A pulsing placeholder block. A span, so it's valid inside text elements. */
export function Skeleton({ className = "", variant = "default" }: SkeletonProps) {
  return <span aria-hidden="true" className={`skeleton block ${variantClasses[variant]} ${className}`} />;
}

/** A placeholder bar in a box as tall as the text's line, so swapping in the
 *  text moves nothing. `line` is that height, `className` the bar's size. */
export function SkeletonLine({ line = "h-6", className = "" }: { line?: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex items-center ${line}`}>
      <Skeleton className={className} />
    </span>
  );
}

/** A page heading's line (font-heading text-h1, larger from lg). */
export function SkeletonPageTitle({ className = "w-40" }: { className?: string }) {
  return <SkeletonLine line="h-8 lg:h-[2.375rem]" className={`h-6 lg:h-7 ${className}`} />;
}

/** The wrapper of a loading.tsx: busy for screen readers, and keeps the top
 *  progress bar running until the page arrives. */
export function SkeletonPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">Loading</span>
      <HoldNavProgress />
      {children}
    </div>
  );
}
