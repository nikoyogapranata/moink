// Service-role Supabase client for one-off scripts. Bypasses RLS, so it
// must never be imported by app code (src/).
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import type { Database } from "../../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

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
