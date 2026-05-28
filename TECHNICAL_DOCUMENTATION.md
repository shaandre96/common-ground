# CommonGround — Technical Documentation

A web app that matches strangers worldwide to discuss a single debatable proposition, with an agree/disagree mechanic. Built as a portfolio piece to demonstrate full-stack engineering, realtime systems, and product thinking.

This document covers the architecture, key technical decisions, and how a request flows end-to-end. It evolves with the codebase — when a decision changes, edit it here.

---

## Tech Stack

| Layer        | Choice                              | Why                                                                        |
| ------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router)             | Server components + server actions + middleware + Vercel deploy            |
| UI           | React 19, Tailwind CSS v4           | Tailwind v4 enables `@theme inline` design tokens; React 19 brings async params |
| Auth         | Supabase Auth (magic link + Google) | Frictionless email-only sign-in; no password storage                       |
| Database     | Supabase Postgres                   | Relational fit for users / propositions / matches / messages               |
| Realtime     | Supabase Realtime                   | Postgres logical replication → WebSocket push, RLS-aware out of the box    |
| Hosting      | Vercel (planned)                    | Native Next.js integration                                                 |
| Linting      | Biome 2                             | Single tool for format + lint + import sort; faster than ESLint + Prettier |
| Email (dev)  | Resend (custom SMTP)                | Supabase's built-in email caps at ~2/hour; Resend free tier is 100/day     |

---

## Project Structure

```
common-ground/
├── app/                          Next.js App Router
│   ├── page.tsx                  Landing page
│   ├── layout.tsx                Root layout (fonts, body bg)
│   ├── globals.css               Design tokens + Tailwind layer
│   ├── sign-in/                  Magic-link + Google OAuth UI
│   ├── auth/callback/            PKCE code → session exchange
│   ├── onboarding/               Pick 3–5 propositions + stances
│   ├── match/                    Server actions for matchmaking
│   └── chat/[matchId]/           Per-match chat room (server + actions)
├── components/
│   ├── chat-room.tsx             Client: realtime subscription, optimistic UI
│   ├── onboarding-flow.tsx       Client: two-step proposition picker
│   ├── nav.tsx, hero.tsx, ...    Landing-page sections (v0-generated)
│   └── ui/                       shadcn primitives (vendored)
├── lib/supabase/
│   ├── client.ts                 Browser Supabase client
│   ├── server.ts                 Server Supabase client (cookies)
│   └── middleware.ts             Session refresh + protected-route gate
├── proxy.ts                      Next 16 proxy file (was middleware.ts)
├── scripts/
│   ├── seed-bots.ts              Create 5 bot auth users + propositions
│   └── bot.ts                    CLI for queue / pair / say / leave / status
├── supabase/migrations/
│   ├── 00001_initial_schema.sql  Profiles, topics, matches, messages, RLS, realtime
│   ├── 00002_match_queue.sql     Queue table + atomic find_match RPC
│   └── 00003_propositions.sql    Topic-level → proposition-level stance
├── biome.json                    Linter config (with overrides for shadcn UI)
└── .env.local                    Supabase URL + publishable key + bot secrets
```

---

## Key Technical Decisions

