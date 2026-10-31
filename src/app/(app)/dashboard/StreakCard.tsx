import { Check, Flame } from "lucide-react";

import { CARD } from "@/components/app/card";
import { STREAK_REVIEWS, weekStrip, type Streak, type WeekDay } from "@/lib/training/streak";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dayStatus(d: WeekDay) {
  if (d.completed) return "completed";
  if (d.rest) return d.practiced ? "rest day, practiced" : "rest day, nothing due";
  if (d.isToday) return d.practiced ? "practiced, review not finished yet" : "not finished yet";
  if (d.practiced) return "practiced only";
  return d.future ? "coming up" : "no review";
}

/** One day of the strip: a filled rust circle with a check when
 *  completed, a lighter dot when practiced, a small gray dash on a rest
 *  day (nothing to do; it doesn't count), a dashed rust ring on today
 *  until it's completed (unless it's a rest day), empty otherwise. */
function DayMark({ d }: { d: WeekDay }) {
  const ring = d.completed
    ? "bg-rust border-rust"
    : d.isToday && !d.rest
      ? "border-dashed border-rust"
      : d.future
        ? "border-line/60"
        : "border-line";
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${ring}`}
    >
      {d.completed ? (
        <Check size={16} strokeWidth={3} className="text-on-rust" />
      ) : d.practiced ? (
        <span className="h-2.5 w-2.5 rounded-full bg-rust/45" />
      ) : (
        d.rest && <span className="h-0.5 w-3 rounded-full bg-bark-muted/70" />
      )}
    </span>
  );
}

/** The current and best streak, and this week from Monday to Sunday. */
export function StreakCard({ streak }: { streak: Streak }) {
  const week = weekStrip(streak);
  return (
    <section aria-labelledby="streak-title" className={`${CARD} flex flex-col gap-4`}>
      <h2 id="streak-title" className="font-heading text-h2 font-bold text-bark">
        Streak
      </h2>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2">
          <Flame size={32} aria-hidden="true" className="shrink-0 text-bamboo-gold-dark" />
          <span className="font-heading text-[40px] font-bold leading-[44px] tabular-nums text-bark">
            {streak.current}
          </span>
          <span className="font-body text-body text-bark-muted">
            {streak.current === 1 ? "day" : "days"}
            <span className="sr-only"> in your current streak</span>
          </span>
        </p>
        <p className="font-body text-body text-bark-muted">
          Best:{" "}
          <span className="font-bold tabular-nums text-bark">
            {streak.best} {streak.best === 1 ? "day" : "days"}
          </span>
        </p>
      </div>
      <ol aria-label="This week" className="grid grid-cols-7 gap-1">
        {week.map((d, i) => (
          <li key={d.day} className="flex flex-col items-center gap-1.5">
            <DayMark d={d} />
            <span
              aria-hidden="true"
              className={`font-body text-body-sm ${d.isToday ? "font-medium text-bark" : "text-bark-muted"}`}
            >
              {WEEKDAYS[i][0]}
            </span>
            <span className="sr-only">
              {WEEKDAYS[i]}
              {d.isToday ? " (today)" : ""}: {dayStatus(d)}
            </span>
          </li>
        ))}
      </ol>
      <p className="font-body text-body-sm text-bark-muted">
        Finish today&apos;s review (or {STREAK_REVIEWS} reviews) to keep your streak. Days with nothing due
        don&apos;t count against it.
      </p>
    </section>
  );
}
