import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isTransientAuthError } from "./auth-errors";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the auth session (getClaims refreshes an expired token first)
  // and read the user from the verified JWT. The project signs with
  // asymmetric keys, so the check is local: no round trip to Supabase Auth
  // on every request, which getUser() cost (about 280 ms each). Do not run
  // code between createServerClient and getClaims(); it can make the
  // session hard to debug.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;
  // Auth couldn't be reached (say, refreshing an expired token): not the
  // same as signed out.
  const authUnavailable = error !== null && isTransientAuthError(error);
  if (authUnavailable) console.error("updateSession: couldn't reach Supabase Auth.", error);

  return { supabase, userId, authUnavailable, response: supabaseResponse };
}

/** Redirect while keeping any auth cookies the session refresh just set. */
export function redirectWithSession(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const response = NextResponse.redirect(url);
  sessionResponse.cookies
    .getAll()
    .forEach((cookie) => response.cookies.set(cookie));
  return response;
}
