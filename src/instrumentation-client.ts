import { startNavigation } from "@/lib/nav-progress";

// Fires for links, router.push and replace, and back and forward, in the same
// tick, which catching clicks alone wouldn't cover.
export function onRouterTransitionStart(url: string) {
  startNavigation(url);
}
