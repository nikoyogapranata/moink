import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (first 20):",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20),
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
    console.error("exchangeCodeForSession failed:", error);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
