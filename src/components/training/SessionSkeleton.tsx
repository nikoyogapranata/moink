"use client";

import { X } from "lucide-react";
import Link from "next/link";

import { Skeleton, SkeletonLine, SkeletonPage } from "@/components/ui/Skeleton";

import { CARD_HEIGHT, SURFACE } from "./FlashCard";
import { ICON_BUTTON, SessionFrame } from "./SessionParts";

/** A session before its cards arrive: SessionHeader and CardStage. The answer
 *  buttons are kept because the stage centers the card and buttons together.
 *  Close already works, so nobody has to wait for a session they're leaving. */
export function SessionSkeleton() {
  return (
    <SkeletonPage>
      <SessionFrame>
        <header className="flex flex-col gap-3 pb-4 pt-[calc(12px+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Link href="/training" aria-label="End session" className={`-ml-2 ${ICON_BUTTON}`}>
              <X size={24} aria-hidden="true" />
            </Link>
            <div className="h-2.5 min-w-12 flex-1 rounded-pill bg-highlight" />
            <SkeletonLine className="h-4 w-12 shrink-0" />
            <Skeleton variant="rounded-full" className="-mr-2 h-11 w-11 shrink-0" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton variant="rounded-full" className="h-11 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton variant="rounded-full" className="h-6 w-16" />
              <Skeleton variant="rounded-full" className="h-6 w-24" />
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="flex flex-1 flex-col justify-center gap-6">
            <div className="mx-auto w-full max-w-md pb-5">
              <div className={`flex flex-col p-5 ${CARD_HEIGHT} ${SURFACE}`}>
                <div className="flex justify-end">
                  <Skeleton variant="rounded-full" className="h-6 w-14" />
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <Skeleton className="h-28 w-28" />
                </div>
                <SkeletonLine line="h-5 justify-center" className="h-3.5 w-20" />
              </div>
            </div>
            <div className="mx-auto flex w-full max-w-md flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton variant="rounded-full" className="h-14" />
                <Skeleton variant="rounded-full" className="h-14" />
              </div>
              <SkeletonLine line="hidden h-5 justify-center lg:flex" className="h-3.5 w-56" />
            </div>
          </div>
        </main>
      </SessionFrame>
    </SkeletonPage>
  );
}
