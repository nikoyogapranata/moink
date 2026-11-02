"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";

import {
  getNavPhase,
  holdProgress,
  routeCommitted,
  subscribeNavPhase,
  type NavPhase,
} from "@/lib/nav-progress";

const idleOnServer = (): NavPhase => "idle";

function RouteWatcher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    routeCommitted(pathname, search);
  }, [pathname, search]);
  return null;
}

/** The bar across the top of the viewport, for the root layout. The animation
 *  is in globals.css (.nav-progress). */
export function NavProgress() {
  const phase = useSyncExternalStore(subscribeNavPhase, getNavPhase, idleOnServer);
  return (
    <>
      {/* useSearchParams needs a boundary, or it would opt every static page
          out of prerendering. */}
      <Suspense fallback={null}>
        <RouteWatcher />
      </Suspense>
      <div
        aria-hidden="true"
        data-phase={phase}
        className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-60 h-[3px] bg-rust"
      />
    </>
  );
}

/** Rendered by a route skeleton: the bar stays up until the page replaces it. */
export function HoldNavProgress() {
  useEffect(() => holdProgress(), []);
  return null;
}
