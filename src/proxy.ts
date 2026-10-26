import { type NextRequest } from "next/server";
import { redirectWithSession, updateSession } from "@/lib/supabase/middleware";
import { getHomePath } from "@/lib/supabase/profile";

// Signed-in screens that need a finished profile: everything in the
// src/app/(app) and src/app/(focus) route groups (/training covers the
// focus-mode /training/review and /training/flashcards). Add new app
// routes here.
const APP_ROUTES = [
  "/dashboard",
  "/training",
  "/dictionary",
  "/profile",
  "/settings",
];

function isAppRoute(pathname: string) {
  return APP_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { supabase, user, response } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isOnboarding = pathname === "/onboarding";
  if (!isOnboarding && !isAppRoute(pathname)) return response;

  if (!user) return redirectWithSession(request, response, "/login");

  // Only these routes pay for the profile lookup.
  const home = await getHomePath(supabase, user.id);
  if (isOnboarding && home === "/dashboard") {
    return redirectWithSession(request, response, "/dashboard");
  }
  if (!isOnboarding && home === "/onboarding") {
    return redirectWithSession(request, response, "/onboarding");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
