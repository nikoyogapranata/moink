// Day boundaries in a user's own time zone (profiles.timezone), as instants.

export const FALLBACK_TIME_ZONE = "Asia/Jakarta";

/** How far ahead of UTC the zone's wall clock is at `instant`, in ms. */
function zoneOffset(timeZone: string, instant: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** Midnight at the start of the given calendar day in the zone. Day
 *  overflow is fine (day 32 is the 1st of next month). */
function zonedMidnight(timeZone: string, year: number, month: number, day: number) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - zoneOffset(timeZone, guess);
  // Once more at the result, in case a DST change falls in between.
  return new Date(guess - zoneOffset(timeZone, first));
}

/**
 * The start of today, tomorrow and the day after, in `timeZone`. An unknown
 * zone name falls back to FALLBACK_TIME_ZONE rather than throwing.
 */
export function dayStarts(timeZone: string, now = new Date()) {
  let zone = timeZone;
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    zone = FALLBACK_TIME_ZONE;
    ymd = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
  const [year, month, day] = ymd.split("-").map(Number);
  return {
    today: zonedMidnight(zone, year, month, day),
    tomorrow: zonedMidnight(zone, year, month, day + 1),
    dayAfter: zonedMidnight(zone, year, month, day + 2),
  };
}
