"use client";

import { Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  endConversation,
  type ReactionType,
  sendMessage,
  submitRoundVote,
  toggleReaction,
} from "@/app/chat/[matchId]/actions";
import { StanceSlider } from "@/components/stance-slider";
import { promptFor, STAGES, stageById } from "@/lib/prompts";
import { scoreLabel } from "@/lib/stance";
import { createClient } from "@/lib/supabase/client";

type Reaction = {
  id: string;
  user_id: string;
  type: ReactionType;
};

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  reactions?: Reaction[];
};

type OptimisticMessage = Message & { pending?: boolean };

type RoundVote = { round: number; score: number };

type Props = {
  matchId: string;
  meId: string;
  partnerId: string;
  topicName: string | null;
  propositionText: string;
  myScore: number | null;
  partnerScore: number | null;
  initialMessages: Message[];
  initialCurrentRound: number;
  initialMyRoundVotes: RoundVote[];
  initialPartnerRoundVotes: RoundVote[];
  initialMatchStatus: string;
};

const REACTION_TYPES: { type: ReactionType; Icon: typeof Heart }[] = [
  { type: "heart", Icon: Heart },
  { type: "thumbs_up", Icon: ThumbsUp },
  { type: "thumbs_down", Icon: ThumbsDown },
];

export function ChatRoom({
  matchId,
  meId,
  partnerId,
  topicName,
  propositionText,
  myScore,
  partnerScore,
  initialMessages,
  initialCurrentRound,
  initialMyRoundVotes,
  initialPartnerRoundVotes,
  initialMatchStatus,
}: Props) {
  const [messages, setMessages] =
    useState<OptimisticMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentRound, setCurrentRound] = useState(initialCurrentRound);
  const [matchStatus, setMatchStatus] = useState(initialMatchStatus);
  const [myVotes, setMyVotes] = useState<RoundVote[]>(initialMyRoundVotes);
  const [partnerVotes, setPartnerVotes] = useState<RoundVote[]>(
    initialPartnerRoundVotes,
  );

  // Vote panel state — when the round is "complete" (msg threshold hit) and
  // we haven't voted yet, we show a slider + reflection input.
  const [voteScore, setVoteScore] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [voteSubmitting, setVoteSubmitting] = useState(false);

  // End-conversation confirm flow.
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  const supabase = useRef(createClient()).current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stage = useMemo(() => stageById(currentRound), [currentRound]);
  const prompt = useMemo(() => promptFor(stage, matchId), [stage, matchId]);
  const messageCount = messages.filter((m) => !m.pending).length;
  const roundComplete = messageCount >= stage.endAtMessages;

  const haveIVotedThisRound = myVotes.some((v) => v.round === currentRound);
  const hasPartnerVotedThisRound = partnerVotes.some(
    (v) => v.round === currentRound,
  );

  // ---- Realtime: messages, reactions, matches updates, stance_history ----
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, { ...incoming, reactions: [] }];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reactions",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => {
              const eventType = payload.eventType;
              const newRow = payload.new as Reaction & { message_id: string };
              const oldRow = payload.old as Reaction & { message_id: string };
              const targetId =
                eventType === "DELETE" ? oldRow.message_id : newRow.message_id;
              if (m.id !== targetId) return m;

              const reactions = m.reactions ?? [];
              if (eventType === "INSERT") {
                if (reactions.some((r) => r.id === newRow.id)) return m;
                // Replace any optimistic-temp row from the same user — one
                // reaction per (user, message) is enforced by the UNIQUE
                // constraint, so this is safe.
                const withoutMyOptimistic = reactions.filter(
                  (r) => r.user_id !== newRow.user_id,
                );
                return { ...m, reactions: [...withoutMyOptimistic, newRow] };
              }
              if (eventType === "UPDATE") {
                // If we recognize the row by id, swap it. Otherwise this is
                // an UPDATE arriving for a reaction we only had optimistically
                // (different temp id) — match by user_id instead.
                const byId = reactions.some((r) => r.id === newRow.id);
                return {
                  ...m,
                  reactions: byId
                    ? reactions.map((r) => (r.id === newRow.id ? newRow : r))
                    : reactions.map((r) =>
                        r.user_id === newRow.user_id ? newRow : r,
                      ),
                };
              }
              if (eventType === "DELETE") {
                // With REPLICA IDENTITY FULL on reactions (migration 00009),
                // oldRow has all columns, so we can match by id reliably.
                return {
                  ...m,
                  reactions: reactions.filter((r) => r.id !== oldRow.id),
                };
              }
              return m;
            }),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const m = payload.new as {
            current_round: number;
            status: string;
          };
          setCurrentRound(m.current_round);
          setMatchStatus(m.status);
          // Reset the vote panel state for the new round.
          setVoteScore(null);
          setReflection("");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stance_history",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as {
            user_id: string;
            round: number;
            score: number;
          };
          const entry = { round: row.round, score: row.score };
          if (row.user_id === meId) {
            setMyVotes((prev) =>
              prev.some((v) => v.round === entry.round)
                ? prev
                : [...prev, entry],
            );
          } else if (row.user_id === partnerId) {
            setPartnerVotes((prev) =>
              prev.some((v) => v.round === entry.round)
                ? prev
                : [...prev, entry],
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, meId, partnerId, supabase]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Focus input on mount and when round advances (unlocking chat).
  useEffect(() => {
    if (!roundComplete && matchStatus === "active") {
      inputRef.current?.focus();
    }
  }, [roundComplete, matchStatus]);

  // ---- Handlers --------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: OptimisticMessage = {
      id: tempId,
      match_id: matchId,
      sender_id: meId,
      body,
      created_at: new Date().toISOString(),
      reactions: [],
      pending: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    const result = await sendMessage(matchId, body);

    if (result.status === "error") {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(result.error);
      // Restore draft only if not a round-complete reject (vote panel will open)
      if (result.reason !== "round_complete") {
        setDraft(body);
      }
    } else {
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === result.message.id)) {
          return withoutTemp;
        }
        return [...withoutTemp, { ...result.message, reactions: [] }];
      });
    }
    setSending(false);
    inputRef.current?.focus();
  }

  async function handleVote() {
    if (voteScore === null || voteSubmitting) return;
    setVoteSubmitting(true);
    setError(null);
    const result = await submitRoundVote(
      matchId,
      voteScore,
      reflection.trim() || undefined,
    );
    if (result.status === "error") {
      setError(result.error);
    }
    // On success, optimistic local state isn't needed — the stance_history
    // realtime listener will populate myVotes and the matches UPDATE
    // listener will advance currentRound when both have voted.
    setVoteSubmitting(false);
  }

  async function handleReact(messageId: string, type: ReactionType) {
    // Optimistic: update local state immediately so the click feels instant.
    // The realtime listener will reconcile (replace temp id with the
    // canonical row, or no-op if our optimistic already matches).
    let snapshot: OptimisticMessage[] | null = null;

    setMessages((prev) => {
      snapshot = prev;
      return prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions ?? [];
        const mine = reactions.find((r) => r.user_id === meId);

        // Same reaction clicked → toggle off.
        if (mine && mine.type === type) {
          return { ...m, reactions: reactions.filter((r) => r !== mine) };
        }
        // Different reaction → change type in place.
        if (mine) {
          return {
            ...m,
            reactions: reactions.map((r) => (r === mine ? { ...r, type } : r)),
          };
        }
        // No existing reaction → add a temp one.
        const tempReaction: Reaction = {
          id: `temp-${crypto.randomUUID()}`,
          user_id: meId,
          type,
        };
        return { ...m, reactions: [...reactions, tempReaction] };
      });
    });

    const result = await toggleReaction(messageId, type);
    if (result.status === "error") {
      // Revert.
      if (snapshot) setMessages(snapshot);
      setError(result.error);
    }
  }

  async function handleEnd() {
    if (ending) return;
    setEnding(true);
    setError(null);
    const result = await endConversation(matchId);
    if (result.status === "error") {
      setError(result.error);
      setEnding(false);
      setConfirmingEnd(false);
    }
    // On success, the matches UPDATE realtime listener flips matchStatus
    // to 'abandoned' and the abandoned footer renders.
  }

  // ---- Render ---------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-2xl px-6 py-5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Leave
            </Link>
            {matchStatus === "active" &&
              (confirmingEnd ? (
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">End now?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingEnd(false)}
                    disabled={ending}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={handleEnd}
                    disabled={ending}
                    className="text-terracotta font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
                  >
                    {ending ? "Ending..." : "Yes, end it"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingEnd(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  End conversation
                </button>
              ))}
          </div>
          <span className="text-xs uppercase tracking-widest text-terracotta">
            {topicName ?? "Conversation"} · Round {currentRound} of{" "}
            {STAGES.length}
          </span>
          <h1 className="font-serif text-xl md:text-2xl leading-snug">
            {propositionText}
          </h1>
          <p className="text-sm text-muted-foreground">
            You {scoreLabel(myScore)} · They {scoreLabel(partnerScore)}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-6 flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No one's said anything yet. Open with something honest.
            </p>
          )}
          {messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              meId={meId}
              onReact={handleReact}
            />
          ))}
        </div>
      </div>

      {/* Footer: vote panel, input, or "complete" depending on state */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-2xl px-6 py-4 flex flex-col gap-3">
          {matchStatus === "abandoned" ? (
            <div className="text-center py-3 text-sm text-muted-foreground">
              Conversation ended.
            </div>
          ) : matchStatus === "completed" ? (
            <div className="flex items-center justify-center gap-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Conversation complete.
              </span>
              <Link
                href={`/chat/${matchId}/results`}
                className="text-foreground font-medium border-b border-foreground hover:opacity-80 transition-opacity"
              >
                See the results →
              </Link>
            </div>
          ) : roundComplete && !haveIVotedThisRound ? (
            <VotePanel
              roundName={stage.name}
              prompt={prompt}
              score={voteScore}
              onScoreChange={setVoteScore}
              reflection={reflection}
              onReflectionChange={setReflection}
              submitting={voteSubmitting}
              onSubmit={handleVote}
              partnerVoted={hasPartnerVotedThisRound}
            />
          ) : roundComplete && haveIVotedThisRound ? (
            <div className="text-center py-3 text-sm text-muted-foreground">
              Your vote is in. Waiting for the other person to finish Round{" "}
              {currentRound}…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  <span className="text-terracotta uppercase tracking-widest">
                    Round {currentRound}
                  </span>
                  <span className="ml-2 italic">{prompt}</span>
                </span>
                <span className="text-muted-foreground">
                  {messageCount} / {stage.endAtMessages}
                </span>
              </div>
              {error && <p className="text-xs text-terracotta">{error}</p>}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Say what you mean..."
                  maxLength={2000}
                  disabled={sending}
                  className="flex-1 border border-border bg-background px-4 py-3 rounded-sm text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-terracotta disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || draft.trim().length === 0}
                  className="bg-foreground text-primary-foreground px-5 py-3 rounded-sm text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
const LONG_PRESS_MS = 400;

function MessageRow({
  message,
  meId,
  onReact,
}: {
  message: OptimisticMessage;
  meId: string;
  onReact: (messageId: string, type: ReactionType) => void;
}) {
  const isMe = message.sender_id === meId;
  const base = "px-4 py-3 max-w-[80%] text-sm leading-relaxed border";
  const themBubble = `${base} bg-sand-dark border-border rounded-tr-md rounded-bl-md rounded-br-md`;
  const meBubble = `${base} bg-foreground text-primary-foreground border-foreground rounded-tl-md rounded-bl-md rounded-br-md ${message.pending ? "opacity-70" : ""}`;

  // Long-press only matters on partner messages — there's nothing to react to
  // on your own bubbles. Skipping the touch handlers for self-messages also
  // means a stray hold on your own bubble doesn't pop up an empty UI.
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startTimer() {
    timer.current = setTimeout(() => setPressed(true), LONG_PRESS_MS);
  }
  function cancelTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // Dismiss the touch-revealed bar on the next outside tap.
  useEffect(() => {
    if (!pressed) return;
    const t = setTimeout(
      () =>
        document.addEventListener("click", () => setPressed(false), {
          once: true,
        }),
      0,
    );
    return () => clearTimeout(t);
  }, [pressed]);

  const partnerReactionsOnMine = isMe
    ? (message.reactions ?? []).filter((r) => r.user_id !== meId)
    : [];

  return (
    <div
      className={`group flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}
      onTouchStart={!isMe ? startTimer : undefined}
      onTouchEnd={!isMe ? cancelTimer : undefined}
      onTouchMove={!isMe ? cancelTimer : undefined}
      onTouchCancel={!isMe ? cancelTimer : undefined}
    >
      <div className={isMe ? meBubble : themBubble}>{message.body}</div>

      {/* Partner messages: reserve the picker's vertical strip permanently
          (opacity transition avoids any layout shift on hover/press). */}
      {!message.pending && !isMe && (
        <div className="h-5">
          <div
            className={`transition-opacity ${
              pressed
                ? "opacity-100"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
            }`}
          >
            <ReactionBar
              reactions={message.reactions ?? []}
              meId={meId}
              onReact={(type) => onReact(message.id, type)}
            />
          </div>
        </div>
      )}

      {/* Own messages: no picker (you can't react to yourself), but if your
          partner reacted, show their reactions as small read-only badges. */}
      {!message.pending && isMe && partnerReactionsOnMine.length > 0 && (
        <ReadOnlyReactions reactions={partnerReactionsOnMine} />
      )}
    </div>
  );
}

function ReadOnlyReactions({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="flex gap-1">
      {REACTION_TYPES.map(({ type, Icon }) => {
        const count = reactions.filter((r) => r.type === type).length;
        if (count === 0) return null;
        return (
          <span
            key={type}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-terracotta"
          >
            <Icon className="w-3 h-3" fill="currentColor" strokeWidth={1.5} />
            <span>{count}</span>
          </span>
        );
      })}
    </div>
  );
}

function ReactionBar({
  reactions,
  meId,
  onReact,
}: {
  reactions: Reaction[];
  meId: string;
  onReact: (type: ReactionType) => void;
}) {
  return (
    <div className="flex gap-1">
      {REACTION_TYPES.map(({ type, Icon }) => {
        const count = reactions.filter((r) => r.type === type).length;
        const isMine = reactions.some(
          (r) => r.type === type && r.user_id === meId,
        );
        const cls = isMine
          ? "flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-terracotta transition-colors"
          : "flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors";
        return (
          <button
            key={type}
            type="button"
            onClick={() => onReact(type)}
            className={cls}
            aria-pressed={isMine}
          >
            <Icon
              className="w-3 h-3"
              fill={isMine ? "currentColor" : "none"}
              strokeWidth={1.5}
            />
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function VotePanel({
  roundName,
  prompt,
  score,
  onScoreChange,
  reflection,
  onReflectionChange,
  submitting,
  onSubmit,
  partnerVoted,
}: {
  roundName: string;
  prompt: string;
  score: number | null;
  onScoreChange: (v: number) => void;
  reflection: string;
  onReflectionChange: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  partnerVoted: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="uppercase tracking-widest text-terracotta">
          {roundName} round complete
        </span>
        {partnerVoted && (
          <span className="text-muted-foreground">
            The other person has voted.
          </span>
        )}
      </div>
      <p className="text-sm italic text-muted-foreground">{prompt}</p>
      <p className="text-sm font-medium">Where do you now stand?</p>
      <StanceSlider value={score} onChange={onScoreChange} size="compact" />
      <textarea
        value={reflection}
        onChange={(e) => onReflectionChange(e.target.value)}
        placeholder="Optional: one line on what's shifting for you. (Stays private to you.)"
        maxLength={280}
        rows={2}
        className="border border-border bg-background px-3 py-2 rounded-sm text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-terracotta resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {reflection.length} / 280
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={score === null || submitting}
          className="text-sm bg-foreground text-primary-foreground px-5 py-2 rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {submitting ? "Submitting..." : "Submit vote"}
        </button>
      </div>
    </div>
  );
}
