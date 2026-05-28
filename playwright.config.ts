import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for CommonGround E2E tests.
 *
 * Tests assume:
 *   - A running Next.js dev server at http://localhost:3000 (Playwright will
 *     start one via `webServer` below if you aren't already running `pnpm dev`).
 *   - The dev server has `ENABLE_TEST_AUTH=1` set so the test-only sign-in
 *     route works.
 *   - `.env.local` has SUPABASE_SECRET_KEY for the admin client used by the
 *     helpers (to create test users and seed DB state).
 *
 * Tests mutate the dev Supabase database. Use a dedicated test Supabase
 * project once the suite grows; for now, helpers/db.ts cleans up between
 * tests against the shared dev instance.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Tests share DB state (resetting between specs). Running serially is safest
  // for now — we can introduce per-test DB isolation later if we need parallel.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Speeds up "wait for element" when the element really doesn't exist.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Mobile suite: only specs ending in .mobile.spec.ts run here, so we
      // don't double-run the full happy path on every viewport.
      name: "mobile",
      use: { ...devices["iPhone 14"] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ENABLE_TEST_AUTH: "1",
    },
  },
});
