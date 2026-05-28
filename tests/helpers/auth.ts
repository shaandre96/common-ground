import type { Page } from "@playwright/test";
import { admin } from "./admin";

const TEST_PASSWORD = "test-password-1234";

export type TestUser = { email: string; password: string; id: string };

/**
 * Create (or return) a test user identified by a short label. Idempotent —
 * if a user with the same email already exists, returns their id without
 * recreating.
 *
 * Test emails follow the pattern `test-<label>@cg-test.dev` so they're easy
 * to spot in the auth.users table and to clean up later.
 */
export async function ensureTestUser(label: string): Promise<TestUser> {
  const email = `test-${label.toLowerCase()}@cg-test.dev`;

  // Cheap path: look up by email via admin listUsers
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    return { email, password: TEST_PASSWORD, id: existing.id };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`ensureTestUser(${label}): ${error?.message}`);
  }
  return { email, password: TEST_PASSWORD, id: data.user.id };
}

/**
 * Sign a Playwright page's browser context in as the given test user. Uses
 * the test-only `/api/test/sign-in` route which sets the Supabase SSR
 * auth cookies on the response.
 */
export async function signInAs(page: Page, user: TestUser): Promise<void> {
  const res = await page.request.post("/api/test/sign-in", {
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) {
    throw new Error(
      `signInAs(${user.email}): ${res.status()} — ${await res.text()}`,
    );
  }
}
