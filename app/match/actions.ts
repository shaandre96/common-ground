"use server";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

export type MatchResult =
  | { status: "matched"; matchId: string }
  | { status: "waiting" }
  | { status: "error"; error: string };

/**
 * Look for a partner on the given proposition. Returns `matched` with a match
 * id if a partner was found (or the caller already has an active match),
 * `waiting` if the caller has been added to the queue, or `error`.
 *
 * The user's stance is read from their `user_propositions` row and passed to
 * the RPC; null stance is allowed and is treated as "different from any
 * concrete stance" by the matcher.
 */
export async function findMatch(propositionId: string): Promise<MatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "Not authenticated." };

  const { data: row } = await supabase
    .from("user_propositions")
    .select("stance")
    .eq("user_id", user.id)
    .eq("proposition_id", propositionId)
    .maybeSingle();

  await track("match_requested", {
    proposition_id: propositionId,
    stance: row?.stance ?? null,
  });

  const { data, error } = await supabase.rpc("find_match", {
    p_proposition_id: propositionId,
    p_stance: row?.stance ?? null,
  });

  if (error) return { status: "error", error: error.message };

  if (data) {
    await track("match_found", { match_id: data as string });
    return { status: "matched", matchId: data as string };
  }
  return { status: "waiting" };
}

/**
 * Remove the caller from the match queue (used when they cancel the
 * "finding your match" screen).
 */
export async function leaveQueue() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("match_queue")
    .delete()
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true as const };
}
