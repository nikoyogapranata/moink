// The top progress bar's state, outside React, so instrumentation-client.ts
// can start it in the same tick as the navigation. The bar runs while a
// navigation is pending or a route skeleton is on screen: Next commits the
// new pathname as soon as loading.tsx can show, well before the page itself.

export type NavPhase = "idle" | "running" | "done";

/** How long the finish (to 100%, then fading) stays up. Matches the
 *  nav-progress-done animation in globals.css. */
const DONE_MS = 350;
/** A navigation can end with no route change (a redirect back to the same
 *  page), so a pending one gives up after this. */
const STUCK_MS = 15_000;

let phase: NavPhase = "idle";
let navigating = false;
let holds = 0;
let route: string | null = null;
let doneTimer: ReturnType<typeof setTimeout> | undefined;
let stuckTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setPhase(next: NavPhase) {
  if (next === phase) return;
  phase = next;
  for (const listener of listeners) listener();
}

function begin() {
  clearTimeout(doneTimer);
  setPhase("running");
}

/** Finishes the bar once nothing is keeping it up. */
function settle() {
  if (navigating || holds > 0 || phase !== "running") return;
  setPhase("done");
  doneTimer = setTimeout(() => setPhase("idle"), DONE_MS);
}

function endNavigation() {
  navigating = false;
  clearTimeout(stuckTimer);
  // Later, so a skeleton in the same commit has taken its hold first, and
  // Strict Mode's release and re-hold don't flash the finish.
  queueMicrotask(settle);
}

/** Search params in URLSearchParams' own encoding, so a URL and
 *  useSearchParams() compare equal. */
const routeKey = (pathname: string, search: string) =>
  `${pathname}?${new URLSearchParams(search).toString()}`;

/** A router navigation to `url` began. Links with a target or a modifier key
 *  never get here; Next leaves those clicks to the browser. */
export function startNavigation(url: string) {
  const to = new URL(url, window.location.href);
  if (to.origin !== window.location.origin) return;
  // Against the last committed route, not the address bar: on back and
  // forward the address has already changed. Same route covers hash links
  // too. Going back to it mid-navigation drops the one that was pending.
  const current = route ?? routeKey(window.location.pathname, window.location.search);
  if (routeKey(to.pathname, to.search) === current) {
    if (navigating) endNavigation();
    return;
  }
  navigating = true;
  clearTimeout(stuckTimer);
  stuckTimer = setTimeout(endNavigation, STUCK_MS);
  begin();
}

/** The rendered route is now this pathname and search. */
export function routeCommitted(pathname: string, search: string) {
  const key = routeKey(pathname, search);
  if (key === route) return;
  route = key;
  endNavigation();
}

/** Keeps the bar running while a route skeleton is mounted. Returns the
 *  release. */
export function holdProgress() {
  holds += 1;
  begin();
  return () => {
    holds -= 1;
    queueMicrotask(settle);
  };
}

export function subscribeNavPhase(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getNavPhase = () => phase;