1. **Server actions over REST endpoints.** Onboarding submission, message sending, and matchmaking all use `"use server"` actions. Less boilerplate than route handlers, type-safe across the boundary, and they integrate with `redirect()` cleanly.
2. **PKCE magic-link flow.** Sign-in sends an OTP email with `emailRedirectTo: /auth/callback`. The callback exchanges the `?code=` param for a session via `supabase.auth.exchangeCodeForSession`. The (unused) `/auth/confirm` route for the OTP `token_hash` flow was deleted to avoid confusion.
3. **Atomic matchmaking in Postgres, not in the app.** `find_match` is a `SECURITY DEFINER` plpgsql function using `FOR UPDATE SKIP LOCKED`. It handles race conditions where two callers would otherwise claim the same waiting partner, and it's the only path that can `INSERT` into `matches` (no client INSERT policy = secure by default). It's also re-entrant: if the caller is already in an active match, it returns that match id instead of creating a new one.
4. **Propositions, not topics, as the unit of stance.** Topics ("AI & Jobs") are categories; propositions ("AI replacing entry-level jobs is a net negative for society.") are debatable claims. Agree/disagree only makes sense at the proposition level. The schema reflects this from migration 00003 onward.
9. **7-point Likert stance, gamified across 3 rounds.** Stance is `score smallint (1–7)` — 1 strongly disagree, 4 unsure, 7 strongly agree — alongside a derived `stance` enum for the coarse label. Conversations split into three rounds gated by cumulative message thresholds (20 / 50 / 100). Each round has a curated prompt (deterministic per match) and ends with both users voting on a slider — the same slider component used in onboarding. Round advances are atomic in `submit_round_vote()` (SECURITY DEFINER); the matches table has no client UPDATE policy, so only the function can advance `current_round`. The conversation completes after round 3's pair of votes.
10. **Reactions repurposed for humanness, stance moved to rounds.** `reactions.type` is `heart` / `thumbs_up` / `thumbs_down` — one per user per message. Stance change is now captured via per-round votes, not per-message reactions. `toggle_reaction()` is a SECURITY DEFINER RPC that adds/changes/removes in one round-trip.
11. **Reflections are sealed.** The `reflections` table holds the optional "what's shifting for you" one-liners. Strictly own-only RLS — kept in a separate table from `stance_history` so we could relax `stance_history` SELECT (to let partners see each other's per-round score votes) without leaking reflection text.
12. **End-conversation is a first-class state, not a navigation event.** The `end_conversation` RPC (migration 00007, SECURITY DEFINER) sets `matches.status = 'abandoned'` and `ended_at = now()`. Realtime UPDATE delivers the new status to the partner's chat-room which renders the "Conversation ended" state, and to the bot worker which drops the match from its tracking set. Distinguished from natural completion (round-3 vote → `'completed'`) so we can measure abandon rate.
13. **Bots are event-driven serverless handlers, not a long-running worker.** Bot logic lives in `lib/bot/handlers.ts` as three stateless functions: `handleMatchCreated`, `handleMessageInserted`, `handleUserQueued`. Each one re-derives its state from the database, sleeps for a human-paced delay (3–8s, parallel with the LLM call), then either replies, votes, or dispatches. They include "is this still relevant?" post-sleep checks so racing events (e.g. user sends three messages quickly) only fire one bot action — the latest one wins.

    Two transport mechanisms drive the same handlers:

    - **Production**: three Supabase database webhooks (configured in the Supabase dashboard) POST to `app/api/bot/match-created`, `/api/bot/message-inserted`, `/api/bot/user-queued`. Each route is ~25 lines, verifies a `BOT_WEBHOOK_SECRET` header, and calls the handler. `maxDuration = 30` to fit Vercel Hobby's 60s function cap with headroom.
    - **Local dev** (`pnpm bot:dev`): one admin-client process subscribes via Supabase Realtime to `messages` and `matches` INSERTs and polls `match_queue` every 2s. Each event invokes the same handler functions. No webhooks, no public URL needed.

    Same business logic in both. The only thing that differs is the trigger.

14. **LLM-generated bot replies via Groq.** `lib/bot/replies.ts` calls Groq's OpenAI-compatible endpoint (`llama-3.3-70b-versatile`) with a system prompt that includes the bot's per-bot personality (Alex contrarian, Sam methodical, Riley curious, Jordan pragmatic, Casey provocative), the proposition under debate, the bot's stance + score, and the last ~20 messages of context. Sub-second latency on Groq's free tier; the existing "thinking" sleep runs in parallel via `Promise.all`, so total delay is `max(sleep, api)`. Fire-and-forget on failure: missing `GROQ_API_KEY`, timeouts (>10s), or non-2xx responses fall back to the canned reply pool inside `replies.ts`. Each `generateReply` returns `{ text, source: "groq" | "fallback", latencyMs, error? }` so we can log AI reliability.
15. **Results screen as the product's payoff moment.** `/chat/[matchId]/results` is the after-the-final-vote view. Server component reads `matches.score_a/b` (baseline at pairing), all `stance_history` rows for both participants (relaxed RLS allows partner-side reads of per-round scores), and the user's own `reflections` (strict own-only RLS — partner can't see them). Builds two `Trajectory` objects (`baseline → r1 → r2 → r3`), renders the dual-line `StanceTrajectory` SVG chart (custom, ~100 lines, no chart library), computes a `Converged` / `Held ground` / `Diverged` verdict from the distance delta, and shows the user's private per-round reflections at the bottom. Redirects to `/chat/[matchId]` if status isn't `'completed'` so the payoff isn't shown for abandoned matches.
5. **RLS-everywhere, no service-key in the app.** Every public table has `enable row level security`. The Next.js server only ever uses the publishable (anon) key — the service/secret key lives in `.env.local` and is used only by maintenance scripts (`seed-bots.ts`, `bot.ts`). RLS-bypass paths (like `find_match` inserting into `matches`) are confined to specific `SECURITY DEFINER` functions.
6. **Optimistic UI for sending; dedupe on receive.** Sent messages render immediately with a temp UUID. The server action returns the real row, the client replaces the temp by id. Realtime also delivers the same row to the sender — the receive handler dedupes by id so it's idempotent regardless of which arrives first.
7. **Bots as first-class fixtures.** Five seeded auth users (Alex, Sam, Riley, Jordan, Casey) live in the dev DB. A CLI (`pnpm bot queue|pair|say|leave|status`) drives them, which lets one developer test matchmaking and chat end-to-end without two browsers. The bots' `user_propositions` are seeded so every (proposition, stance) combo has a partner.
8. **Biome with scoped overrides.** Biome 2 handles formatting, linting, and import sorting in a single pass. The `components/ui/**` directory has a small `overrides` block that disables a handful of a11y rules that fire spuriously on shadcn primitives (`useFocusableInteractive`, `useSemanticElements`, etc.) — the files are still formatted and linted for everything else.

---

## End-to-End Request Lifecycles

### Sign in (magic link)

```
User types email in /sign-in
   └─> supabase.auth.signInWithOtp({ email, emailRedirectTo: /auth/callback })
       └─> Resend SMTP sends an email with a ?code= URL
           └─> User clicks link → GET /auth/callback?code=...
               └─> exchangeCodeForSession(code) on the server
                   └─> sets sb-* HttpOnly cookies via @supabase/ssr
                       └─> redirect to /onboarding (or ?next=)
```

The `proxy.ts` middleware runs `getUser()` on every request to refresh the session and gates `/onboarding`, `/match`, `/chat`, `/profile`.

### Onboarding submission

1. Server component `app/onboarding/page.tsx` queries propositions joined to their topic and groups them client-side for display.
2. User picks 3–5 propositions (`<button>` toggles into a `Set`), then sets optional stances.
3. `handleSubmit` calls the `completeOnboarding` server action with `{ propositionId, stance }[]`.
4. Action upserts into `user_propositions`, inserts initial rows into `stance_history` (audit trail), and sets `profiles.onboarded = true`.
5. Action calls `redirect("/")`.

### Finding a match

1. User opens `/match`. The server component checks for an existing active match (re-entrant — jumps straight to `/chat/<id>` if found), then loads the user's selected propositions joined to topic name + saved stance.
2. User picks one proposition and clicks **Find someone**. The client component calls `findMatch(propositionId)`.
3. Server action looks up the caller's stance from `user_propositions` (may be null) and calls the `find_match(p_proposition_id, p_stance)` RPC.
4. Inside the RPC (transaction):
   - If the caller is already in an active match, return its id.
   - `SELECT ... FROM match_queue WHERE proposition_id = $1 AND user_id <> me ORDER BY (stance IS DISTINCT FROM my_stance) DESC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED` — preferred partner.
   - If found: delete both queue rows, `INSERT INTO matches` (bypassing RLS via `SECURITY DEFINER`), return match id.
   - Otherwise: upsert our own queue row, return `NULL`.
5. Action returns `{ status: "matched", matchId }` or `{ status: "waiting" }`.
6. On `matched`, the client navigates to `/chat/<id>`. On `waiting`, the client subscribes to INSERTs on `matches` — RLS filters payloads to matches the user participates in, so any insert that arrives **is** their match. The client navigates as soon as the row lands. `leaveQueue()` is called on Cancel.

### Sending and receiving a message (the realtime path)

```
[Browser A]                              [Postgres + Supabase Realtime]                   [Browser B]
─────────────────────────────────────────────────────────────────────────────────────────────────────
User hits Enter
  └─> add optimistic { id: temp-... }
      to state, render bubble
  └─> server action: sendMessage(matchId, body)
        └─> supabase.from("messages").insert(...)
            (RLS: caller must be user_a or user_b)
              └─> Postgres writes row
                  └─> WAL → supabase_realtime publication
                      └─> Realtime server runs RLS on the row
                          for every connected channel subscriber
                            ├─> A's channel ───────────────────────────────────► row arrives via WS
                            │                                                      └─> dedupe by id
                            │                                                          (already there from optimistic)
                            │                                                          → replaced by real row
                            └─> B's channel ─────────────────────────────────────────► row arrives via WS
                                                                                       └─> append to state
                                                                                           → bubble renders
```

Notes:

- The realtime subscription is created with `filter: match_id=eq.<matchId>` so the server only pushes rows for the active match.
- RLS is enforced on realtime payloads the same way as on `SELECT` queries. A user who isn't a participant cannot subscribe to that channel's data even if they know the match id.
- The "channel" (`chat:<matchId>`) is a Phoenix channel concept on the Realtime side; the actual transport is one shared WebSocket from each browser, multiplexed by channel name.
- We don't broadcast typing indicators or presence (yet). Those would use Realtime's `broadcast` and `presence` modes — separate APIs from `postgres_changes`.

---

## Database Schema

All tables live in `public`. Every table has RLS enabled.

| Table              | Purpose                                                      | Notable constraints                                                              |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `profiles`         | Mirror of `auth.users` with `username`, `onboarded`, etc.    | Auto-created by `handle_new_user` trigger on `auth.users` insert                 |
| `topics`           | Discussion categories ("AI & Jobs", "Climate Policy", ...)   | 15 seeded rows                                                                   |
| `propositions`     | Debatable claims under a topic                               | 3 per topic, 45 total, unique `slug`                                             |
| `user_propositions`| Which propositions a user cares about + their stance         | PK `(user_id, proposition_id)`, stance ∈ {agree, disagree, unsure, NULL}         |
| `matches`          | A live conversation between `user_a` and `user_b`            | Status ∈ {active, completed, abandoned}; no client INSERT policy                 |
| `messages`         | Chat messages within a match                                 | Added to `supabase_realtime` publication                                         |
| `reactions`        | Per-message reaction (heart / thumbs_up / thumbs_down)       | UNIQUE `(message_id, user_id)`; `match_id` denormalized for realtime filter      |
| `match_queue`      | Users waiting for a partner on a single proposition          | PK `user_id` — you can only queue for one proposition at a time                  |
| `stance_history`   | Audit trail of stance changes (linked to a match if conversational) | Has `score smallint (1–7)` and `round smallint (1–3, nullable)`. `match_id` nullable — null = manual/onboarding-time update |
| `reflections`      | Per-round one-liners ("what's shifting for you")             | Strictly private (own-only RLS). UNIQUE `(user_id, match_id, round)`, ≤280 chars |

Migrations are append-only: `00001_initial_schema.sql`, `00002_match_queue.sql`, `00003_propositions.sql`, `00004_tighten_privacy.sql`, `00005_events.sql`, `00006_likert_rounds_reactions.sql`, `00007_end_conversation.sql`. Applied in order via the Supabase SQL Editor.

---

## Authentication & Authorization

- **Sessions** live in HttpOnly cookies set by `@supabase/ssr`. The `lib/supabase/server.ts` helper reconstructs the client on every server request; `lib/supabase/client.ts` is used in client components.
- **Session refresh** happens in `proxy.ts` → `updateSession()` which runs `auth.getUser()` to refresh the token cookies on each request.
- **Protected routes:** middleware enforces sign-in for `/onboarding`, `/match`, `/chat`, `/profile`. Unauthenticated requests get `307 → /sign-in?next=<original>`.
- **RLS examples:**
  - `messages SELECT`: caller must be `user_a` or `user_b` on the join'd match
  - `messages INSERT`: caller must be a participant AND `auth.uid() = sender_id` (no impersonation)
  - `messages UPDATE/DELETE`: no policy → messages are immutable
  - `matches SELECT`: caller must be `user_a` or `user_b`
  - `matches INSERT`: no policy — only `find_match()` (SECURITY DEFINER) can insert
  - `profiles SELECT`: own row only (tightened in 00004 — used to be public; chat is anonymous by design)
  - `user_propositions SELECT`: own rows only (tightened in 00004). Partner stance is read from `matches.stance_a` / `stance_b`, snapshotted at match time, so cross-user reads aren't needed
  - `stance_history SELECT`: own rows only (tightened in 00004). Audit trail is private
  - `user_propositions / match_queue INSERT/UPDATE/DELETE`: caller's `auth.uid()` must equal `user_id`
- **The publishable key** is the only Supabase credential the web app uses. It's safe to expose in the browser; RLS is what guards data. The **secret key** (`sb_secret_...`) is server-only and used by `scripts/seed-bots.ts` and `scripts/bot.ts` for admin operations (creating users, bypassing RLS for fixtures).

---

## Local Development

```bash
pnpm install
pnpm dev                                              # start Next on :3000
pnpm lint                                             # biome check
pnpm lint:fix                                         # biome check --write
pnpm seed:bots                                        # create the 5 bot users + propositions

# Local-dev bot runner. Subscribes to Supabase Realtime events and dispatches
# them through the same handlers the production webhooks use.
pnpm bot:dev      # (alias: pnpm bot:run for muscle memory)

# One-off bot commands (still useful for ad-hoc testing):
pnpm bot queue <prop-slug> [stance] [bot]             # bot joins queue / matches
pnpm bot pair <email> <prop-slug> <my> <bot> [bot]    # hand-pair a bot with the real user
pnpm bot say <bot> <match-id> <message...>            # bot sends a message
pnpm bot vote <bot> <match-id> <score:1-7> [reflection...]  # bot votes the current round
pnpm bot status                                       # show queue + active matches
```

Required env in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
BOT_PASSWORD=<any-string>
GROQ_API_KEY=<optional — bot AI replies; bots fall back to canned pool if unset>
BOT_WEBHOOK_SECRET=<optional locally; required in production. Shared with Supabase webhook config.>
```

## Deploying

Two-step deploy:

1. **Next.js app to Vercel.** Push to GitHub, import in Vercel, paste all env vars (everything above). Add the production URL to Supabase Auth → URL Configuration so magic-link sign-in works.
2. **Wire the three Supabase database webhooks** (Database → Webhooks → New Hook):
    - `INSERT on public.matches`     → `POST https://<vercel-url>/api/bot/match-created`
    - `INSERT on public.messages`    → `POST https://<vercel-url>/api/bot/message-inserted`
    - `INSERT on public.match_queue` → `POST https://<vercel-url>/api/bot/user-queued`
    
    All three carry an `Authorization: Bearer <BOT_WEBHOOK_SECRET>` header, matching the env var on Vercel.

No second hosting platform needed — the bots run as on-demand Vercel functions instead of a persistent worker.

Apply the migrations in the Supabase SQL Editor in numeric order.

---

## Testing

Two layers, both runnable with one command each.

**Unit (`pnpm test`)** — Node's built-in test runner (`node:test`) via tsx, no bundler. Covers the pure-function libs: `lib/stance.ts` (score↔label↔stance mapping) and `lib/prompts.ts` (stage selection, deterministic prompt-per-match hashing, threshold ordering). Fast, no DB, no network. (We deliberately avoided Vitest here — v4's Rolldown and v3's Vite-7 pairing both hit native-binding / ESM-CJS issues on this machine; `node:test` sidesteps all of it.)

**E2E (`pnpm test:e2e`)** — Playwright. `playwright.config.ts` defines a desktop-chromium project plus a mobile (iPhone 14) project that only runs `*.mobile.spec.ts`. The config boots its own dev server with `ENABLE_TEST_AUTH=1`.

- **Auth in tests**: there's no password field in the real UI (magic-link only), so a test-only route `app/api/test/sign-in/route.ts` calls `signInWithPassword` server-side and sets the SSR cookies. It's gated by `NODE_ENV !== "production"` **and** `ENABLE_TEST_AUTH=1`, so it 404s everywhere except the test runner.
- **Test fixtures** (`tests/helpers/`): `admin.ts` (service-role client), `auth.ts` (`ensureTestUser`, `signInAs`), `db.ts` (`resetChats`, `onboardUser`, `queueUserForProposition`, `fillMessages`, `castVoteForPartner`). These let a test set up exact DB state and drive the "partner" side deterministically without the bot worker.
- **Happy-path spec** (`tests/e2e/happy-path.spec.ts`): signs in as User A, onboards both users via admin, queues User B, drives the real `/match` screen, then walks all three rounds (bulk-inserting messages to hit thresholds, voting via the UI, casting the partner's vote via admin), and asserts the results page shows "Converged" + the trajectory chart.

Tests mutate the shared dev Supabase DB and clean up after themselves. For heavier suites, point them at a dedicated test Supabase project. Future specs to add: cross-user security, reactions, end-conversation, and a mobile-viewport pass.

## Design System

Defined as CSS variables in `app/globals.css`, exposed to Tailwind via `@theme inline`.

| Token         | Value     | Usage                                  |
| ------------- | --------- | -------------------------------------- |
| `background`  | `#F5F0E8` | Page background (warm sand)            |
| `card`        | `#EDE6D6` | Card / "them" bubble                   |
| `border`      | `#D9D0BC` | All 1px borders                        |
| `foreground`  | `#1C1A17` | Text, "me" bubble                      |
| `terracotta`  | `#C4622D` | Eyebrows, tags, top accents only       |
| `agree`       | `#2D7D46` | Agree reaction color                   |

Principles: sharp corners (2px radius), 1px borders throughout, no gradients or heavy shadows, no emojis in UI. Fonts: Lora (serif) for headings, DM Sans (sans) for body. Subtle dotted notebook background via a radial-gradient on `<body>`.

---

## Analytics

Two layers, both privacy-aware.

**Traffic** — `@vercel/analytics` is wired in `app/layout.tsx` (production only). Lights up on Vercel deploy: pageviews, top pages, top countries, referrers, devices. Cookieless, GDPR-safe, no PII.

**Product engagement** — self-hosted in Postgres. The `events` table (migration 00005) is write-only from the app via a tiny `track(name, properties)` helper in `lib/analytics.ts`. No client-side SELECT policy — only the service role reads. Funnels and dashboards are built ad-hoc in the Supabase SQL Editor.

Events emitted today:

| Event | Where | Properties |
|---|---|---|
| `signed_in` | `app/auth/callback/route.ts` | none |
| `onboarding_completed` | `app/onboarding/actions.ts` | `prop_count`, `stances_set` |
| `match_requested` | `app/match/actions.ts` | `proposition_id`, `stance` |
| `match_found` | `app/match/actions.ts` | `match_id` |
| `message_sent` | `app/chat/[matchId]/actions.ts` | `match_id`, `length` |

`track()` is fire-and-forget: insert failures are logged but never thrown, so analytics outages never surface as user-facing errors. All calls happen server-side (server actions or route handlers) — no client tracking script, no third-party requests, no need to bother the user with a cookie banner.

Example funnel query (run as service role in the SQL Editor):

```sql
with f as (
  select
    user_id,
    bool_or(name = 'signed_in')             as signed_in,
    bool_or(name = 'onboarding_completed')  as onboarded,
    bool_or(name = 'match_requested')       as requested,
    bool_or(name = 'match_found')           as matched,
    bool_or(name = 'message_sent')          as messaged
  from public.events
  where user_id is not null
  group by user_id
)
select
  count(*) filter (where signed_in) as signed_in,
  count(*) filter (where onboarded) as onboarded,
  count(*) filter (where requested) as requested,
  count(*) filter (where matched)   as matched,
  count(*) filter (where messaged)  as messaged
from f;
```

Adding a new event = one `track("name", { ... })` call at the right server-side spot. No client changes.

---

## Roadmap

Tracked in the Notion [Build Tracker](https://www.notion.so/2cf011903cf3477e8563ca39cc4e82dc). Done: landing page, auth, schema, onboarding (Likert), matching logic, matching screen, chat room, realtime, bot fixtures, privacy-tightening migration, analytics events, rounds + per-round voting + reactions + reflections, AI bot replies (Groq), serverless bot architecture (Path C), results screen with stance-trajectory chart, **profile page with cross-conversation stance evolution sparklines**. Open: mobile responsive polish, Vercel deploy, README + case study.
