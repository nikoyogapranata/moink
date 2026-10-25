"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidUsername } from "@/lib/username";

import { isHskLevel } from "./levels";

export type UsernameCheck = "available" | "taken" | "invalid" | "error";

export async function checkUsername(name: string): Promise<UsernameCheck> {
  if (typeof name !== "string" || !isValidUsername(name)) return "invalid";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_username_available", {
    name,
  });

  if (error || typeof data !== "boolean") return "error";
  return data ? "available" : "taken";
}

export type CompleteOnboardingResult =
  | { ok: true }
  | { ok: false; error: "username_taken" | "invalid" | "signed_out" | "unknown" };

export async function completeOnboarding(
  username: string,
  level: number,
): Promise<CompleteOnboardingResult> {
  if (
    typeof username !== "string" ||
    !isValidUsername(username) ||
    !isHskLevel(level)
  ) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "signed_out" };

  // .select() so an update that RLS filtered down to zero rows reads as a
  // failure instead of a silent success.
  const { data, error } = await supabase
    .from("profiles")
    .update({ username, hsk_level_target: level })
    .eq("id", user.id)
    .select("id");

  if (error) {
    if (error.code === "23505") return { ok: false, error: "username_taken" };
    console.error("completeOnboarding failed:", error);
    return { ok: false, error: "unknown" };
  }
  if (!data || data.length === 0) {
    console.error("completeOnboarding updated no profile row for", user.id);
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}
