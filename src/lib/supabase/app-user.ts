import { redirect } from "next/navigation";

import type { AppUser } from "@/components/app/AppShell";

import type { Profile } from "./profile";
import { createClient } from "./server";

/**
 * The signed-in, onboarded user for an app layout. proxy.ts already
 * guards these routes; repeated so each layout is safe on its own.
 * Redirects to /login or /onboarding otherwise.
 */
export async function getAppUser(): Promise<AppUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, hsk_level_target")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "username" | "hsk_level_target">>();

  if (!profile?.username) redirect("/onboarding");

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    username: profile.username,
    hskLevel: profile.hsk_level_target,
    avatarUrl:
      typeof meta.avatar_url === "string"
        ? meta.avatar_url
        : typeof meta.picture === "string"
          ? meta.picture
          : null,
    fullName:
      typeof meta.full_name === "string"
        ? meta.full_name
        : typeof meta.name === "string"
          ? meta.name
          : null,
  };
}
