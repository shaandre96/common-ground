/**
 * Generate bot replies via Groq (Llama 3.3 70B Versatile).
 *
 * Used only by the bot worker (scripts/bot-worker.ts). Fire-and-forget on
 * failure — if Groq is down, the key is missing, or the request times out,
 * the caller gets a canned reply from the fallback pool. Bots keep talking;
 * they just sound a little less smart.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 10_000;
const MAX_TOKENS = 180;

const FALLBACK_REPLIES = [
  "That's a fair point — but I think you're underestimating the other side.",
  "Hmm. I see what you mean. Where I push back is on the assumption underneath.",
  "Right, but doesn't that actually argue against your position?",
  "What about the case where the opposite outcome is more likely?",
  "I think we agree on the goal, but really disagree on the means.",
  "Define what you mean by that — I'm not sure we're using the same word the same way.",
  "I'm not convinced yet. What evidence would actually move you?",
  "Yeah, I've been wrestling with that too. Let me try to articulate why I still lean my way.",
  "Walk me through how you'd handle the edge cases.",
  "I'd flip that and say it's actually the opposite trend.",
];

const FALLBACK_OPENERS = [
  "Okay, going to dive right in.",
  "I've got thoughts on this. Mind if I start?",
  "Let me lay out where I'm coming from.",
  "Curious where you're at — I'll go first to give you something to push on.",
  "Alright, my opening case:",
];

const PERSONALITIES: Record<string, string> = {
  Alex: "You are Alex: contrarian, willing to defend unpopular positions, enjoys poking holes in confident claims.",
  Sam: "You are Sam: methodical. You demand precise definitions and ask about edge cases before you concede anything.",
  Riley:
    "You are Riley: genuinely curious. You look for common ground first, then sharpen the disagreement from there.",
  Jordan:
    "You are Jordan: pragmatic. You focus on real-world implications, trade-offs, and second-order effects.",
  Casey:
    "You are Casey: provocative. You play devil's advocate and challenge framings that feel too neat.",
};

function stanceLabel(score: number): string {
  if (score <= 1) return "strongly disagree";
  if (score === 2) return "disagree";
  if (score === 3) return "lean disagree";
  if (score === 4) return "are unsure";
  if (score === 5) return "lean agree";
  if (score === 6) return "agree";
  return "strongly agree";
}

export type ReplyContext = {
  botName: string;
  proposition: string;
  score: number;
  recentMessages: Array<{ role: "me" | "them"; body: string }>;
};

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fallback(isOpener: boolean): string {
  return pickRandom(isOpener ? FALLBACK_OPENERS : FALLBACK_REPLIES);
}

function buildMessages(ctx: ReplyContext): Array<{
  role: "system" | "user";
  content: string;
}> {
  const personality =
    PERSONALITIES[ctx.botName] ?? "You are a real person on a debate platform.";

  const system = `You are participating in a structured debate platform called CommonGround.

${personality}

The proposition under discussion: "${ctx.proposition}"
Your stance: you ${stanceLabel(ctx.score)} (score ${ctx.score} on a 1–7 scale, where 1 = strongly disagree and 7 = strongly agree).

Reply guidelines:
- One short message. 1–3 sentences max.
- Conversational and direct. No bullet lists, no headings, no markdown, no emojis.
- Don't preface with your name or "Bot:" — just the reply text.
- Push the conversation forward: ask a follow-up, challenge a framing, offer a concrete example, or steel-man their best point.
- Stay focused on the proposition. Avoid generic platitudes.
- Hold your stance — but if their argument is genuinely strong, you can acknowledge it.`;

  const userParts: string[] = [];
  if (ctx.recentMessages.length === 0) {
    userParts.push(
      "Open the conversation with your view in one or two sentences. Don't ask them to start — make a claim they can push back on.",
    );
  } else {
    userParts.push("Conversation so far:");
    for (const m of ctx.recentMessages) {
      const tag = m.role === "me" ? "You" : "Partner";
      userParts.push(`${tag}: ${m.body}`);
    }
    userParts.push(
      "\nReply to your partner's last message in one short message.",
    );
  }

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

export async function generateReply(ctx: ReplyContext): Promise<{
  text: string;
  source: "groq" | "fallback";
  latencyMs?: number;
  error?: string;
}> {
  const apiKey = process.env.GROQ_API_KEY;
  const isOpener = ctx.recentMessages.length === 0;

  if (!apiKey) {
    return { text: fallback(isOpener), source: "fallback", error: "no_key" };
  }

  const start = Date.now();

  try {
    const messages = buildMessages(ctx);
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.85,
        max_tokens: MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        text: fallback(isOpener),
        source: "fallback",
        error: `groq_${response.status}: ${body.slice(0, 200)}`,
        latencyMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return {
        text: fallback(isOpener),
        source: "fallback",
        error: "groq_empty_response",
        latencyMs: Date.now() - start,
      };
    }

    // Strip occasional model prefixes like `"`, `Alex:` etc.
    const cleaned = text.replace(/^(?:["']|[A-Z][a-z]+:\s*)/, "").trim();

    return {
      text: cleaned || fallback(isOpener),
      source: "groq",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      text: fallback(isOpener),
      source: "fallback",
      error: (err as Error).message,
      latencyMs: Date.now() - start,
    };
  }
}
