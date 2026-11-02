import type { Metadata } from "next";
import { Suspense } from "react";

import { loadWordOfTheDay, todayIn } from "@/lib/dictionary/word-of-the-day";
import { levelForTarget, type WordDetail } from "@/lib/dictionary/words";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_TIME_ZONE } from "@/lib/time";

import { DictionaryView } from "./DictionaryView";

export const metadata: Metadata = {
  title: "Dictionary - moink",
};

export default async function DictionaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The list loads in the browser; these two only set the default level
  // and the word of the day. A failure is logged, and the word of the day
  // shows an error with a retry (without the profile, "today" in the
  // user's zone isn't known). The list still works.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("hsk_level_target, timezone")
    .eq("id", user!.id)
    .maybeSingle();
  if (profileError) console.error("DictionaryPage: couldn't load the profile.", profileError);

  const { date, label } = todayIn(profile?.timezone || FALLBACK_TIME_ZONE);
  let wordOfTheDay: WordDetail | null = null;
  let wotdFailed = Boolean(profileError);
  if (!profileError) {
    try {
      wordOfTheDay = await loadWordOfTheDay(supabase, date);
    } catch (error) {
      console.error("DictionaryPage: couldn't load the word of the day.", error);
      wotdFailed = true;
    }
  }

  return (
    <Suspense>
      <DictionaryView
        defaultLevel={levelForTarget(profile?.hsk_level_target ?? null)}
        wordOfTheDay={wordOfTheDay}
        wordOfTheDayFailed={wotdFailed}
        dateLabel={label}
      />
    </Suspense>
  );
}
