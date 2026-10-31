// Day boundaries in a user's own time zone (profiles.timezone), as instants.

// The default of profiles.timezone, and the zone when one is unknown.
export const FALLBACK_TIME_ZONE = "Asia/Jakarta";

/** True for an IANA zone name this runtime knows ("Asia/Tokyo", "UTC").
 *  Rejects "Etc/Unknown", which some browsers report when they can't
 *  tell. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(value) || value === "Etc/Unknown") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The browser's zone, or null when it reports none we can use. Client
 *  only. */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Every IANA zone the runtime lists, plus `include` when it's a valid
 *  zone that isn't listed (an alias like "Asia/Calcutta", or "UTC"). */
export function timeZoneNames(include?: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  if (include && isTimeZone(include) && !zones.includes(include)) zones = [...zones, include].sort();
  return zones;
}

/** The zone's offset from UTC now, as "UTC+7" or "UTC-3:30". */
export function utcOffsetLabel(timeZone: string, at = new Date()) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    // "GMT+07:00" -> "UTC+7"; plain "GMT" is UTC itself.
    const m = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if (!m) return "UTC";
    const hours = String(Number(m[2]));
    return `UTC${m[1]}${hours}${m[3] === "00" ? "" : `:${m[3]}`}`;
  } catch {
    return "";
  }
}

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
