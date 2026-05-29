import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccount } from "@/components/delete-account";
import { StanceSparkline } from "@/components/stance-sparkline";
import { scoreLabel } from "@/lib/stance";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const RECENT_MATCH_LIMIT = 20;

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/profile");

  const [profileRes, picksRes, historyRes, matchesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, created_at, onboarded")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_propositions")
      .select(
        "score, stance, proposition_id, propositions:proposition_id(text, slug, topic:topic_id(name))",
      )
      .eq("user_id", user.id),
    supabase
      .from("stance_history")
      .select("proposition_id, score, created_at")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("matches")
      .select(
        "id, status, created_at, proposition:proposition_id(text, slug, topic:topic_id(name))",
      )
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(RECENT_MATCH_LIMIT),
  ]);

  const profile = profileRes.data;
  const picks = picksRes.data ?? [];
  const history = historyRes.data ?? [];
  const matches = matchesRes.data ?? [];

  // Build per-proposition evolution arrays from the user's stance history.
  const evolutionMap = new Map<string, number[]>();
  for (const row of history) {
    if (row.score == null) continue;
    const arr = evolutionMap.get(row.proposition_id) ?? [];
    arr.push(row.score as number);
    evolutionMap.set(row.proposition_id, arr);
  }

  const stats = matches.reduce(
    (acc, m) => {
      acc.total++;
      if (m.status === "completed") acc.completed++;
      if (m.status === "abandoned") acc.abandoned++;
      if (m.status === "active") acc.active++;
      return acc;
    },
    { total: 0, completed: 0, abandoned: 0, active: 0 },
  );

  const displayName = profile?.username ?? user.email?.split("@")[0] ?? "you";
  const joinedAt = profile?.created_at ? relativeDate(profile.created_at) : "";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-10">
        Common<span className="text-terracotta">·</span>Ground
      </Link>

      <div className="w-full max-w-2xl flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-terracotta">
            Your profile
          </span>
          <h1 className="font-serif text-3xl md:text-4xl">{displayName}</h1>
          {joinedAt && (
            <p className="text-sm text-muted-foreground">Joined {joinedAt}</p>
          )}
        </header>

        {stats.total > 0 && (
          <section className="grid grid-cols-3 gap-3">
            <div className="border border-border p-4 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Conversations
              </span>
              <span className="font-serif text-2xl">{stats.total}</span>
            </div>
            <div className="border border-border p-4 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Completed
              </span>
              <span className="font-serif text-2xl">{stats.completed}</span>
            </div>
            <div className="border border-border p-4 flex flex-col gap-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Active
              </span>
              <span className="font-serif text-2xl">{stats.active}</span>
            </div>
          </section>
        )}

        {picks.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Statements you stand on
            </h2>
            <div className="flex flex-col border border-border rounded-sm divide-y divide-border">
              {picks.map((p) => {
                const prop = p.propositions as unknown as {
                  text: string;
                  slug: string;
                  topic: { name: string } | null;
                } | null;
                if (!prop) return null;
                const evolution = evolutionMap.get(p.proposition_id) ?? [];
                return (
                  <div
                    key={p.proposition_id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex flex-col gap-1 sm:flex-1 sm:min-w-0">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {prop.topic?.name ?? "Topic"} · you{" "}
                        {scoreLabel(p.score)}
                      </span>
                      <p className="text-sm leading-relaxed">{prop.text}</p>
                    </div>
                    {evolution.length > 1 && (
                      <StanceSparkline points={evolution} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {matches.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              Recent conversations
            </h2>
            <div className="flex flex-col border border-border rounded-sm divide-y divide-border">
              {matches.map((m) => {
                const prop = m.proposition as unknown as {
                  text: string;
                  topic: { name: string } | null;
                } | null;
                if (!prop) return null;
                const href =
                  m.status === "completed"
                    ? `/chat/${m.id}/results`
                    : `/chat/${m.id}`;
                return (
                  <Link
                    key={m.id}
                    href={href}
                    className="flex flex-col gap-1 p-4 hover:bg-sand-dark transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="uppercase tracking-widest text-muted-foreground">
                        {prop.topic?.name ?? "Topic"}
                      </span>
                      <span className="text-muted-foreground">
                        {m.status} · {relativeDate(m.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{prop.text}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="border border-border p-6 text-center text-sm text-muted-foreground">
            No conversations yet.{" "}
            <Link
              href="/match"
              className="underline text-foreground hover:opacity-80"
            >
              Find one →
            </Link>
          </section>
        )}

        <div className="flex flex-col gap-6 border-t border-border pt-6">
          <form action={signOut} className="flex justify-end">
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </form>
          <DeleteAccount />
        </div>
      </div>
    </div>
  );
}
