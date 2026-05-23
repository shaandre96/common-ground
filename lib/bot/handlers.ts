/**
 * Stateless bot handlers — the actual work.
 *
 * Each handler is invoked once per matching database event:
 *  - handleMatchCreated   ← when a new row appears in matches
 *  - handleMessageInserted ← when a new row appears in messages
 *  - handleUserQueued      ← when a new row appears in match_queue
 *
 * Production wraps each in a Vercel API route triggered by a Supabase
 * database webhook. Local dev wraps each in a Supabase realtime subscription
 * callback. The handlers themselves don't care which.
 *
 * Handlers are stateless: they re-derive everything from the DB each time.
 * They include "is this still relevant?" checks after their human-paced
 * sleep so racing webhooks (e.g. user sends three messages quickly) don't
 * trigger three bot replies — only the latest event actually acts.
 */

import {
  DELAYS,
  getAdminClient,
  getBotIds,
  getMessageCount,
  getRecentMessages,
  jitter,
  nextRoundScore,
  oppositeStance,
  pickFreeBot,
  scoreForStance,
  signInAsBot,
  sleep,
} from "@/lib/bot/internal";
import { generateReply } from "@/lib/bot/replies";
import { stageById } from "@/lib/prompts";

// ============================================================================
// handleMatchCreated — bot opens the conversation if it's a participant
// ============================================================================

