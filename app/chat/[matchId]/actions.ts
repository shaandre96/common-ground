"use server";

import { track } from "@/lib/analytics";
import { stageById } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY = 2000;

export type SendMessageResult =
  | {
      status: "ok";
      message: {
        id: string;
        match_id: string;
        sender_id: string;
        body: string;
        created_at: string;
      };
    }
  | { status: "error"; error: string; reason?: "round_complete" };

export async function sendMessage(
  matchId: string,
  body: string,
): Promise<SendMessageResult> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { status: "error", error: "Message is empty." };
  }
  if (trimmed.length > MAX_BODY) {
    return { status: "error", error: `Message is too long (max ${MAX_BODY}).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "Not authenticated." };

  // Round-limit gate: a round is "full" when the cumulative message count
  // hits the round's threshold. Sending is then blocked until both users
  // vote and the round advances.
  const { data: match } = await supabase
    .from("matches")
    .select("current_round, status")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return { status: "error", error: "Match not found." };
  }
  if (match.status !== "active") {
    return { status: "error", error: "This conversation has ended." };
  }

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);

  const stage = stageById(match.current_round);
  if ((count ?? 0) >= stage.endAtMessages) {
    return {
      status: "error",
      error: "Round complete — vote to continue.",
      reason: "round_complete",
    };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ match_id: matchId, sender_id: user.id, body: trimmed })
    .select("id, match_id, sender_id, body, created_at")
    .single();

  if (error) return { status: "error", error: error.message };

  await track("message_sent", { match_id: matchId, length: trimmed.length });

  return { status: "ok", message: data };
}

// =============================================================================

export type RoundVoteResult =
  | {
      status: "ok";
      newRound: number;
      bothVoted: boolean;
      matchStatus: string;
    }
  | { status: "error"; error: string };

export async function submitRoundVote(
  matchId: string,
  score: number,
  reflection?: string,
): Promise<RoundVoteResult> {
  if (!Number.isInteger(score) || score < 1 || score > 7) {
    return { status: "error", error: "Score must be an integer 1–7." };
  }
  if (reflection && reflection.length > 280) {
    return {
      status: "error",
      error: "Reflection must be 280 characters or fewer.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "Not authenticated." };

  const { data, error } = await supabase.rpc("submit_round_vote", {
    p_match_id: matchId,
    p_score: score,
    p_reflection: reflection?.trim() || null,
  });

  if (error) return { status: "error", error: error.message };
  const row = (
    data as Array<{
      new_round: number;
      both_voted: boolean;
      match_status: string;
    }>
  )[0];
  if (!row) return { status: "error", error: "Vote not recorded." };

  await track("round_voted", {
    match_id: matchId,
    round: row.new_round,
    score,
    both_voted: row.both_voted,
  });

  return {
    status: "ok",
    newRound: row.new_round,
    bothVoted: row.both_voted,
    matchStatus: row.match_status,
  };
}

// =============================================================================

export async function endConversation(matchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" as const, error: "Not authenticated." };

  const { data, error } = await supabase.rpc("end_conversation", {
    p_match_id: matchId,
  });
  if (error) return { status: "error" as const, error: error.message };

  await track("match_ended", {
    match_id: matchId,
    reason: "user_initiated",
    final_status: data as string,
  });

  return { status: "ok" as const, matchStatus: data as string };
}

// =============================================================================

export type ReactionType = "heart" | "thumbs_up" | "thumbs_down";

export async function toggleReaction(messageId: string, type: ReactionType) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" as const, error: "Not authenticated." };

  const { data, error } = await supabase.rpc("toggle_reaction", {
    p_message_id: messageId,
    p_type: type,
  });
  if (error) return { status: "error" as const, error: error.message };

  return { status: "ok" as const, action: data as string };
}
