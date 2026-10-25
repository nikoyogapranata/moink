// Username rules, shared by the onboarding form and its server actions.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const RESERVED_USERNAMES = new Set(["moink", "bao", "admin", "support", "root"]);

/** What the input does as the user types: lowercase, no whitespace. */
export function normalizeUsernameInput(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, "");
}

/** Why a username is not allowed, or null when it passes every local rule.
 *  Says which rule fails so the helper text can be specific. */
export function usernameProblem(name: string): string | null {
  const badChar = name.match(/[^a-z0-9_]/u)?.[0];
  if (badChar) {
    return `"${badChar}" isn't allowed. Use letters, numbers, or underscores.`;
  }
  if (name.length < USERNAME_MIN) {
    return `Too short. Use at least ${USERNAME_MIN} characters.`;
  }
  if (name.length > USERNAME_MAX) {
    return `Too long. Keep it to ${USERNAME_MAX} characters or fewer.`;
  }
  if (RESERVED_USERNAMES.has(name)) {
    return "That one's reserved. Try another.";
  }
  return null;
}

export function isValidUsername(name: string) {
  return USERNAME_PATTERN.test(name) && usernameProblem(name) === null;
}

/** Turn a display name like "José Ramírez" into "jose_ramirez", or null if
 *  nothing usable is left. */
export function suggestUsername(displayName: string | null | undefined) {
  if (!displayName) return null;

  const suggestion = displayName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, USERNAME_MAX)
    .replace(/_$/, "");

  return isValidUsername(suggestion) ? suggestion : null;
}
