import Link from "next/link";
import { redirect } from "next/navigation";
import { MatchFlow } from "@/components/match-flow";
import { createClient } from "@/lib/supabase/server";

export default async function MatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/match");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded) redirect("/onboarding");

  // Re-entrant: if you already have an active match, jump straight to chat.
  // Mirrors find_match's behavior, but avoids the UI showing a pick state.
  const { data: existing } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "active")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .maybeSingle();
  if (existing) redirect(`/chat/${existing.id}`);

  const { data: rows } = await supabase
    .from("user_propositions")
    .select(
      "proposition_id, stance, propositions:proposition_id(text, slug, topic:topic_id(name))",
    )
    .eq("user_id", user.id);

  type RawRow = {
    proposition_id: string;
    stance: "agree" | "disagree" | "unsure" | null;
    propositions: {
      text: string;
      slug: string;
      topic: { name: string } | null;
    } | null;
  };

  const picks = (rows ?? [])
    .map((r) => {
      const row = r as unknown as RawRow;
      return {
        propositionId: row.proposition_id,
        stance: row.stance,
        text: row.propositions?.text ?? "",
        slug: row.propositions?.slug ?? "",
        topicName: row.propositions?.topic?.name ?? null,
      };
    })
    .filter((p) => p.text);

  if (picks.length === 0) redirect("/onboarding");

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-12">
        Common<span className="text-terracotta">·</span>Ground
      </Link>
      <MatchFlow meId={user.id} picks={picks} />
    </div>
  );
}
