import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppUser } from "@/components/app/AppShell";

import { isTransientAuthError } from "./auth-errors";
import type { Profile } from "./profile";
import { createClient } from "./server";

type AccountProfile = Pick<Profile, "username" | "display_name" | "hsk_level_target" | "hsk_standard">;

/**
 * The signed-in user and their profile row, read once per request (the
 * layout and its page share it). Three outcomes, kept apart so a failed
 * read never looks like a missing account:
 *
 *   signed-out  no session (or an expired or revoked one)
 *   error       Auth or the profile couldn't be read; logged here
 *   ok          the user, and their profile row or null when there's none
 */
export const loadAccount = cache(
  async (): Promise<
    { status: "signed-out" } | { status: "error" } | { status: "ok"; user: User; profile: AccountProfile | null }
  > => {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError && isTransientAuthError(authError)) {
      console.error("loadAccount: couldn't reach Supabase Auth.", authError);
      return { status: "error" };
    }
    if (!user) return { status: "signed-out" };

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, display_name, hsk_level_target, hsk_standard")
      .eq("id", user.id)
      .maybeSingle<AccountProfile>();
    if (error) {
      console.error(`loadAccount: couldn't load the profile of ${user.id}.`, error);
      return { status: "error" };
    }
    return { status: "ok", user, profile };
  },
);

/**
 * The signed-in, onboarded user for an app layout or page, or null when
 * the account couldn't be loaded (the layout then shows the error and a
 * retry; never a redirect). proxy.ts already guards these routes; repeated
 * so each layout is safe on its own: redirects to /login when signed out
 * and to /onboarding when there's no username yet.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const account = await loadAccount();
  if (account.status === "error") return null;
  if (account.status === "signed-out") redirect("/login");
  const { user, profile } = account;
  if (!profile?.username) redirect("/onboarding");

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    username: profile.username,
    hskLevel: profile.hsk_level_target,
    hskStandard: profile.hsk_standard,
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
