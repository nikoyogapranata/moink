import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "./database.types";

// Row shape of public.profiles.
export type Profile = Tables<"profiles">;

export type HomePath = "/dashboard" | "/onboarding";

/** Where a signed-in user belongs: onboarding until they pick a username,
 *  the dashboard after. A missing profile row counts as not onboarded. */
export async function getHomePath(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HomePath> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "username">>();

  return data?.username ? "/dashboard" : "/onboarding";
}
