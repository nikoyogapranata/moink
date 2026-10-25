import type { Viewport } from "next";
import { redirect } from "next/navigation";

import { AppShell, type AppUser } from "@/components/app/AppShell";
import type { Profile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

// "cover" so env(safe-area-inset-bottom) is non-zero on notched phones and
// the floating tab bar can clear the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards these routes; repeated so the shell is safe on
  // its own.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, hsk_level_target")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "username" | "hsk_level_target">>();

  if (!profile?.username) redirect("/onboarding");

  const meta = user.user_metadata ?? {};
  const appUser: AppUser = {
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

  return <AppShell user={appUser}>{children}</AppShell>;
}
