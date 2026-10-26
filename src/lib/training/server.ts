import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { dayStarts, FALLBACK_TIME_ZONE } from "@/lib/time";

import { DUE_SOON_MS, type DeckSet } from "./deck";
import { toQueueItems, type QueueItem, type QueueWord } from "./queue";

type Client = SupabaseClient<Database>;

/** The user's daily new-word limit, target HSK level and day boundaries
 *  in their zone. */
export async function loadTrainingProfile(supabase: Client, userId: string, now = new Date()) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("daily_new_words, hsk_level_target, timezone")
    .eq("id", userId)
    .maybeSingle();
  return {
    dailyNewWords: profile?.daily_new_words ?? 0,
    hskLevel: profile?.hsk_level_target ?? null,
    days: dayStarts(profile?.timezone || FALLBACK_TIME_ZONE, now),
  };
}

/** The session queue from get_review_queue, as of `now`. */
export async function loadQueue(supabase: Client, todayStart: Date, now: Date): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc("get_review_queue", {
    p_now: now.toISOString(),
    p_today_start: todayStart.toISOString(),
  });
  if (error) throw error;
  return toQueueItems(data ?? []);
}

const WORD_FIELDS = "id, simplified, pinyin, gloss, hsk_level, classifiers";
const PAGE_SIZE = 1000;

/** Every row of a query, a page at a time (PostgREST caps a response at
 *  1,000 rows and HSK 6 alone has about 2,500 words). */
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Every word with a recognition card for the user, any state. */
export async function loadTrainingWordIds(supabase: Client, userId: string): Promise<number[]> {
  const rows = await allRows((from, to) =>
    supabase
      .from("user_words")
      .select("word_id")
      .eq("user_id", userId)
      .eq("skill", "recognition")
      .order("word_id")
      .range(from, to),
  );
  return rows.map((row) => row.word_id);
}

const IDS_PER_REQUEST = 200;

/** Words by id, in no particular order; unknown ids are skipped. Batched
 *  so the id list never makes a URL too long. */
export async function loadWordsByIds(supabase: Client, ids: number[]): Promise<QueueWord[]> {
  const words: QueueWord[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const { data, error } = await supabase
      .from("words")
      .select(WORD_FIELDS)
      .in("id", ids.slice(i, i + IDS_PER_REQUEST));
    if (error) throw error;
    words.push(...(data ?? []));
  }
  return words;
}

/** The words in a deck builder set, unsorted. "mine" is every
 *  recognition card past New, "due" those (not suspended) due within
 *  DUE_SOON_MS, and "hskN" every word at that old-HSK level. */
export async function loadDeck(supabase: Client, userId: string, set: DeckSet, now: Date): Promise<QueueWord[]> {
  if (set === "mine" || set === "due") {
    const rows = await allRows((from, to) => {
      let query = supabase
        .from("user_words")
        .select(`word_id, words(${WORD_FIELDS})`)
        .eq("user_id", userId)
        .eq("skill", "recognition")
        .neq("state", 0);
      if (set === "due") {
        query = query.eq("suspended", false).lte("due", new Date(now.getTime() + DUE_SOON_MS).toISOString());
      }
      return query.order("word_id").range(from, to);
    });
    return rows.flatMap((row) => (row.words ? [row.words] : []));
  }

  const level = Number(set.slice(3));
  return allRows((from, to) =>
    supabase.from("words").select(WORD_FIELDS).eq("hsk_level", level).order("id").range(from, to),
  );
}
