import { admin } from "./admin";

const ALL_TIME = "1970-01-01";

type Stance = "agree" | "disagree" | "unsure";

function stanceFor(score: number): Stance {
  if (score >= 5) return "agree";
  if (score <= 3) return "disagree";
  return "unsure";
}

/**
 * Mirror of `npm run reset:chats` but synchronous (no prompt). Run before tests
 * that need a clean conversation slate. Keeps users + onboarding picks +
 * onboarding-time stance baselines.
 */
export async function resetChats(): Promise<void> {
  await admin.from("reactions").delete().gt("created_at", ALL_TIME);
  await admin.from("messages").delete().gt("created_at", ALL_TIME);
  await admin.from("reflections").delete().gt("created_at", ALL_TIME);
  await admin.from("stance_history").delete().not("match_id", "is", null);
  await admin.from("matches").delete().gt("created_at", ALL_TIME);
  await admin.from("match_queue").delete().gt("created_at", ALL_TIME);
}

/**
 * Reset a single user's onboarding state — remove their user_propositions,
 * remove their onboarding-time stance_history entries (round IS NULL), and
 * flip profiles.onboarded back to false.
 */
export async function resetOnboarding(userId: string): Promise<void> {
  await admin.from("user_propositions").delete().eq("user_id", userId);
  await admin
    .from("stance_history")
    .delete()
    .eq("user_id", userId)
    .is("match_id", null);
  await admin.from("profiles").update({ onboarded: false }).eq("id", userId);
}

/**
 * Onboard a user via the admin client: set user_propositions for the given
 * proposition slugs and scores, flip profiles.onboarded = true.
 */
export async function onboardUser(
  userId: string,
  picks: Array<{ slug: string; score: number }>,
): Promise<void> {
  const slugs = picks.map((p) => p.slug);
  const { data: props, error: propErr } = await admin
    .from("propositions")
    .select("id, slug")
    .in("slug", slugs);
  if (propErr) throw propErr;
  if (!props || props.length !== picks.length) {
    throw new Error(
      `onboardUser: missing propositions for ${slugs.join(", ")}`,
    );
  }

  const rows = picks.map((p) => {
    const prop = props.find((x) => x.slug === p.slug);
    if (!prop) throw new Error(`proposition not found: ${p.slug}`);
    return {
      user_id: userId,
      proposition_id: prop.id,
      score: p.score,
      stance: stanceFor(p.score),
    };
  });

  const { error: upErr } = await admin
    .from("user_propositions")
    .upsert(rows, { onConflict: "user_id,proposition_id" });
  if (upErr) throw upErr;

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ onboarded: true })
    .eq("id", userId);
  if (profileErr) throw profileErr;
}

/**
 * Create an active match directly via admin, bypassing the queue. Scores
 * are pulled from user_propositions (matching what `find_match` would do).
 */
export async function createMatchBetween(
  userAId: string,
  userBId: string,
  propositionSlug: string,
): Promise<string> {
  const { data: prop, error: propErr } = await admin
    .from("propositions")
    .select("id")
    .eq("slug", propositionSlug)
    .maybeSingle();
  if (propErr) throw propErr;
  if (!prop) throw new Error(`proposition not found: ${propositionSlug}`);

  const { data: ups } = await admin
    .from("user_propositions")
    .select("user_id, score")
    .eq("proposition_id", prop.id)
    .in("user_id", [userAId, userBId]);

  const scoreA = ups?.find((u) => u.user_id === userAId)?.score ?? 4;
  const scoreB = ups?.find((u) => u.user_id === userBId)?.score ?? 4;

  const { data: match, error } = await admin
    .from("matches")
    .insert({
      proposition_id: prop.id,
      user_a: userAId,
      user_b: userBId,
      score_a: scoreA,
      score_b: scoreB,
      stance_a: stanceFor(scoreA),
      stance_b: stanceFor(scoreB),
      status: "active",
    })
    .select("id")
    .single();
  if (error || !match) throw error;
  return match.id;
}

/**
 * Put a user into the match queue for a proposition (so the other user's
 * `find_match` call pairs with them immediately). Used to drive the real
 * /match screen flow in tests without a running bot worker.
 */
export async function queueUserForProposition(
  userId: string,
  propositionSlug: string,
  stance: Stance,
): Promise<void> {
  const { data: prop, error: propErr } = await admin
    .from("propositions")
    .select("id")
    .eq("slug", propositionSlug)
    .maybeSingle();
  if (propErr) throw propErr;
  if (!prop) throw new Error(`proposition not found: ${propositionSlug}`);

  const { error } = await admin
    .from("match_queue")
    .upsert(
      { user_id: userId, proposition_id: prop.id, stance },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

/**
 * Insert N messages alternating between the two users. Used to fast-forward
 * a match to a round threshold without typing in the browser.
 */
export async function fillMessages(
  matchId: string,
  userAId: string,
  userBId: string,
  count: number,
): Promise<void> {
  const rows = Array.from({ length: count }, (_, i) => ({
    match_id: matchId,
    sender_id: i % 2 === 0 ? userAId : userBId,
    body: `test message ${i + 1}`,
  }));
  const { error } = await admin.from("messages").insert(rows);
  if (error) throw error;
}

/**
 * Cast a round vote on behalf of a user (admin bypasses the RPC's
 * authentication check by inserting directly + advancing the round).
 *
 * Use this to fast-forward the partner side past round 1/2 votes so the
 * test can focus on the human-side flow.
 */
export async function castVoteForPartner(
  matchId: string,
  partnerId: string,
  round: number,
  score: number,
): Promise<void> {
  // Look up the match to get proposition_id + current_round
  const { data: match, error: matchErr } = await admin
    .from("matches")
    .select("proposition_id, current_round, status")
    .eq("id", matchId)
    .single();
  if (matchErr) throw matchErr;
  if (!match) throw new Error("match not found");
  if (match.current_round !== round) {
    throw new Error(
      `castVoteForPartner: match is on round ${match.current_round}, not ${round}`,
    );
  }

  // Insert the stance_history row
  const { error: histErr } = await admin.from("stance_history").insert({
    user_id: partnerId,
    proposition_id: match.proposition_id,
    score,
    stance: stanceFor(score),
    round,
    match_id: matchId,
  });
  if (histErr) throw histErr;

  // Count distinct voters this round
  const { data: votes } = await admin
    .from("stance_history")
    .select("user_id")
    .eq("match_id", matchId)
    .eq("round", round);
  const voters = new Set((votes ?? []).map((v) => v.user_id));

  if (voters.size >= 2) {
    if (round === 3) {
      await admin
        .from("matches")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", matchId);
    } else {
      await admin
        .from("matches")
        .update({ current_round: round + 1 })
        .eq("id", matchId);
    }
  }
}
