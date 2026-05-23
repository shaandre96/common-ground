"use server";

import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { stanceFromScore } from "@/lib/stance";
import { createClient } from "@/lib/supabase/server";

type Selection = { propositionId: string; score: number | null };

const MIN_PICKS = 3;
const MAX_PICKS = 5;

export async function completeOnboarding(selections: Selection[]) {
  if (selections.length < MIN_PICKS || selections.length > MAX_PICKS) {
    return {
      error: `Pick between ${MIN_PICKS} and ${MAX_PICKS} propositions.`,
    };
  }

  for (const s of selections) {
    if (s.score !== null && (s.score < 1 || s.score > 7)) {
      return { error: "Stance score must be 1–7." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to continue." };

  const rows = selections.map((s) => ({
    user_id: user.id,
    proposition_id: s.propositionId,
    score: s.score,
    stance: stanceFromScore(s.score),
  }));

  const { error: pickError } = await supabase
    .from("user_propositions")
    .upsert(rows, { onConflict: "user_id,proposition_id" });
  if (pickError) return { error: pickError.message };

  // Seed audit trail with whatever stances they did set (round = null means
  // "initial / onboarding-time", not tied to a conversation).
  const stanceRows = selections
    .filter((s) => s.score !== null)
    .map((s) => ({
      user_id: user.id,
      proposition_id: s.propositionId,
      stance: stanceFromScore(s.score),
      score: s.score,
    }));
  if (stanceRows.length > 0) {
    const { error: historyError } = await supabase
      .from("stance_history")
      .insert(stanceRows);
    if (historyError) return { error: historyError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarded: true })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };

  await track("onboarding_completed", {
    prop_count: selections.length,
    stances_set: selections.filter((s) => s.score !== null).length,
  });

  redirect("/match");
}
