import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * True when Supabase Auth couldn't be reached (network, timeout, a 5xx):
 * the user may well be signed in, so this must never send them to /login.
 * False for real answers about the session (no session, an expired or
 * revoked refresh token), which mean signed out.
 */
export function isTransientAuthError(error: unknown) {
  return isAuthRetryableFetchError(error) || !isAuthError(error);
}
