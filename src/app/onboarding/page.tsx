import type { Metadata } from "next";
import { redirect } from "next/navigation";

import type { Profile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { suggestUsername } from "@/lib/username";

import { OnboardingFlow } from "./OnboardingFlow";

export const metadata: Metadata = {
  title: "Welcome - moink",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "username" | "display_name">>();

  if (profile?.username) {
    redirect("/dashboard");
  }

  const googleName =
    profile?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  return <OnboardingFlow suggestedUsername={suggestUsername(googleName)} />;
}
