// Service-role Supabase client for one-off scripts. Bypasses RLS, so it
// must never be imported by app code (src/).
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import type { Database } from "../../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Every request the scripts send goes through retryingFetch: a network
// error, a timeout or a 408, 429 or 5xx response is retried up to 3 times,
// after 0.5s, 1s and 2s. Other responses (400, 404, 409 ...) come back at
// once, as they would again. A request whose write did land before its
// response was lost fails its retry with a conflict (409) where a unique
// key covers it, and is reported like any other failure. When the script
// ends, a summary lists the requests that still failed.

const RETRY_DELAYS_MS = [500, 1000, 2000];
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const stillFailed: string[] = [];
let recovered = 0;

process.on("exit", () => {
  if (!stillFailed.length && !recovered) return;
  if (recovered) console.log(`\nSupabase: ${recovered} request${recovered === 1 ? "" : "s"} succeeded after a retry.`);
  if (stillFailed.length) {
    console.log(`Supabase: ${stillFailed.length} request${stillFailed.length === 1 ? "" : "s"} still failed after ${RETRY_DELAYS_MS.length} retries:`);
    for (const line of stillFailed) console.log(`  ${line}`);
  }
});

/** fetch with retries, for the Supabase clients of the scripts. */
export const retryingFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const label = `${request.method} ${new URL(request.url).pathname}`;
  for (let attempt = 0; ; attempt++) {
    let outcome: Response | Error;
    try {
      // A Request's body can be read once: each attempt sends a clone.
      outcome = await fetch(request.clone());
    } catch (error) {
      outcome = error instanceof Error ? error : new Error(String(error));
    }
    const retryable = outcome instanceof Error || RETRY_STATUS.has(outcome.status);
    if (!retryable) {
      if (attempt > 0) recovered++;
      return outcome as Response;
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      stillFailed.push(`${label}: ${outcome instanceof Error ? outcome.message : `HTTP ${outcome.status}`}`);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
};

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role key) in .env.local",
    );
    process.exit(1);
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: retryingFetch },
  });
}

export const hasFlag = (flag: string) => process.argv.slice(2).includes(flag);

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
