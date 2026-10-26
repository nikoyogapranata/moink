/** console.error in development only, for failures the UI would otherwise
 *  swallow (a fallback, an empty state, or nothing at all). */
export function devError(message: string, ...details: unknown[]) {
  if (process.env.NODE_ENV !== "production") console.error(`[moink] ${message}`, ...details);
}

const logged = new Set<string>();

/** devError, once per `key`: for paths that run on every render. */
export function devErrorOnce(key: string, message: string, ...details: unknown[]) {
  if (logged.has(key)) return;
  logged.add(key);
  devError(message, ...details);
}
