import type { Metadata } from "next";

import { WordOfTheDayCard } from "@/components/dictionary/SideCards";
import { TodayCard } from "@/components/training/TodayCard";
import { loadWordOfTheDay, todayIn } from "@/lib/dictionary/word-of-the-day";
import { loadAccount } from "@/lib/supabase/app-user";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_TIME_ZONE } from "@/lib/time";
import { trainingProfile } from "@/lib/training/server";
import { loadDueForecast, loadLevelProgress, loadWordStats } from "@/lib/training/stats";
import { baoMood, loadStreak, streakStatus } from "@/lib/training/streak";
import { loadTodayReview } from "@/lib/training/today";

import { CardError } from "./CardError";
import { ComingUpCard } from "./ComingUpCard";
import { Greeting } from "./Greeting";
import { ProgressCard } from "./ProgressCard";
import { StreakCard } from "./StreakCard";

export const metadata: Metadata = {
  title: "Dashboard - moink",
};

/** `promise`'s value, or null when it fails (logged): that card then shows
 *  its error and a retry, and the others still load. */
function orNull<T>(promise: Promise<T>, what: string): Promise<T | null> {
  return promise.catch((error) => {
    console.error(`DashboardPage: couldn't load ${what}.`, error);
    return null;
  });
}

/**
 * The Dashboard, the first page after sign-in. The account (the user from
 * the session's JWT, checked locally, and their profile) is the one the
 * layout already loaded, so the page waits on no read of its own before
 * every card's data loads, all at once.
 */
export default async function DashboardPage() {
  const account = await loadAccount();
  // The layout shows the error or redirects.
  if (account.status !== "ok") return null;

  const supabase = await createClient();
  const now = new Date();
  const userId = account.user.id;
  const profile = trainingProfile(account.profile, now);
  const { date, label } = todayIn(account.profile?.timezone || FALLBACK_TIME_ZONE);

  const [review, stats, streak, levels, forecast, wordOfTheDay] = await Promise.all([
    orNull(loadTodayReview(supabase, userId, profile.days, now), "Today's review"),
    orNull(loadWordStats(supabase, userId, profile.days), "the stats"),
    orNull(loadStreak(supabase), "the streak"),
    orNull(loadLevelProgress(supabase), "the level progress"),
    orNull(loadDueForecast(supabase), "the due forecast"),
    // Wrapped, so "no word today" (null) isn't taken for a failure.
    orNull(loadWordOfTheDay(supabase, date).then((word) => ({ word })), "the word of the day"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Greeting />
        <p className="mt-1 font-body text-body text-bark-muted">
          {streak ? streakStatus(streak) : "Ready for today's words?"}
        </p>
      </header>

      <TodayCard
        review={review}
        dueTomorrow={stats?.dueTomorrow ?? null}
        dailyNewWords={account.profile ? profile.dailyNewWords : null}
        nothingStarted={stats?.started === 0}
        bao={streak ? baoMood(streak) : undefined}
      />

      {/* Each card at its own height: the streak is much shorter than the
          level list, and stretched it's mostly empty. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {streak ? (
          <StreakCard streak={streak} />
        ) : (
          <CardError id="streak-title" title="Streak" what="your streak" />
        )}
        {levels ? (
          <ProgressCard levels={levels} target={profile.hskLevel} />
        ) : (
          <CardError id="progress-title" title="Progress" what="your progress" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {forecast ? (
          <ComingUpCard days={forecast} />
        ) : (
          <CardError id="coming-up-title" title="Coming up" what="your upcoming reviews" />
        )}
        {!wordOfTheDay ? (
          <CardError id="wotd-title" title="Word of the day" what="the word of the day" />
        ) : (
          wordOfTheDay.word && (
            <WordOfTheDayCard
              word={wordOfTheDay.word}
              dateLabel={label}
              details={{ href: `/dictionary/${wordOfTheDay.word.id}` }}
              compact
            />
          )
        )}
      </div>
    </div>
  );
}
