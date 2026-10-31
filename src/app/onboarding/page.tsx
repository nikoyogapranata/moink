import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountError } from "@/components/app/AccountError";
import { loadAccount } from "@/lib/supabase/app-user";
import { suggestUsername } from "@/lib/username";

import { OnboardingFlow } from "./OnboardingFlow";

export const metadata: Metadata = {
  title: "Welcome - moink",
};

export default async function OnboardingPage() {
  const account = await loadAccount();
  // A failed read shows an error, never the form: an onboarded user would
  // otherwise be offered (and could save) a new username and level.
  if (account.status === "error") return <AccountError />;
  if (account.status === "signed-out") {
    redirect("/login");
  }

  const { user, profile } = account;
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
