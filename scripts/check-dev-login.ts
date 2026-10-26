// Confirms /dev/login is a 404 in a production build, even with
// DEV_TEST_LOGIN=true set, and that it sets no session cookie.
//
//   pnpm test:dev-login
//
// Runs pnpm build, then pnpm start on PORT, requests the route and stops
// the server. Exits 1 on failure.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const PORT = 3100;
const URL_TO_CHECK = `http://localhost:${PORT}/dev/login`;
const READY_TIMEOUT_MS = 60_000;

function stop(server: ChildProcess) {
  if (!server.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill("SIGTERM");
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${PORT}/`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`pnpm start didn't answer on port ${PORT} within ${READY_TIMEOUT_MS / 1000}s`);
}

async function main() {
  const build = spawnSync("pnpm build", { stdio: "inherit", shell: true });
  if (build.status !== 0) throw new Error("pnpm build failed");

  const server = spawn(`pnpm start -p ${PORT}`, {
    shell: true,
    stdio: "ignore",
    env: { ...process.env, DEV_TEST_LOGIN: "true" },
  });
  try {
    await waitForServer();
    const response = await fetch(URL_TO_CHECK, { redirect: "manual" });
    const cookie = response.headers.get("set-cookie") ?? "";
    console.log(`GET /dev/login -> ${response.status}${cookie ? ` (set-cookie: ${cookie.slice(0, 60)}...)` : ""}`);
    if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
    if (/sb-[^=]*-auth-token/.test(cookie)) throw new Error("the 404 set a Supabase session cookie");
    console.log("PASS: /dev/login is a 404 in the production build, with DEV_TEST_LOGIN=true.");
  } finally {
    stop(server);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
