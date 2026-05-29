"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findMatch, leaveQueue } from "@/app/match/actions";
import { createClient } from "@/lib/supabase/client";

type Stance = "agree" | "disagree" | "unsure" | null;
type Pick = {
  propositionId: string;
  stance: Stance;
  text: string;
  slug: string;
  topicName: string | null;
};

type Phase = "pick" | "waiting" | "error";

type Props = { meId: string; picks: Pick[] };

// Shared editorial easing (gentle ease-out, no overshoot).
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function stanceLabel(stance: Stance): string {
  switch (stance) {
    case "agree":
      return "you agree";
    case "disagree":
      return "you disagree";
    case "unsure":
      return "you're unsure";
    default:
      return "no stance set";
  }
}

export function MatchFlow({ meId, picks }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pick");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const supabase = useRef(createClient()).current;

  // While waiting, subscribe to new matches. RLS filters payloads to matches
  // we participate in, so any INSERT we see *is* our match.
  useEffect(() => {
    if (phase !== "waiting") return;

    const channel = supabase
      .channel("match-waiting")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches" },
        (payload) => {
          const m = payload.new as {
            id: string;
            user_a: string;
            user_b: string;
          };
          if (m.user_a === meId || m.user_b === meId) {
            router.push(`/chat/${m.id}`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, supabase, router, meId]);

  async function handleFind() {
    if (!selectedId) return;
    setError(null);
    setPhase("waiting");

    const result = await findMatch(selectedId);
    if (result.status === "matched") {
      router.push(`/chat/${result.matchId}`);
    } else if (result.status === "error") {
      setError(result.error);
      setPhase("error");
    }
    // "waiting": stay in this phase; the realtime subscription above will
    // navigate when a partner shows up.
  }

  async function handleCancel() {
    await leaveQueue();
    setPhase("pick");
  }

  const selectedPick = picks.find((p) => p.propositionId === selectedId);

  const phaseAnim = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.3, ease: EASE },
      };

  return (
    <div className="w-full max-w-2xl flex flex-col gap-8">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "pick" && (
          <motion.div key="pick" className="flex flex-col gap-8" {...phaseAnim}>
            <div className="flex flex-col gap-3">
              <span className="text-xs uppercase tracking-widest text-terracotta">
                Start a conversation
              </span>
              <h1 className="font-serif text-3xl md:text-4xl">
                What do you want to debate?
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We'll find someone who sees it differently and pair you up.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {picks.map((p) => {
                const isSelected = p.propositionId === selectedId;
                const base =
                  "text-left flex flex-col gap-1 border px-4 py-3 rounded-sm transition-colors";
                const cls = isSelected
                  ? `${base} bg-foreground text-primary-foreground border-foreground`
                  : `${base} border-border hover:bg-sand-dark`;
                return (
                  <motion.button
                    key={p.propositionId}
                    type="button"
                    onClick={() => setSelectedId(p.propositionId)}
                    className={cls}
                    whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                  >
                    <span
                      className={
                        isSelected
                          ? "text-xs uppercase tracking-widest text-primary-foreground/70"
                          : "text-xs uppercase tracking-widest text-muted-foreground"
                      }
                    >
                      {p.topicName ? `${p.topicName} · ` : ""}
                      {stanceLabel(p.stance)}
                    </span>
                    <p className="text-sm leading-relaxed">{p.text}</p>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFind}
                disabled={!selectedId}
                className="text-sm bg-foreground text-primary-foreground px-5 py-3 rounded-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Find someone
              </button>
            </div>
          </motion.div>
        )}

        {phase === "waiting" && selectedPick && (
          <motion.div
            key="waiting"
            className="flex flex-col gap-8"
            {...phaseAnim}
          >
            <div className="flex flex-col gap-4 text-center items-center py-12">
              <span className="text-xs uppercase tracking-widest text-terracotta">
                {selectedPick.topicName ?? "Conversation"}
              </span>
              <h1 className="font-serif text-2xl md:text-3xl max-w-xl leading-snug">
                {selectedPick.text}
              </h1>
              <div className="flex items-center gap-2 mt-8 text-sm text-muted-foreground">
                <motion.span
                  className="w-2 h-2 rounded-full bg-terracotta"
                  animate={
                    reduceMotion
                      ? undefined
                      : { scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }
                  }
                  transition={{
                    duration: 1.6,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                />
                <span>Looking for someone who sees it differently…</span>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleCancel}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div
            key="error"
            className="flex flex-col gap-4 items-center py-12"
            {...phaseAnim}
          >
            <p className="text-sm text-terracotta text-center">
              {error ?? "Something went wrong."}
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhase("pick");
              }}
              className="text-sm border border-border px-4 py-2 rounded-sm hover:bg-sand-dark transition-colors"
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
