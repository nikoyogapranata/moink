import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { FALLBACK_TIME_ZONE } from "@/lib/time";

import type { WordDetail } from "./words";

/** Today's date (YYYY-MM-DD) and a display label, in `timeZone`. */
export function todayIn(timeZone: string) {
  const now = new Date();
  try {
    return {
      date: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
      label: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(now),
    };
  } catch {
    // An unknown zone name throws; fall back rather than fail the page.
    return todayIn(FALLBACK_TIME_ZONE);
  }
}

/** The word of the day for `date` (word_of_the_day), or null when there's
 *  none. Throws when it can't be loaded. Used by the Dictionary and the
 *  Dashboard. */
export async function loadWordOfTheDay(
  supabase: SupabaseClient<Database>,
  date: string,
): Promise<WordDetail | null> {
  const { data, error } = await supabase.rpc("word_of_the_day", { p_date: date });
  if (error) throw error;
  const w = data?.[0];
  return w
    ? {
        id: w.id,
        simplified: w.simplified,
        traditional: w.traditional,
        pinyin: w.pinyin,
        gloss: w.gloss,
        meanings: w.meanings,
        classifiers: w.classifiers,
        hsk_level: w.hsk_level,
        hsk3_level: w.hsk3_level,
        hsk3_2025_level: w.hsk3_2025_level,
        radical: w.radical,
      }
    : null;
}
