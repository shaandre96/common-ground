/**
 * Conversation prompts, organized into three rounds.
 *
 * Each round is gated by a cumulative message threshold:
 *  - Round 1 (Opening):     0 –  20 messages
 *  - Round 2 (Deepening):  21 –  50 messages
 *  - Round 3 (Closing):    51 – 100 messages
 *
 * When the threshold is reached, sending is blocked until both users have
 * voted on their stance for the round, then `matches.current_round` advances.
 *
 * Prompts within a stage are curated, two-sided, and intentionally bland in
 * direction — they nudge toward depth, not toward a particular view. The
 * prompt is picked deterministically from the match id so both participants
 * see the same prompt within a round.
 */

export type Stage = {
  id: 1 | 2 | 3;
  name: "Opening" | "Deepening" | "Closing";
  /** Cumulative message count at which this round ends. */
  endAtMessages: number;
  prompts: string[];
};

export const STAGES: Stage[] = [
  {
    id: 1,
    name: "Opening",
    endAtMessages: 20,
    prompts: [
      "Start by saying why you hold this position.",
      "Define the key term in the statement before you argue.",
      "What experience or moment shaped your view on this?",
      "Steel-man the opposite of your own view before defending yours.",
    ],
  },
  {
    id: 2,
    name: "Deepening",
    endAtMessages: 50,
    prompts: [
      "What evidence would change your mind?",
      "What's the strongest argument against your position?",
      "Find one thing you agree on, however small.",
      "What's a real-world case that tests your view?",
    ],
  },
  {
    id: 3,
    name: "Closing",
    endAtMessages: 100,
    prompts: [
      "Find the strongest version of their argument and respond to it.",
      "If you had to update your view based on this conversation, how would it shift?",
      "What's one thing you'll keep thinking about after this?",
      "End with the question you wish they'd asked.",
    ],
  },
];

export function stageById(id: number): Stage {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

/**
 * Deterministic prompt selection per match per stage. Both participants see
 * the same prompt without any extra sync.
 */
export function promptFor(stage: Stage, matchId: string): string {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) >>> 0;
  }
  return stage.prompts[hash % stage.prompts.length];
}

/**
 * Cap on cumulative messages for any conversation.
 */
export const MAX_MESSAGES = STAGES[STAGES.length - 1].endAtMessages;
