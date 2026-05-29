# CommonGround

**Get matched with a stranger who disagrees with you, talk through one idea, and see if either of you moved.**

CommonGround pairs two people who hold opposing views on a single debatable proposition — "AI replacing entry-level jobs is a net negative for society," "Cars should be banned from city centers" — and gives them one structured conversation about it. Three rounds, a stance vote after each, and a results screen that shows whether you converged, held your ground, or drifted apart.

It is deliberately **not** a social network: no feed, no followers, no algorithm optimizing for outrage. One topic, two people, then it ends.

> Built as a full-stack portfolio piece to demonstrate realtime systems, security-first data modeling, an LLM-backed serverless agent, and product thinking — not just CRUD.

---

## What this project demonstrates

- **Security-first data modeling.** Row-Level Security on every table; the web app only ever holds Supabase's *publishable* key. Privileged paths (creating a match, advancing a round, reacting) are confined to `SECURITY DEFINER` Postgres functions — there is no client `INSERT`/`UPDATE` policy to abuse.
- **Concurrency handled where it belongs.** Matchmaking is an atomic `find_match` plpgsql function using `FOR UPDATE SKIP LOCKED`, so two people clicking "Find someone" at the same instant can't claim the same partner. Re-entrant by design.
- **Realtime without a bespoke socket server.** Messages, reactions, round advances, and match state stream over Supabase Realtime (Postgres logical replication → WebSocket), and RLS is enforced on the realtime payloads too — you can't subscribe to a match you're not in.
- **An LLM agent that runs serverless.** Five seeded "bot" debate partners are driven by Groq (`llama-3.3-70b-versatile`) with per-bot personalities. The same three stateless handlers run two ways: Supabase database webhooks → Vercel functions in production, or a local realtime listener in dev. Graceful fallback to a canned reply pool when the API is unavailable.
- **A genuine payoff moment.** The results screen reconstructs each participant's stance trajectory (baseline → R1 → R2 → R3) and draws it as a hand-rolled dual-line SVG chart (no charting dependency), with a Converged / Held ground / Diverged verdict.
- **Polished, accessible motion.** A subtle animation layer (the `motion` library) adds an SVG draw-on for the results chart, scroll reveals, stat count-ups, message-enter transitions, and phase crossfades — all gated behind `prefers-reduced-motion`.
- **Tested end-to-end.** Unit tests for the pure logic and a Playwright happy-path that drives a real browser from matching through three rounds of voting to the results verdict.

---

## Tech stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router, Server Components, Server Actions)   |
| UI         | React 19, Tailwind CSS v4, shadcn/ui primitives              |
| Animation  | Motion (Framer Motion's successor), reduced-motion aware     |
| Auth       | Supabase Auth (magic link + Google OAuth)                    |
| Data       | Supabase Postgres with Row-Level Security everywhere         |
| Realtime   | Supabase Realtime (`postgres_changes`)                       |
| AI         | Groq (`llama-3.3-70b-versatile`) for bot replies             |
| Tooling    | Biome (lint + format + import sort), TypeScript, tsx         |
| Tests      | `node:test` (unit) + Playwright (E2E)                        |
| Hosting    | Vercel (bots run as on-demand functions, no separate worker) |

---

## How it works

```
Sign in (magic link)
   └─> Onboarding: pick 3–5 propositions + set 1–7 stances
        └─> Match: choose one proposition → atomic find_match pairs you with an opposing partner
             └─> Chat: 3 rounds gated by message thresholds (20 / 50 / 100), each ending in a stance vote
                  └─> Results: stance-trajectory chart + Converged / Held ground / Diverged verdict
```

Every protected route (`/onboarding`, `/match`, `/chat`, `/profile`) is gated by middleware that refreshes the session on each request.

---

## Running locally

**Prerequisites:** Node 20+, npm, and a Supabase project.

```bash
git clone https://github.com/shaandre96/common-ground.git
cd common-ground
npm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...          # server-only: scripts + tests
BOT_PASSWORD=<any-string>                  # shared password for seeded bots
GROQ_API_KEY=gsk_...                       # optional — bots fall back to canned replies if unset
BOT_WEBHOOK_SECRET=<random-string>         # optional locally, required in production
```

Apply the migrations in `supabase/migrations/` (`00001` → `00009`) in order via the Supabase SQL Editor, then:

```bash
npm run dev          # start Next on http://localhost:3000
npm run seed:bots    # create the 5 bot debate partners
npm run bot:dev      # local bot runner (listens to Realtime, dispatches the bots)
```

Open `http://localhost:3000`. To exercise matchmaking solo, the bot CLI can stand in for a second human:

```bash
npm run bot queue <proposition-slug> [stance] [bot]   # a bot joins the queue
npm run bot status                                    # show queue + active matches
```

---

## Testing

```bash
npm test         # unit: lib/stance + lib/prompts (node:test, no DB, no network)
npm run test:e2e # Playwright: sign in → onboard → match → 3 rounds → results verdict
```

The E2E suite starts its own dev server with `ENABLE_TEST_AUTH=1` (a test-only sign-in route that 404s outside the test runner) and drives a real Chromium browser. It mutates the dev database and cleans up after itself. Full manual checklist in [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md).

---

## Documentation

- **[`TECHNICAL_DOCUMENTATION.md`](./TECHNICAL_DOCUMENTATION.md)** — architecture, key decisions, request lifecycles, schema, RLS policies, analytics, deploy.
- **[`USER_GUIDE.md`](./USER_GUIDE.md)** — the product from a user's perspective.
- **[`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md)** — pre-deploy walkthrough.

---

## Status

Functionally complete end-to-end: auth, onboarding, matchmaking, realtime chat, three-round voting, AI bot partners, results screen, profile, analytics, and an animation pass across every page. Remaining: mobile-responsive polish, Vercel production deploy, and a written case study.
