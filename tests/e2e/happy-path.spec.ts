import { expect, test } from "@playwright/test";
import { ensureTestUser, signInAs } from "../helpers/auth";
import {
  castVoteForPartner,
  fillMessages,
  onboardUser,
  queueUserForProposition,
  resetChats,
  resetOnboarding,
} from "../helpers/db";

// The proposition both test users will debate.
const PROP = "ai-entry-level-jobs";

/**
 * Full user journey: onboarding → matching screen → 3-round conversation with
 * per-round voting → results.
 *
 * The "partner" (User B) is driven by admin helpers (pre-queued for matching,
 * messages bulk-inserted to hit round thresholds, votes cast directly) so the
 * test is deterministic and doesn't need the bot worker running.
 */
test("happy path: match, three rounds of voting, results", async ({ page }) => {
  const userA = await ensureTestUser("happy-a");
  const userB = await ensureTestUser("happy-b");

  await resetChats();
  // A strongly disagrees (2), B agrees (6) — a real gap to converge from.
  await onboardUser(userA.id, [
    { slug: PROP, score: 2 },
    { slug: "climate-reparations", score: 4 },
    { slug: "tuition-free-college", score: 6 },
  ]);
  await onboardUser(userB.id, [{ slug: PROP, score: 6 }]);

  await signInAs(page, userA);

  // --- Matching screen (real flow): B is queued, A clicks Find someone ---
  await queueUserForProposition(userB.id, PROP, "agree");

  await page.goto("/match");
  await expect(
    page.getByRole("heading", { name: "What do you want to debate?" }),
  ).toBeVisible();

  // Pick the shared proposition (its text), then Find someone.
  await page
    .getByRole("button", { name: /AI replacing entry-level jobs/i })
    .click();
  await page.getByRole("button", { name: "Find someone" }).click();

  await page.waitForURL(/\/chat\/[0-9a-f-]+$/, { timeout: 15_000 });
  const matchId = page.url().split("/chat/")[1];
  expect(matchId).toMatch(/[0-9a-f-]{36}/);

  // Header reflects the proposition + round.
  await expect(
    page.getByRole("heading", {
      name: /AI replacing entry-level jobs is a net negative/i,
    }),
  ).toBeVisible();

  // --- Rounds. For each: fill to threshold, reload, vote, partner votes. ---
  // Thresholds are cumulative (20 / 50 / 100), so insert only the delta each
  // round to reach the running total.
  const thresholds = [20, 50, 100];
  let inserted = 0;
  for (let round = 1; round <= 3; round++) {
    const delta = thresholds[round - 1] - inserted;
    await fillMessages(matchId, userA.id, userB.id, delta);
    inserted = thresholds[round - 1];

    await page.reload();

    // Vote panel should be showing for this round.
    await expect(page.getByText("Where do you now stand?")).toBeVisible({
      timeout: 10_000,
    });

    // A votes 3 (lean disagree — drifting toward the middle from 2).
    await page.getByRole("button", { name: "Stance 3 of 7" }).click();
    await page.getByRole("button", { name: "Submit vote" }).click();

    // A should see the waiting state.
    await expect(page.getByText(/Waiting for the other person/i)).toBeVisible();

    // Partner votes 5 (lean agree — drifting toward the middle from 6).
    await castVoteForPartner(matchId, userB.id, round, 5);
  }

  // --- Results ---
  await page.goto(`/chat/${matchId}/results`);

  // A started at 2, ended at 3; B started at 6, ended at 5. Distance went
  // 4 → 2, so the verdict is "Converged".
  await expect(page.getByRole("heading", { name: "Converged" })).toBeVisible();

  // The trajectory chart renders.
  await expect(
    page.getByRole("img", { name: /stance trajectory/i }),
  ).toBeVisible();

  // Both before/after summaries are present.
  await expect(page.getByText(/Net:/).first()).toBeVisible();

  // Cleanup so reruns start clean.
  await resetChats();
  await resetOnboarding(userA.id);
  await resetOnboarding(userB.id);
});
