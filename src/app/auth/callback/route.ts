import { NextResponse, type NextRequest } from "next/server";
import { getHomePath } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // New accounts have no username yet, so they land on onboarding.
      // When the profile can't be read, the dashboard: its layout shows
      // the error and a retry, and sends a new account on to onboarding
      // once the read works.
      const home = (await getHomePath(supabase, data.user.id)) ?? "/dashboard";
      return NextResponse.redirect(`${origin}${home}`);
    }
    console.error("exchangeCodeForSession failed:", error);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
