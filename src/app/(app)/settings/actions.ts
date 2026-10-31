"use server";

import { refresh } from "next/cache";

import { isHskStandard, isLevelOf } from "@/lib/hsk";
import { createClient, signedInUserId } from "@/lib/supabase/server";
import { isTimeZone } from "@/lib/time";

/** Saves the HSK standard and the target level in it together (the
 *  profile check ties the level's range to the standard), and the time
 *  zone, which counts as confirmed from then on (the app's one-time
 *  browser check leaves it alone). Learned words and reviews aren't
 *  touched. */
export async function saveStudySettings(standard: string, level: number, timeZone: string): Promise<{ ok: boolean }> {
  if (!isHskStandard(standard) || !isLevelOf(standard, level) || !isTimeZone(timeZone)) return { ok: false };

  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  // .select() so an update that RLS filtered down to zero rows reads as a
  // failure instead of a silent success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ hsk_standard: standard, hsk_level_target: level, timezone: timeZone, timezone_confirmed: true })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("saveStudySettings failed", error);
    return { ok: false };
  }

  refresh();
  return { ok: true };
}
