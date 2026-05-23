/**
 * Shared internal helpers for the bot handlers. Not used by the Next.js app
 * surface — only by `lib/bot/handlers.ts`, the API routes that wrap them,
 * and the local dev runner (`scripts/bot-dev.ts`).
 *
 * All bot actions ultimately need either:
 *  - the service-role admin client (to read across users), or
 *  - a per-bot client signed in via email + password (to call RLS-scoped RPCs
 *    that use `auth.uid()` like `submit_round_vote`, `find_match`).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BOT_NAMES = ["Alex", "Sam", "Riley", "Jordan", "Casey"] as const;
export type BotName = (typeof BOT_NAMES)[number];

export const STANCES = ["agree", "disagree", "unsure"] as const;

// Delay budgets tuned for Vercel Hobby's 10s function cap. Each function's
// total runtime is roughly: signin (~300ms) + sleep + LLM (~1.5s) + insert.
export const DELAYS = {
  /** Bot-as-opener delay after a match is created. */
  opener: { min: 4000, max: 7000 },
  /** Bot reply to a user message. */
  reply: { min: 3000, max: 7000 },
  /** Bot vote when a round threshold is hit. */
  vote: { min: 4000, max: 8000 },
  /** Time we wait before dispatching a bot to a queued user. */
  dispatch: { min: 3500, max: 5500 },
} as const;

export function jitter(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function scoreForStance(stance: string): number {
  return stance === "agree" ? 6 : stance === "disagree" ? 2 : 4;
}

export function oppositeStance(
  userStance: string | null,
): "agree" | "disagree" {
  if (userStance === "agree") return "disagree";
  if (userStance === "disagree") return "agree";
  return Math.random() < 0.5 ? "agree" : "disagree";
}

/** Drift a bot's vote toward middle over the course of three rounds. */
export function nextRoundScore(initial: number, round: number): number {
  const driftToward4 = (4 - initial) * (round / 3) * 0.4;
  const noise = (Math.random() - 0.5) * 0.8;
  const target = initial + driftToward4 + noise;
  return Math.max(1, Math.min(7, Math.round(target)));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Service-role client — used for cross-user reads/dispatching. Cached per process. */
let _admin: SupabaseClient | null = null;
export function getAdminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _admin;
}

/**
 * Sign in as a bot. Each call creates a fresh authed client — Vercel function
 * containers may be reused but Supabase sessions aren't safe to share between
 * invocations.
 */
export async function signInAsBot(
  botName: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: `bot-${botName.toLowerCase()}@commonground.dev`,
    password: requireEnv("BOT_PASSWORD"),
  });
  if (error) throw new Error(`signin ${botName}: ${error.message}`);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error(`signin ${botName}: no user`);
  return { client, userId: user.id };
}

let _botIds: { ids: Set<string>; byName: Map<string, BotName> } | null = null;

/** Cached lookup of bot user IDs. Used to filter out bot-to-bot loops. */
export async function getBotIds(
  admin: SupabaseClient,
): Promise<{ ids: Set<string>; byName: Map<string, BotName> }> {
  if (_botIds) return _botIds;
  const { data, error } = await admin
    .from("profiles")
    .select("id, username")
    .in("username", BOT_NAMES as unknown as string[]);
  if (error) throw error;
  const ids = new Set<string>();
  const byName = new Map<string, BotName>();
  for (const row of data ?? []) {
    if (row.username && BOT_NAMES.includes(row.username as BotName)) {
      ids.add(row.id);
      byName.set(row.id, row.username as BotName);
    }
  }
  _botIds = { ids, byName };
  return _botIds;
}

export async function getMessageCount(
  admin: SupabaseClient,
  matchId: string,
): Promise<number> {
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);
  return count ?? 0;
}

/** Returns most recent N messages tagged "me" / "them" relative to the bot. */
export async function getRecentMessages(
  admin: SupabaseClient,
  matchId: string,
  botId: string,
  limit = 20,
): Promise<Array<{ role: "me" | "them"; body: string }>> {
  const { data } = await admin
    .from("messages")
    .select("sender_id, body, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return data
    .slice()
    .reverse()
    .map((msg) => ({
      role: (msg.sender_id === botId ? "me" : "them") as "me" | "them",
      body: msg.body as string,
    }));
}

/**
 * Pick a bot that's neither in an active match nor already queued.
 * Returns null if every bot is busy.
 */
export async function pickFreeBot(
  admin: SupabaseClient,
): Promise<{ botName: BotName; botId: string } | null> {
  const { ids, byName } = await getBotIds(admin);

  const busy = new Set<string>();

  const { data: actives } = await admin
    .from("matches")
    .select("user_a, user_b")
    .eq("status", "active");
  for (const m of actives ?? []) {
    if (ids.has(m.user_a)) busy.add(m.user_a);
    if (ids.has(m.user_b)) busy.add(m.user_b);
  }

  const { data: queued } = await admin.from("match_queue").select("user_id");
  for (const q of queued ?? []) {
    if (ids.has(q.user_id)) busy.add(q.user_id);
  }

  const free = [...byName.entries()].filter(([id]) => !busy.has(id));
  if (free.length === 0) return null;
  const [botId, botName] = pick(free);
  return { botId, botName };
}
