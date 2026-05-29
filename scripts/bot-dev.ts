/**
 * Local development bot runner.
 *
 * In production, three Supabase database webhooks fire HTTP POSTs at the
 * Next.js API routes under `app/api/bot/*`, which call the handlers in
 * `lib/bot/handlers.ts`. We can't do that in dev because localhost isn't
 * reachable from Supabase's webhook servers.
 *
 * Instead, this script subscribes to the same events via Supabase Realtime
 * (messages + matches), polls `match_queue` (not in the realtime publication),
 * and dispatches each event to the *exact same handler functions* the
 * production routes call. Same logic in both environments — only the trigger
 * mechanism differs.
 *
 *   npm run bot:dev
 */

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  handleMatchCreated,
  handleMessageInserted,
  handleUserQueued,
} from "../lib/bot/handlers";

config({ path: ".env.local", quiet: true });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = requireEnv("SUPABASE_SECRET_KEY");
// (Also requires NEXT_PUBLIC_SUPABASE_ANON_KEY + BOT_PASSWORD — checked
//  lazily inside the handlers when they sign in as a bot.)

// Service-role client — bypasses RLS so the dev runner sees every event
// regardless of which user it concerns.
const admin: SupabaseClient = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const POLL_QUEUE_INTERVAL_MS = 2000;

function shortId(id: string): string {
  return id.slice(0, 8);
}

function subscribeRealtime(): RealtimeChannel {
  return admin
    .channel("bot-dev")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const row = payload.new as {
          id: string;
          match_id: string;
          sender_id: string;
          body: string;
        };
        console.log(
          `[bot-dev] messages INSERT ${shortId(row.id)} in ${shortId(row.match_id)}`,
        );
        handleMessageInserted(row).catch((err) =>
          console.error("handleMessageInserted error:", err),
        );
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "matches" },
      (payload) => {
        const row = payload.new as { id: string };
        console.log(`[bot-dev] matches INSERT ${shortId(row.id)}`);
        handleMatchCreated(row.id).catch((err) =>
          console.error("handleMatchCreated error:", err),
        );
      },
    )
    .subscribe();
}

/**
 * `match_queue` isn't in the supabase_realtime publication, so we poll. In
 * prod the webhook fires immediately on insert — no polling needed.
 */
function startQueuePoller() {
  const seen = new Set<string>();
  return setInterval(async () => {
    const { data, error } = await admin
      .from("match_queue")
      .select("user_id, proposition_id, stance, created_at");
    if (error) {
      console.error("queue poll error:", error.message);
      return;
    }
    const current = new Set<string>();
    for (const entry of data ?? []) {
      current.add(entry.user_id);
      if (seen.has(entry.user_id)) continue;
      seen.add(entry.user_id);
      console.log(`[bot-dev] match_queue INSERT for ${shortId(entry.user_id)}`);
      handleUserQueued(entry).catch((err) =>
        console.error("handleUserQueued error:", err),
      );
    }
    // Forget users who left the queue, so re-queuing fires the handler again.
    for (const id of seen) {
      if (!current.has(id)) seen.delete(id);
    }
  }, POLL_QUEUE_INTERVAL_MS);
}

async function main() {
  console.log("Starting bot-dev...");
  subscribeRealtime();
  startQueuePoller();
  console.log(
    `\n[bot-dev] listening: messages + matches via realtime, match_queue via ${POLL_QUEUE_INTERVAL_MS}ms poll.`,
  );
  console.log("Ctrl+C to stop.\n");

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
