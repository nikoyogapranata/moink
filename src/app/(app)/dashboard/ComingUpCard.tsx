import { CARD } from "@/components/app/card";
import { numberFormat } from "@/lib/dictionary/words";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** "YYYY-MM-DD" as a UTC date, so formatting it gives that same day. */
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const reviews = (n: number) => `${numberFormat.format(n)} ${n === 1 ? "review" : "reviews"}`;

/**
 * Recognition and writing reviews due on each of the next 7 days, today
 * first: one bar per day, its count shown on hover and keyboard focus
 * (and always to screen readers).
 */
export function ComingUpCard({ days }: { days: { day: string; due: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.due));
  const total = days.reduce((sum, d) => sum + d.due, 0);

  return (
    <section aria-labelledby="coming-up-title" className={`${CARD} flex flex-col gap-1`}>
      <h2 id="coming-up-title" className="font-heading text-h2 font-bold text-bark">
        Coming up
      </h2>
      <p className="font-body text-body text-bark-muted">
        {total === 0 ? "Nothing due in the next 7 days" : `${reviews(total)} in the next 7 days`}
      </p>
      {/* Room above the bars for the tallest one's count. */}
      <ol aria-label="Reviews due each day" className="mt-8 grid h-36 grid-cols-7 items-end gap-2">
        {days.map((d, i) => {
          const label = i === 0 ? "Today" : weekday.format(asDate(d.day));
          const spoken = `${i === 0 ? "Today" : weekdayLong.format(asDate(d.day))}: ${reviews(d.due)}`;
          return (
            <li key={d.day} className="flex h-full min-w-0 flex-col items-center gap-1.5">
              <div
                tabIndex={0}
                role="img"
                aria-label={spoken}
                className="group relative flex w-full max-w-10 flex-1 items-end rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-bark px-2 py-0.5 font-body text-body-sm font-medium tabular-nums text-background group-hover:block group-focus-visible:block"
                >
                  {numberFormat.format(d.due)}
                </span>
                <span
                  aria-hidden="true"
                  className={`w-full rounded-t-md ${d.due > 0 ? (i === 0 ? "bg-rust" : "bg-rust/70") : "bg-line"}`}
                  style={{ height: d.due > 0 ? `max(${(d.due / max) * 100}%, 6px)` : "3px" }}
                />
              </div>
              <span
                aria-hidden="true"
                className={`font-body text-body-sm ${i === 0 ? "font-medium text-bark" : "text-bark-muted"}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
