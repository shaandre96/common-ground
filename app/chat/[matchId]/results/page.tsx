import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Reveal } from "@/components/reveal";
import { StanceTrajectory } from "@/components/stance-trajectory";
import { scoreLabel } from "@/lib/stance";
import { createClient } from "@/lib/supabase/server";

type Trajectory = {
  baseline: number;
  r1: number;
  r2: number;
  r3: number;
};

type PageProps = { params: Promise<{ matchId: string }> };

type Verdict = "Converged" | "Diverged" | "Held ground";

function verdictFor(you: Trajectory, them: Trajectory): Verdict {
  const distBefore = Math.abs(you.baseline - them.baseline);
  const distAfter = Math.abs(you.r3 - them.r3);
  if (distAfter < distBefore - 0.5) return "Converged";
  if (distAfter > distBefore + 0.5) return "Diverged";
  return "Held ground";
}

function verdictBlurb(v: Verdict): string {
  switch (v) {
    case "Converged":
      return "You moved closer to each other.";
    case "Diverged":
      return "You pulled further apart.";
    case "Held ground":
      return "Neither of you really moved.";
  }
}

function signedDelta(t: Trajectory): string {
  const d = t.r3 - t.baseline;
  if (d === 0) return "no change";
  return d > 0 ? `+${d}` : `${d}`;
}

export default async function ResultsPage({ params }: PageProps) {
  const { matchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/chat/${matchId}/results`);

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, user_a, user_b, score_a, score_b, status, ended_at, proposition:proposition_id(text, topic:topic_id(name))",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match) notFound();

  // Results screen is the "payoff" view for *completed* conversations only —
  // abandoned ones bounce back to chat so users can see the ended state there.
  if (match.status !== "completed") {
    redirect(`/chat/${matchId}`);
  }

  const proposition = match.proposition as unknown as {
    text: string;
    topic: { name: string } | null;
  } | null;
  if (!proposition) notFound();

  const isUserA = match.user_a === user.id;
  const myBaseline = (isUserA ? match.score_a : match.score_b) ?? 4;
  const partnerBaseline = (isUserA ? match.score_b : match.score_a) ?? 4;
  const partnerId = isUserA ? match.user_b : match.user_a;

  // Per-round votes (relaxed RLS lets us see partner's score history here).
  const { data: votes } = await supabase
    .from("stance_history")
    .select("user_id, round, score")
    .eq("match_id", matchId);

  function trajectoryFor(uid: string, baseline: number): Trajectory {
    const rows = (votes ?? []).filter((v) => v.user_id === uid && v.round);
    const get = (r: number) =>
      rows.find((v) => v.round === r)?.score as number | undefined;
    return {
      baseline,
      r1: get(1) ?? baseline,
      r2: get(2) ?? get(1) ?? baseline,
      r3: get(3) ?? get(2) ?? get(1) ?? baseline,
    };
  }

  const you = trajectoryFor(user.id, myBaseline);
  const them = trajectoryFor(partnerId, partnerBaseline);
  const verdict = verdictFor(you, them);

  // Your own reflections — strict own-only RLS, partner never sees these.
  const { data: myReflections } = await supabase
    .from("reflections")
    .select("round, text")
    .eq("match_id", matchId)
    .eq("user_id", user.id)
    .order("round");

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-10">
        Common<span className="text-terracotta">·</span>Ground
      </Link>

      <div className="w-full max-w-2xl flex flex-col gap-10">
        <Reveal>
          <header className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-widest text-terracotta">
              {proposition.topic?.name ?? "Conversation"} · complete
            </span>
            <h1 className="font-serif text-2xl md:text-3xl leading-snug">
              {proposition.text}
            </h1>
          </header>
        </Reveal>

        {/* Verdict card */}
        <Reveal delay={0.08}>
          <section className="border border-border bg-card p-6 flex flex-col gap-2 text-center">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Result
            </span>
            <h2 className="font-serif text-3xl">{verdict}</h2>
            <p className="text-sm text-muted-foreground">
              {verdictBlurb(verdict)}
            </p>
          </section>
        </Reveal>

        {/* Trajectory chart */}
        <Reveal delay={0.16}>
          <section className="flex flex-col gap-4">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
              How your positions moved
            </h3>
            <StanceTrajectory you={you} them={them} />
          </section>
        </Reveal>

        {/* Per-user before/after numbers */}
        <Reveal delay={0.24}>
          <section className="grid grid-cols-2 gap-6">
            <div className="border border-border p-4 flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                You
              </span>
              <p className="text-sm">
                Started:{" "}
                <span className="text-foreground font-medium">
                  {scoreLabel(you.baseline)} ({you.baseline})
                </span>
              </p>
              <p className="text-sm">
                Ended:{" "}
                <span className="text-foreground font-medium">
                  {scoreLabel(you.r3)} ({you.r3})
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Net: {signedDelta(you)}
              </p>
            </div>
            <div className="border border-border p-4 flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-terracotta">
                Them
              </span>
              <p className="text-sm">
                Started:{" "}
                <span className="text-foreground font-medium">
                  {scoreLabel(them.baseline)} ({them.baseline})
                </span>
              </p>
              <p className="text-sm">
                Ended:{" "}
                <span className="text-foreground font-medium">
                  {scoreLabel(them.r3)} ({them.r3})
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Net: {signedDelta(them)}
              </p>
            </div>
          </section>
        </Reveal>

        {/* Your own reflections (partner can't see these) */}
        {myReflections && myReflections.length > 0 && (
          <Reveal delay={0.32}>
            <section className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                Your reflections (private)
              </h3>
              <div className="flex flex-col border border-border rounded-sm divide-y divide-border">
                {myReflections.map((r) => (
                  <div key={r.round} className="p-4 flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Round {r.round}
                    </span>
                    <p className="text-sm leading-relaxed">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* CTA */}
        <Reveal delay={0.4}>
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Home
            </Link>
            <Link
              href="/match"
              className="text-sm bg-foreground text-primary-foreground px-5 py-2.5 rounded-sm font-medium hover:opacity-90 transition-opacity"
            >
              Find another conversation
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
