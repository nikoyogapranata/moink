import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Development only: signs in as the test user (scripts/test-user.ts) and
// opens Training. A 404 unless this is `next dev` with DEV_TEST_LOGIN=true
// in .env.local. A production build replaces NODE_ENV with "production",
// so everything past the check is dead code there.
// scripts/check-dev-login.ts confirms the 404 under pnpm build && pnpm start.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_TEST_LOGIN !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    return new NextResponse("No test user. Run: pnpm tsx scripts/test-user.ts create", { status: 500 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("/dev/login: signInWithPassword failed", error);
    return new NextResponse(`Test sign-in failed: ${error.message}`, { status: 500 });
  }
  return NextResponse.redirect(new URL("/training", request.url));
}
