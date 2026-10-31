"use server";

import { refresh } from "next/cache";

import { createClient, signedInUserId } from "@/lib/supabase/server";

import { FALLBACK_TIME_ZONE, isTimeZone } from "./time";

/**
 * The one-time check for profiles from before the time zone was saved at
 * onboarding: while it's unconfirmed and still the default, the browser's
 * zone replaces it and it's confirmed, so this runs once per account. The
 * update's own filters make it a no-op otherwise (a zone picked in
 * Settings is never replaced). Refreshes the page when the zone changed,
 * so "today" follows at once.
 */
export async function adoptBrowserTimeZone(timeZone: string): Promise<{ ok: boolean; changed: boolean }> {
  if (!isTimeZone(timeZone)) return { ok: false, changed: false };

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false, changed: false };

  // .select() to tell an update from one the filters skipped (already
  // confirmed, say by another tab).
  const { data, error } = await supabase
    .from("profiles")
    .update({ timezone: timeZone, timezone_confirmed: true })
    .eq("id", userId)
    .eq("timezone_confirmed", false)
    .eq("timezone", FALLBACK_TIME_ZONE)
    .select("id");
  if (error) {
    console.error("adoptBrowserTimeZone failed", error);
    return { ok: false, changed: false };
  }
  const changed = (data?.length ?? 0) > 0 && timeZone !== FALLBACK_TIME_ZONE;
  if (changed) refresh();
  return { ok: true, changed };
}
