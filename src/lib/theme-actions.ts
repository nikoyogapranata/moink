"use server";

import { createClient, signedInUserId } from "@/lib/supabase/server";

import { isThemePref } from "./theme";

/** Saves the Appearance choice to the profile, so it follows the user to
 *  their other devices. Signed out: nothing to save (localStorage only). No
 *  refresh(): the page already shows the change. */
export async function saveThemePref(pref: string): Promise<{ ok: boolean }> {
  if (!isThemePref(pref)) return { ok: false };
  const supabase = await createClient();
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };

  const { data, error } = await supabase.from("profiles").update({ theme: pref }).eq("id", userId).select("id");
  if (error || !data?.length) {
    console.error("saveThemePref failed", error);
    return { ok: false };
  }
  return { ok: true };
}
