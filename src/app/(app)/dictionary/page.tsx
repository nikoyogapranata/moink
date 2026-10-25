import type { Metadata } from "next";
import { Suspense } from "react";

import { levelForTarget, type WordDetail } from "@/lib/dictionary/words";
import { createClient } from "@/lib/supabase/server";

import { DictionaryView } from "./DictionaryView";

export const metadata: Metadata = {
  title: "Dictionary - moink",
};

const FALLBACK_TIME_ZONE = "Asia/Jakarta";

/** Today's date (YYYY-MM-DD) and a display label, in the user's zone. */
function today(timeZone: string) {
  const now = new Date();
  try {
    return {
      date: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
      label: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(now),
    };
  } catch {
    // An unknown zone name throws; fall back rather than fail the page.
    return today(FALLBACK_TIME_ZONE);
  }
}

export default async function DictionaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("hsk_level_target, timezone")
    .eq("id", user!.id)
    .maybeSingle();

  const { date, label } = today(profile?.timezone || FALLBACK_TIME_ZONE);
  const { data: wotdRows } = await supabase.rpc("word_of_the_day", { p_date: date });
  const w = wotdRows?.[0];
  const wordOfTheDay: WordDetail | null = w
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
        radical: w.radical,
      }
    : null;

  return (
    <Suspense>
      <DictionaryView
        defaultLevel={levelForTarget(profile?.hsk_level_target ?? null)}
        wordOfTheDay={wordOfTheDay}
        dateLabel={label}
      />
    </Suspense>
  );
}
