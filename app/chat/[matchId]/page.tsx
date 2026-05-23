import { notFound, redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

export default async function ChatPage({ params }: PageProps) {
  const { matchId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/chat/${matchId}`);

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, user_a, user_b, score_a, score_b, status, current_round, proposition:proposition_id(id, text, slug, topic:topic_id(name))",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match?.proposition) notFound();

  const proposition = match.proposition as unknown as {
    id: string;
    text: string;
    slug: string;
    topic: { name: string } | null;
  };

  const isUserA = match.user_a === user.id;
  const myScore = isUserA ? match.score_a : match.score_b;
  const partnerScore = isUserA ? match.score_b : match.score_a;
  const partnerId = isUserA ? match.user_b : match.user_a;

  // Messages with their reactions in one round-trip.
  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, match_id, sender_id, body, created_at, reactions(id, user_id, type)",
    )
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(200);

  // Round-vote state — the relaxed stance_history RLS lets us see partner's
  // votes for this match too.
  const { data: votes } = await supabase
    .from("stance_history")
    .select("user_id, round, score")
    .eq("match_id", matchId);

  const myRoundVotes = (votes ?? [])
    .filter((v) => v.user_id === user.id && v.round != null)
    .map((v) => ({ round: v.round as number, score: v.score as number }));
  const partnerRoundVotes = (votes ?? [])
    .filter((v) => v.user_id === partnerId && v.round != null)
    .map((v) => ({ round: v.round as number, score: v.score as number }));

  return (
    <ChatRoom
      matchId={match.id}
      meId={user.id}
      partnerId={partnerId}
      topicName={proposition.topic?.name ?? null}
      propositionText={proposition.text}
      myScore={myScore}
      partnerScore={partnerScore}
      initialMessages={messages ?? []}
      initialCurrentRound={match.current_round}
      initialMyRoundVotes={myRoundVotes}
      initialPartnerRoundVotes={partnerRoundVotes}
      initialMatchStatus={match.status}
    />
  );
}