export async function handleMatchCreated(matchId: string): Promise<void> {
  const admin = getAdminClient();
  const { byName } = await getBotIds(admin);

  const { data: match } = await admin
    .from("matches")
    .select(
      "id, status, score_a, score_b, user_a, user_b, proposition:proposition_id(text)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.status !== "active") return;

  const botUserId = byName.has(match.user_a)
    ? match.user_a
    : byName.has(match.user_b)
      ? match.user_b
      : null;
  if (!botUserId) return; // no bot in this match

  const botName = byName.get(botUserId);
  if (!botName) return;

  const isUserA = match.user_a === botUserId;
  const botScore = (isUserA ? match.score_a : match.score_b) ?? 4;
  const propositionText =
    (match.proposition as unknown as { text?: string } | null)?.text ?? "";

  // Parallel sleep + LLM call → total time is max(sleep, api).
  const [, reply] = await Promise.all([
    sleep(jitter(DELAYS.opener.min, DELAYS.opener.max)),
    generateReply({
      botName,
      proposition: propositionText,
      score: botScore,
      recentMessages: [],
    }),
  ]);

  // Re-check: someone may have spoken first while we slept.
  const count = await getMessageCount(admin, matchId);
  if (count > 0) {
    console.log(`[${botName}] opener cancelled — someone spoke first`);
    return;
  }

  const { client: authed } = await signInAsBot(botName);
  const { error } = await authed.from("messages").insert({
    match_id: matchId,
    sender_id: botUserId,
    body: reply.text,
  });
  if (error) {
    console.error(`[${botName}] opener insert: ${error.message}`);
  } else {
    console.log(
      `[${botName}] opener [${reply.source}${reply.latencyMs ? ` ${reply.latencyMs}ms` : ""}]: ${reply.text}`,
    );
  }
}

// ============================================================================
// handleMessageInserted — bot replies, or votes if the round is full
// ============================================================================

export async function handleMessageInserted(record: {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
}): Promise<void> {
  const admin = getAdminClient();
  const { ids: botIds, byName } = await getBotIds(admin);

  // Skip bot-authored messages (no replying to ourselves or other bots).
  if (botIds.has(record.sender_id)) return;

  const { data: match } = await admin
    .from("matches")
    .select(
      "id, status, current_round, score_a, score_b, user_a, user_b, proposition:proposition_id(text)",
    )
    .eq("id", record.match_id)
    .maybeSingle();
  if (!match || match.status !== "active") return;

  const botUserId = botIds.has(match.user_a)
    ? match.user_a
    : botIds.has(match.user_b)
      ? match.user_b
      : null;
  if (!botUserId) return;
  const botName = byName.get(botUserId);
  if (!botName) return;

  const isUserA = match.user_a === botUserId;
  const botScore = (isUserA ? match.score_a : match.score_b) ?? 4;

  // Round-state branch decided up front (cheap query). After the human-paced
  // sleep we re-check that we're still the relevant action — a fresh message
  // may have superseded us.
  const initialCount = await getMessageCount(admin, record.match_id);
  const stage = stageById(match.current_round);

  if (initialCount >= stage.endAtMessages) {
    // Round threshold hit — vote instead of replying.

    // Bail early if we've already voted this round.
    const { data: existing } = await admin
      .from("stance_history")
      .select("id")
      .eq("match_id", record.match_id)
      .eq("user_id", botUserId)
      .eq("round", match.current_round)
      .maybeSingle();
    if (existing) return;

    await sleep(jitter(DELAYS.vote.min, DELAYS.vote.max));

    // Re-check after sleep — maybe another vote already advanced the round.
    const { data: m2 } = await admin
      .from("matches")
      .select("current_round, status")
      .eq("id", record.match_id)
      .maybeSingle();
    if (!m2 || m2.status !== "active") return;
    if (m2.current_round !== match.current_round) return;

    const score = nextRoundScore(botScore, match.current_round);
    const { client: authed } = await signInAsBot(botName);
    const { error } = await authed.rpc("submit_round_vote", {
      p_match_id: record.match_id,
      p_score: score,
      p_reflection: null,
    });
    if (error) {
      console.error(`[${botName}] vote: ${error.message}`);
    } else {
      console.log(
        `[${botName}] voted ${score} on round ${match.current_round} of ${record.match_id.slice(0, 8)}`,
      );
    }
    return;
  }

  // Reply branch: parallel sleep + LLM call.
  const propositionText =
    (match.proposition as unknown as { text?: string } | null)?.text ?? "";

  const [, reply] = await Promise.all([
    sleep(jitter(DELAYS.reply.min, DELAYS.reply.max)),
    (async () => {
      const recent = await getRecentMessages(admin, record.match_id, botUserId);
      return generateReply({
        botName,
        proposition: propositionText,
        score: botScore,
        recentMessages: recent,
      });
    })(),
  ]);

  // Dedupe: only reply if our trigger message is still the latest non-bot
  // message. If newer user messages have arrived, a later handler invocation
  // will deal with them — and we'd just be answering stale context.
  const { data: latest } = await admin
    .from("messages")
    .select("id, sender_id")
    .eq("match_id", record.match_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || latest.id !== record.id) {
    console.log(
      `[${botName}] skipping stale message ${record.id.slice(0, 8)} — newer arrived`,
    );
    return;
  }

  // Also: if the round threshold was hit while we slept, abort.
  const postSleepCount = await getMessageCount(admin, record.match_id);
  if (postSleepCount >= stage.endAtMessages) {
    console.log(`[${botName}] skipping reply — round filled while sleeping`);
    return;
  }

  const { client: authed } = await signInAsBot(botName);
  const { error } = await authed.from("messages").insert({
    match_id: record.match_id,
    sender_id: botUserId,
    body: reply.text,
  });
  if (error) {
    console.error(`[${botName}] reply insert: ${error.message}`);
  } else {
    console.log(
      `[${botName}] reply [${reply.source}${reply.latencyMs ? ` ${reply.latencyMs}ms` : ""}]: ${reply.text}`,
    );
    if (reply.error) console.log(`  (${reply.error})`);
  }
}

// ============================================================================
// handleUserQueued — bot joins the queue with opposite stance after a delay
// ============================================================================

export async function handleUserQueued(record: {
  user_id: string;
  proposition_id: string;
  stance: string | null;
}): Promise<void> {
  const admin = getAdminClient();
  const { ids: botIds } = await getBotIds(admin);

  // Don't dispatch a bot to dispatch another bot.
  if (botIds.has(record.user_id)) return;

  await sleep(jitter(DELAYS.dispatch.min, DELAYS.dispatch.max));

  // Still in queue after the delay? (User may have cancelled or already been matched.)
  const { data: stillQueued } = await admin
    .from("match_queue")
    .select("user_id")
    .eq("user_id", record.user_id)
    .maybeSingle();
  if (!stillQueued) {
    console.log(
      `[dispatch] user ${record.user_id.slice(0, 8)} no longer queued — skipping`,
    );
    return;
  }

  const free = await pickFreeBot(admin);
  if (!free) {
    console.log("[dispatch] no free bots");
    return;
  }

  const botStance = oppositeStance(record.stance);
  const botScore = scoreForStance(botStance);

  // Snapshot the bot's user_propositions for this proposition so find_match
  // can copy the correct score into matches.score_a/b.
  const { error: upErr } = await admin.from("user_propositions").upsert(
    {
      user_id: free.botId,
      proposition_id: record.proposition_id,
      stance: botStance,
      score: botScore,
    },
    { onConflict: "user_id,proposition_id" },
  );
  if (upErr) {
    console.error(`[dispatch] upsert user_propositions: ${upErr.message}`);
    return;
  }

  const { client: authed } = await signInAsBot(free.botName);
  const { data, error } = await authed.rpc("find_match", {
    p_proposition_id: record.proposition_id,
    p_stance: botStance,
  });
  if (error) {
    console.error(`[dispatch ${free.botName}] find_match: ${error.message}`);
    return;
  }
  console.log(
    `[dispatch] ${free.botName} → user ${record.user_id.slice(0, 8)} on ${record.proposition_id.slice(0, 8)} as ${botStance} → match=${data}`,
  );
}
