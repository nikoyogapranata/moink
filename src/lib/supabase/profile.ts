import type { SupabaseClient } from "@supabase/supabase-js";

// Row shape of public.profiles. Keep in sync with the table.
export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  hsk_level_target: number | null;
  xp: number;
  coins: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  created_at: string;
  updated_at: string;
}

export type HomePath = "/dashboard" | "/onboarding";

/** Where a signed-in user belongs: onboarding until they pick a username,
 *  the dashboard after. A missing profile row counts as not onboarded. */
export async function getHomePath(
  supabase: SupabaseClient,
  userId: string,
): Promise<HomePath> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "username">>();

  return data?.username ? "/dashboard" : "/onboarding";
}
