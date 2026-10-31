import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "./database.types";

// Row shape of public.profiles.
export type Profile = Tables<"profiles">;

export type HomePath = "/dashboard" | "/onboarding";

/** Where a signed-in user belongs: onboarding until they pick a username,
 *  the dashboard after. A missing profile row counts as not onboarded.
 *  Null when the profile couldn't be read (logged here): a failed read
 *  must never send an onboarded user to onboarding. */
export async function getHomePath(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HomePath | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "username">>();
  if (error) {
    console.error(`getHomePath: couldn't load the profile of ${userId}.`, error);
    return null;
  }

  return data?.username ? "/dashboard" : "/onboarding";
}
