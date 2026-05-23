/**
 * Wipe conversation data for a fresh testing state.
 *
 *   pnpm reset:chats
 *
 * Deletes:
 *   - all matches
 *   - all messages + reactions + reflections (linked to matches)
 *   - all conversation-tied stance_history rows (round 1/2/3 votes)
 *   - anyone currently in the match_queue
 *
 * Keeps:
 *   - users, profiles, onboarding state
 *   - topics and propositions catalogue
 *   - user_propositions (the 3-5 things you picked at onboarding)
 *   - stance_history baselines from onboarding (rows where round IS NULL)
 *
 * Prompts before deleting. Reads SUPABASE_SECRET_KEY from .env.local so the
 * service role can bypass RLS on the chat-related tables.
 */

import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A timestamp that's effectively "since the dawn of time" — every row in
// every table we touch has created_at > 1970, so this matches everything.
const ALL = "1970-01-01";

async function count(table: string): Promise<number> {
  const { count: n } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  return n ?? 0;
}

async function countConversationStanceVotes(): Promise<number> {
  const { count: n } = await admin
    .from("stance_history")
    .select("*", { count: "exact", head: true })
    .not("match_id", "is", null);
  return n ?? 0;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`${question} `)).trim().toLowerCase();
  rl.close();
  return answer === "yes" || answer === "y";
}

async function main() {
  const [reactions, messages, reflections, stanceVotes, matches, queue] =
    await Promise.all([
      count("reactions"),
      count("messages"),
      count("reflections"),
      countConversationStanceVotes(),
      count("matches"),
      count("match_queue"),
    ]);

  console.log("\nThis will permanently delete the following:");
  console.log(`  ${matches.toString().padStart(5)} match(es)`);
  console.log(`  ${messages.toString().padStart(5)} message(s)`);
  console.log(`  ${reactions.toString().padStart(5)} reaction(s)`);
  console.log(`  ${reflections.toString().padStart(5)} reflection(s)`);
  console.log(
    `  ${stanceVotes.toString().padStart(5)} per-round stance vote(s)`,
  );
  console.log(`  ${queue.toString().padStart(5)} queued user(s)`);
  console.log("\nIt will KEEP: users, profiles, topics, propositions,");
  console.log("user_propositions, and onboarding-time stance baselines.\n");

  if (
    matches + messages + reactions + reflections + stanceVotes + queue ===
    0
  ) {
    console.log("Already clean. Nothing to delete.");
    return;
  }

  const ok = await confirm("Proceed? Type 'yes' to confirm:");
  if (!ok) {
    console.log("Cancelled.");
    return;
  }

  console.log("\nDeleting...");

  const steps: Array<
    [string, () => Promise<{ error: { message: string } | null }>]
  > = [
    [
      "reactions",
      async () => admin.from("reactions").delete().gt("created_at", ALL),
    ],
    [
      "messages",
      async () => admin.from("messages").delete().gt("created_at", ALL),
    ],
    [
      "reflections",
      async () => admin.from("reflections").delete().gt("created_at", ALL),
    ],
    [
      "stance_history (round votes only)",
      async () =>
        admin.from("stance_history").delete().not("match_id", "is", null),
    ],
    [
      "matches",
      async () => admin.from("matches").delete().gt("created_at", ALL),
    ],
    [
      "match_queue",
      async () => admin.from("match_queue").delete().gt("created_at", ALL),
    ],
  ];

  for (const [label, fn] of steps) {
    const { error } = await fn();
    if (error) {
      console.error(`  ✗ ${label}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${label} cleared`);
  }

  console.log("\nDone. Ready for a fresh testing run.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
