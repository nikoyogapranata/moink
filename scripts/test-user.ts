// A reusable test account for checking signed-in screens in development.
//
//   pnpm tsx scripts/test-user.ts create   make (or reset) the test user
//   pnpm tsx scripts/test-user.ts delete   remove it and all its data
//
// create makes a confirmed email/password user with the service role key,
// with the email from TEST_USER_EMAIL (moink-test@example.com when unset)
// and a new random password. It saves TEST_USER_EMAIL, TEST_USER_PASSWORD
// and TEST_USER_ID to .env.local, and fills the profile (username
// moink_test, HSK 3, 10 new words a day) so onboarding is skipped. Run it
// again to reset the password and profile; cards and reviews stay.
//
// Sign in with /dev/login (needs DEV_TEST_LOGIN=true in .env.local and
// pnpm dev).
//
// Every write and delete is filtered by the test user's id, and delete
// first checks that the id in .env.local still belongs to TEST_USER_EMAIL,
// so no other account is ever touched.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

const ENV_FILE = ".env.local";
const DEFAULT_EMAIL = "moink-test@example.com";
const PROFILE = { username: "moink_test", hsk_level_target: 3, daily_new_words: 10 };
/** Tables with the user's rows, deleted before the account itself. */
const USER_TABLES = ["reviews", "user_words"] as const;

config({ path: ENV_FILE });
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Sets (or replaces) KEY=value lines in .env.local, leaving the rest. */
function saveEnv(values: Record<string, string>) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) text = text.replace(pattern, line);
    else text += `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`;
  }
  writeFileSync(ENV_FILE, text);
}

/** The test user, by the id saved in .env.local, if it still exists and
 *  still has the test email. */
async function findTestUser(email: string) {
  const id = process.env.TEST_USER_ID;
  if (!id) return null;
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return null;
  if (data.user.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`TEST_USER_ID ${id} belongs to another email, not ${email}. Fix .env.local by hand; nothing was changed.`);
  }
  return data.user;
}

async function create() {
  const email = process.env.TEST_USER_EMAIL || DEFAULT_EMAIL;
  const password = randomBytes(24).toString("base64url");

  let user = await findTestUser(email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`Test user exists (${user.id}); password reset.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      throw new Error(
        `Couldn't create ${email}: ${error.message}. If the account already exists but TEST_USER_ID isn't in .env.local, delete it in the Supabase dashboard or set TEST_USER_ID to its id.`,
      );
    }
    user = data.user;
    console.log(`Created test user ${user.id}.`);
  }

  // The username must be free, or onboarding's unique username would clash.
  const { data: taken, error: takenError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", PROFILE.username)
    .neq("id", user.id)
    .limit(1);
  if (takenError) throw takenError;
  if (taken.length > 0) throw new Error(`The username ${PROFILE.username} belongs to another account; the profile wasn't filled.`);

  const { error: profileError } = await admin.from("profiles").upsert({ id: user.id, ...PROFILE }, { onConflict: "id" });
  if (profileError) throw profileError;

  saveEnv({ TEST_USER_EMAIL: email, TEST_USER_PASSWORD: password, TEST_USER_ID: user.id });
  console.log(`Profile filled (${PROFILE.username}, HSK ${PROFILE.hsk_level_target}). Saved the email, password and id to ${ENV_FILE}.`);
  if (process.env.DEV_TEST_LOGIN !== "true") console.log(`Add DEV_TEST_LOGIN=true to ${ENV_FILE} to use /dev/login.`);
}

async function remove() {
  const email = process.env.TEST_USER_EMAIL || DEFAULT_EMAIL;
  const user = await findTestUser(email);
  if (!user) {
    console.log("No test user found (TEST_USER_ID is unset or the account is gone). Nothing to delete.");
    return;
  }
  // Explicitly, by the test user's id, in case a foreign key doesn't cascade.
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) throw error;
  }
  const { error: profileError } = await admin.from("profiles").delete().eq("id", user.id);
  if (profileError) throw profileError;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  saveEnv({ TEST_USER_ID: "", TEST_USER_PASSWORD: "" });
  console.log(`Deleted test user ${user.id} (${email}) with its cards, reviews and profile.`);
}

const command = process.argv[2];
const run = command === "create" ? create : command === "delete" ? remove : null;
if (!run) {
  console.error("Usage: pnpm tsx scripts/test-user.ts create|delete");
  process.exit(1);
}
run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
