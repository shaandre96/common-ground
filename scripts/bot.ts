/**
 * Bot CLI — make a seeded bot do things.
 *
 *   pnpm bot queue <proposition-slug> [stance] [bot-name]
 *     Sign in as the bot and call find_match. Optional stance overrides the
 *     bot's existing user_propositions stance. Default bot: Alex.
 *
 *   pnpm bot pair <your-email> <proposition-slug> <your-stance> <bot-stance> [bot-name]
 *     Hand-pair a bot with the human user (looked up by email). Prints the
 *     chat URL. Useful for testing /chat before the matching screen is built.
 *
 *   pnpm bot say <bot-name> <match-id> <message...>
 *     Send a message as the bot in an existing match. The real user sees it
 *     arrive via realtime.
 *
 *   pnpm bot vote <bot-name> <match-id> <score> [reflection...]
 *     Vote on the current round. score is 1–7 (Likert). Optional reflection
 *     becomes the private one-line note stored in the reflections table.
 *
 *   pnpm bot leave [bot-name]
 *     Make the bot drop out of the match queue.
 *
 *   pnpm bot status
 *     Show current queue and active matches across all bots.
 *
 * Examples:
 *   pnpm bot queue climate-reparations agree
 *   pnpm bot queue ai-entry-level-jobs disagree Sam
 *   pnpm bot leave Sam
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = requireEnv("SUPABASE_SECRET_KEY");
const password = requireEnv("BOT_PASSWORD");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function emailFor(name: string) {
  return `bot-${name.toLowerCase()}@commonground.dev`;
}

async function signInAsBot(name: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: emailFor(name),
    password,
  });
  if (error) {
    console.error(
      `Could not sign in as ${name}: ${error.message}\n` +
        `Did you run \`pnpm seed:bots\`?`,
    );
    process.exit(1);
  }
  return client;
}

async function lookupProposition(slug: string) {
  const { data, error } = await admin
    .from("propositions")
    .select("id, text")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error(`Proposition '${slug}' not found.`);
    process.exit(1);
  }
  return data as { id: string; text: string };
}

async function queueCmd(args: string[]) {
  const [slug, stance, name = "Alex"] = args;
  if (!slug) {
    console.error(
      "usage: pnpm bot queue <proposition-slug> [stance] [bot-name]",
    );
    process.exit(1);
  }
  if (stance && !["agree", "disagree", "unsure"].includes(stance)) {
    console.error(`Stance must be one of: agree | disagree | unsure`);
    process.exit(1);
  }

  const proposition = await lookupProposition(slug);
  const client = await signInAsBot(name);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    console.error("Sign-in succeeded but no user — bailing.");
    process.exit(1);
  }

  if (stance) {
    const { error } = await client
      .from("user_propositions")
      .upsert(
        { user_id: user.id, proposition_id: proposition.id, stance },
        { onConflict: "user_id,proposition_id" },
      );
    if (error) throw error;
  }

  const { data, error } = await client.rpc("find_match", {
    p_proposition_id: proposition.id,
    p_stance: stance ?? null,
  });
  if (error) {
    console.error("find_match error:", error.message);
    process.exit(1);
  }

  if (data) {
    console.log(
      `✓ ${name} matched on "${proposition.text}" — match_id=${data}`,
    );
  } else {
    console.log(`… ${name} is waiting in the queue for "${proposition.text}".`);
  }
}

async function pairCmd(args: string[]) {
  const [userEmail, slug, userStance, botStance, botName = "Sam"] = args;
  if (!userEmail || !slug || !userStance || !botStance) {
    console.error(
      "usage: pnpm bot pair <your-email> <proposition-slug> <your-stance> <bot-stance> [bot-name]",
    );
    process.exit(1);
  }
  for (const s of [userStance, botStance]) {
    if (!["agree", "disagree", "unsure"].includes(s)) {
      console.error("Stances must be one of: agree | disagree | unsure");
      process.exit(1);
    }
  }

  // Look up the real user by email (paginate in case of many users).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email === userEmail);
  if (!user) {
    console.error(`No user with email ${userEmail}.`);
    process.exit(1);
  }

  const proposition = await lookupProposition(slug);

  const { data: bot, error: botErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username", botName)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) {
    console.error(`No bot named ${botName} — did you run \`pnpm seed:bots\`?`);
    process.exit(1);
  }

  const { data: match, error: matchErr } = await admin
    .from("matches")
    .insert({
      proposition_id: proposition.id,
      user_a: bot.id,
      user_b: user.id,
      stance_a: botStance,
      stance_b: userStance,
      status: "active",
    })
    .select("id")
    .single();
  if (matchErr) throw matchErr;

  console.log(
    `✓ ${botName} (${botStance}) paired with ${userEmail} (${userStance}) on "${proposition.text}"`,
  );
  console.log(`  match_id: ${match.id}`);
  console.log(`  open: http://localhost:3000/chat/${match.id}`);
}

async function sayCmd(args: string[]) {
  const [botName, matchId, ...rest] = args;
  const body = rest.join(" ");
  if (!botName || !matchId || !body) {
    console.error("usage: pnpm bot say <bot-name> <match-id> <message...>");
    process.exit(1);
  }
  const client = await signInAsBot(botName);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) process.exit(1);

  const { error } = await client
    .from("messages")
    .insert({ match_id: matchId, sender_id: user.id, body });
  if (error) {
    console.error("send error:", error.message);
    process.exit(1);
  }
  console.log(`✓ ${botName}: ${body}`);
}

async function voteCmd(args: string[]) {
  const [botName, matchId, scoreStr, ...rest] = args;
  if (!botName || !matchId || !scoreStr) {
    console.error(
      "usage: pnpm bot vote <bot-name> <match-id> <score:1-7> [reflection...]",
    );
    process.exit(1);
  }
  const score = Number.parseInt(scoreStr, 10);
  if (!Number.isInteger(score) || score < 1 || score > 7) {
    console.error("Score must be an integer between 1 and 7.");
    process.exit(1);
  }
  const reflection = rest.length > 0 ? rest.join(" ") : null;

  const client = await signInAsBot(botName);
  const { data, error } = await client.rpc("submit_round_vote", {
    p_match_id: matchId,
    p_score: score,
    p_reflection: reflection,
  });
  if (error) {
    console.error("submit_round_vote error:", error.message);
    process.exit(1);
  }
  const row = (
    data as Array<{
      new_round: number;
      both_voted: boolean;
      match_status: string;
    }>
  )[0];
  console.log(
    `✓ ${botName} voted ${score} on this match. both_voted=${row?.both_voted} new_round=${row?.new_round} status=${row?.match_status}`,
  );
}

async function leaveCmd(args: string[]) {
  const [name = "Alex"] = args;
  const client = await signInAsBot(name);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) process.exit(1);

  const { error } = await client
    .from("match_queue")
    .delete()
    .eq("user_id", user.id);
  if (error) throw error;
  console.log(`✓ ${name} left the queue.`);
}

async function statusCmd() {
  const { data: queue } = await admin
    .from("match_queue")
    .select(
      "user_id, stance, created_at, profiles:user_id(username), propositions:proposition_id(text)",
    )
    .order("created_at");
  const { data: matches } = await admin
    .from("matches")
    .select(
      "id, status, created_at, propositions:proposition_id(text), a:user_a(username), b:user_b(username), stance_a, stance_b",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });

  console.log("--- queue ---");
  if (!queue?.length) console.log("(empty)");
  for (const q of queue ?? []) {
    // biome-ignore lint/suspicious/noExplicitAny: nested joined columns
    const row = q as any;
    console.log(
      `  ${row.profiles?.username ?? row.user_id} → "${row.propositions?.text}" (${row.stance ?? "no stance"})`,
    );
  }

  console.log("\n--- active matches ---");
  if (!matches?.length) console.log("(none)");
  for (const m of matches ?? []) {
    // biome-ignore lint/suspicious/noExplicitAny: nested joined columns
    const row = m as any;
    console.log(
      `  ${row.a?.username} (${row.stance_a ?? "—"})  vs  ${row.b?.username} (${row.stance_b ?? "—"})  on "${row.propositions?.text}"  [${row.id}]`,
    );
  }
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  switch (cmd) {
    case "queue":
      await queueCmd(args);
      break;
    case "pair":
      await pairCmd(args);
      break;
    case "say":
      await sayCmd(args);
      break;
    case "vote":
      await voteCmd(args);
      break;
    case "leave":
      await leaveCmd(args);
      break;
    case "status":
      await statusCmd();
      break;
    default:
      console.error("commands: queue | pair | say | vote | leave | status");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
