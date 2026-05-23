/**
 * Seed bot users.
 *
 * Creates ~5 Supabase auth users that act as practice partners for testing
 * matching/chat/agree-disagree flows without needing two humans. Each bot has
 * `onboarded=true` and a `user_propositions` row for every proposition so any
 * (proposition, stance) combo can find a partner. Idempotent — safe to re-run.
 *
 *   pnpm seed:bots
 */

import { createClient } from "@supabase/supabase-js";
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
const serviceKey = requireEnv("SUPABASE_SECRET_KEY");
const password = requireEnv("BOT_PASSWORD");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BOTS = [
  { email: "bot-alex@commonground.dev", username: "Alex" },
  { email: "bot-sam@commonground.dev", username: "Sam" },
  { email: "bot-riley@commonground.dev", username: "Riley" },
  { email: "bot-jordan@commonground.dev", username: "Jordan" },
  { email: "bot-casey@commonground.dev", username: "Casey" },
];

const STANCES = ["agree", "disagree", "unsure"] as const;

async function findExistingUserId(email: string): Promise<string | null> {
  // listUsers is paginated; we have < 50 bots so first page is enough.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function main() {
  const { data: propositions, error: propError } = await admin
    .from("propositions")
    .select("id, slug")
    .eq("active", true)
    .order("slug");
  if (propError) throw propError;
  if (!propositions?.length) {
    console.error(
      "No propositions found — apply 00003_propositions.sql before seeding bots.",
    );
    process.exit(1);
  }

  for (const [botIdx, bot] of BOTS.entries()) {
    let userId = await findExistingUserId(bot.email);

    if (userId) {
      console.log(`✓ ${bot.username.padEnd(8)} exists  (${userId})`);
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: bot.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      userId = created.user.id;
      console.log(`+ ${bot.username.padEnd(8)} created (${userId})`);
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ username: bot.username, onboarded: true })
      .eq("id", userId);
    if (profileErr) throw profileErr;

    // Rotate stances across propositions × bots so every (proposition,
    // stance) combo is covered by at least one bot.
    const rows = propositions.map((p, pi) => ({
      user_id: userId,
      proposition_id: p.id,
      stance: STANCES[(pi + botIdx) % STANCES.length],
    }));
    const { error: upErr } = await admin
      .from("user_propositions")
      .upsert(rows, { onConflict: "user_id,proposition_id" });
    if (upErr) throw upErr;
    console.log(`           ${rows.length} propositions seeded\n`);
  }

  console.log(`Done. Bot password: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
