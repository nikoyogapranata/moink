import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { BaoPose } from "@/components/training/bao";

// Streaks (20261207120000_streaks.sql, 20261214120000_rest_days_timezone.sql):
// a day in the user's zone is completed by finishing Today's review or by
// 20 reviews, practice marks it practiced without completing it, and a
// day with nothing to do is a rest day, which neither extends nor breaks
// the streak. The SQL decides all three; this is what the Dashboard shows
// of them.

/** The minimum reviews that complete a day even with more left. Matches
 *  update_daily_activity. */
export const STREAK_REVIEWS = 20;

export interface StreakDay {
  /** YYYY-MM-DD in the user's zone. */
  day: string;
  completed: boolean;
  practiced: boolean;
  /** Nothing to do that day: no card due, nothing new to learn. */
  rest: boolean;
}

export interface Streak {
  current: number;
  best: number;
  /** YYYY-MM-DD in the user's zone. */
  today: string;
  /** The latest day with a review or practice, or null if none yet. */
  lastActive: string | null;
  /** The last 7 days, oldest first, today last. */
  days: StreakDay[];
}

/** The user's streak (get_streak). Throws when it can't be loaded. */
export async function loadStreak(supabase: SupabaseClient<Database>): Promise<Streak> {
  const { data, error } = await supabase.rpc("get_streak");
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("get_streak returned no row");
  return {
    current: row.current_streak,
    best: row.best_streak,
    today: row.today,
    lastActive: row.last_active,
    days: row.days ?? [],
  };
}

/** YYYY-MM-DD `n` days from `day` (negative for earlier). */
export function addDays(day: string, n: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayIndex(day: string) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const todayDone = (streak: Streak) => streak.days.at(-1)?.completed === true;

/** Today is a rest day: nothing due and nothing new, so nothing to finish. */
export const todayRest = (streak: Streak) => !todayDone(streak) && streak.days.at(-1)?.rest === true;

/** The line under the greeting. */
export function streakStatus(streak: Streak) {
  if (todayRest(streak)) {
    return streak.current > 0 ? `${streak.current}-day streak. Nothing due today.` : "Nothing due today.";
  }
  if (streak.current === 0) return "Start a streak today.";
  return todayDone(streak)
    ? `${streak.current}-day streak. See you tomorrow!`
    : `${streak.current}-day streak. Finish today's review to keep it.`;
}

/**
 * Bao's mood on the Dashboard: happy once today is completed; none on a
 * rest day (Today's review then shows its own all-done Bao); sleepy when
 * the streak broke yesterday (yesterday was missed, and the last day
 * before it that wasn't a rest day was completed) or nothing's been done
 * for 2 days or more; eager otherwise, including a brand-new user with no
 * activity yet.
 */
export function baoMood(streak: Streak): BaoPose | undefined {
  if (todayDone(streak)) return "happy";
  if (todayRest(streak)) return undefined;
  const past = streak.days.slice(0, -1);
  const yesterday = past.at(-1);
  const missedYesterday = yesterday !== undefined && !yesterday.completed && !yesterday.rest;
  const before = past.slice(0, -1).filter((d) => !d.rest).at(-1);
  const brokeYesterday = missedYesterday && before?.completed === true;
  const idle = streak.lastActive !== null && streak.lastActive <= addDays(streak.today, -2);
  return brokeYesterday || idle ? "sleepy" : "eager";
}

export interface WeekDay extends StreakDay {
  isToday: boolean;
  future: boolean;
}

/** This week, Monday to Sunday, for the streak strip. The last 7 days
 *  always reach back to Monday; days after today are future. */
export function weekStrip(streak: Streak): WeekDay[] {
  const monday = addDays(streak.today, -weekdayIndex(streak.today));
  const byDay = new Map(streak.days.map((d) => [d.day, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const entry = byDay.get(day);
    return {
      day,
      completed: entry?.completed ?? false,
      practiced: entry?.practiced ?? false,
      rest: entry?.rest ?? false,
      isToday: day === streak.today,
      future: day > streak.today,
    };
  });
}
