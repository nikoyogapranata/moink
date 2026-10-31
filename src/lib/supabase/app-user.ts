import type { UserMetadata } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppUser } from "@/components/app/AppShell";

import { isTransientAuthError } from "./auth-errors";
import type { Profile } from "./profile";
import { createClient } from "./server";

// The profile fields any app page may need, read once with the account so
// a page (the Dashboard's limits and day boundaries) needs no second read.
export type AccountProfile = Pick<
  Profile,
  | "username"
  | "display_name"
  | "hsk_level_target"
  | "hsk_standard"
  | "daily_new_words"
  | "daily_new_writing"
  | "timezone"
  | "timezone_confirmed"
>;

/** The signed-in user as the session's JWT describes them. */
export interface AccountUser {
  id: string;
  metadata: UserMetadata;
}

/**
 * The signed-in user and their profile row, read once per request (the
 * layout and its page share it). The user comes from the session's JWT,
 * verified locally (getClaims; the project signs with asymmetric keys),
 * so this costs one database read and no round trip to Supabase Auth.
 * Three outcomes, kept apart so a failed read never looks like a missing
 * account:
 *
 *   signed-out  no session (or an expired or revoked one)
 *   error       Auth or the profile couldn't be read; logged here
 *   ok          the user, and their profile row or null when there's none
 */
export const loadAccount = cache(
  async (): Promise<
    | { status: "signed-out" }
    | { status: "error" }
    | { status: "ok"; user: AccountUser; profile: AccountProfile | null }
  > => {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getClaims();
    if (authError && isTransientAuthError(authError)) {
      console.error("loadAccount: couldn't reach Supabase Auth.", authError);
      return { status: "error" };
    }
    const claims = data?.claims;
    if (!claims?.sub) return { status: "signed-out" };
    const user: AccountUser = { id: claims.sub, metadata: claims.user_metadata ?? {} };

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "username, display_name, hsk_level_target, hsk_standard, daily_new_words, daily_new_writing, timezone, timezone_confirmed",
      )
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

  const meta = user.metadata;
  return {
    id: user.id,
    username: profile.username,
    hskLevel: profile.hsk_level_target,
    hskStandard: profile.hsk_standard,
    timeZone: profile.timezone,
    timeZoneConfirmed: profile.timezone_confirmed,
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
