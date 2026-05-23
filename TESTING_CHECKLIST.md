# CommonGround — Pre-Deploy Testing Guide

A step-by-step walkthrough you can follow top-to-bottom before shipping. Every step has the command to run and what you should see.

Plan to spend ~30–45 minutes. You'll need:

- 1 desktop browser (Chrome / Firefox / Safari).
- 1 second browser window (incognito works) for cross-user tests.
- Access to the Supabase SQL Editor for the dev project.
- Terminal with the repo at `/Users/andresha/Repositories/common-ground` (or wherever you have it).

---

## Phase 0 · Environment setup

### Step 0.1 — Confirm all migrations are applied

In the Supabase SQL Editor, run:

```sql
select pg_get_functiondef(oid)
  from pg_proc
  where proname in ('toggle_reaction', 'submit_round_vote', 'find_match', 'end_conversation');
```

You should get 4 rows back. Check `toggle_reaction` includes the line `'cannot react to your own message'` (added in migration 00008). If anything is missing, apply migrations `00001`–`00009` in order from `supabase/migrations/`.

Also verify:

```sql
select relreplident from pg_class where relname = 'reactions';
```

Should return `f` (replica identity FULL, set in 00009). If it returns `d` (default), apply 00009.

### Step 0.2 — Open three terminals

In the project directory.

**Terminal A** — Next.js dev server:

```
pnpm dev
```

Wait for `✓ Ready in <Xms>` on port 3000. Leave it running.

**Terminal B** — Bot worker:

```
pnpm bot:dev
```

You should see:

```
[Alex   ] tracking N active match(es)
[Alex   ] listening
[Sam    ] tracking N active match(es)
[Sam    ] listening
... (5 bots total)

[bot-dev] listening: messages + matches via realtime, match_queue via 2000ms poll.
Ctrl+C to stop.
```

If you see "could not sign in", run `pnpm seed:bots` first.

**Terminal C** — for ad-hoc commands during testing (status checks, etc).

### Step 0.3 — Wipe stale chat data

In Terminal C:

```
pnpm reset:chats
```

Type `yes` to confirm. Confirms it deleted matches, messages, reactions, reflections, conversation stance votes, and queue entries. Onboarding picks and user accounts stay.

### Step 0.4 — Verify bot status

In Terminal C:

```
pnpm bot status
```

Expected:

```
--- queue ---
(empty)

--- active matches ---
(none)
```

You're ready to test.

---

## Phase 1 · First-time user — happy path

Open Browser A → `http://localhost:3000`.

### Step 1.1 — Sign in

1. Click **Join now** or **Sign in** in the nav.
2. Enter your test email.
3. Click **Send magic link**.
4. Open the email (Resend should deliver in < 30s) and click the link.

**Expected**: redirects through `/auth/callback?code=...` and lands on `/onboarding`.

### Step 1.2 — Onboarding step 1: pick 3–5 propositions

1. Scroll through the grouped topics.
2. Click 2 propositions — verify **Continue** is disabled and the counter shows `2 / 5 selected · pick at least 3`.
3. Click 3 more — counter goes to `5 / 5 selected`, the remaining unselected chips become 40% opacity (disabled at the limit).
4. Try clicking a 6th — nothing happens.
5. Deselect one (click an already-selected card) — opacity restores on the others.
6. Settle on **4 propositions** with a mix of topics, then click **Continue**.

**Expected**: step 2 view appears with your 4 picks listed.

### Step 1.3 — Onboarding step 2: set stances

1. For each proposition, drag through the 7-point slider. Try the extreme positions (1, 4, 7) to confirm labels make sense.
2. Leave one with **no stance** (don't click the slider) — that's a valid path.
3. Click **Back** — verify step 1 still has your selections highlighted.
4. Click **Continue** again, set whatever stances you want, then **Finish**.

**Expected**: redirects to `/match`.

### Step 1.4 — Match (auto-dispatch test)

1. `/match` shows your 4 propositions, each with its stance label.
2. Click one to select it (highlights black).
3. Click **Find someone**.

**Expected**:
- Browser flips to the "Looking for someone…" pulsing-dot view.
- Terminal B logs:
  ```
  [dispatch] <BotName> → user xxxxxxxx on yyyyyyyy as agree (or disagree)
  ```
- 4–6 seconds later, Browser A auto-navigates to `/chat/<match-id>`.

If it sits on "Looking…" for more than 30 seconds, check Terminal B for errors.

### Step 1.5 — Chat: round 1

1. Chat header should show:
   - Top row: `← Leave`, `<Topic> · Round 1 of 3`, `End conversation`
   - The proposition as the headline
   - "You X · They Y" with proper stance labels
2. The bot should open with a line within ~10 seconds (look for `[Alex] opening` in Terminal B).
3. Type a reply, hit Enter. Your bubble should appear instantly on the right.
4. Bot replies within 4–12 seconds. Terminal B should show:
   ```
   [Alex   ] reply <id> [groq <N>ms]: <reply text>
   ```
   If it says `[fallback]`, your `GROQ_API_KEY` isn't set or the API is down.
5. Send 18 more messages back and forth. Watch the counter climb to `20 / 20`.

**Expected**: the chat input is replaced by the vote panel when you hit 20.

### Step 1.6 — Chat: vote in round 1

1. Vote panel shows the round name ("Opening round complete") and the round prompt.
2. Slide your stance. Optionally type a one-line reflection (max 280 chars — counter visible).
3. Click **Submit vote**.

**Expected**:
- Footer changes to "Your vote is in. Waiting for the other person to finish Round 1…"
- Within ~10 seconds, the bot votes too. Terminal B logs:
  ```
  [Alex   ] round 1 complete on <id> — voting <score>
  ```
- The round advances to 2. Chat input returns. New prompt visible.

### Step 1.7 — Rounds 2 & 3

Repeat the message exchange + vote pattern for rounds 2 (up to message 50) and 3 (up to message 100).

To speed-test instead of typing 60+ messages, in Terminal C:

```
# Send messages as the bot directly (these don't take a delay)
pnpm bot say <BotName> <match-id> "another point"

# When the round threshold is hit, vote on it as the bot
pnpm bot vote <BotName> <match-id> 5 "lean agree but warming up"
```

You still need to send YOUR messages from the browser to count toward the 100-message cap.

**Expected after round 3 votes**:

- Footer shows: `Conversation complete. See the results →`.

### Step 1.8 — Results screen

Click **See the results →**.

**Expected** on `/chat/<id>/results`:

1. **Verdict card** — one of `Converged`, `Held ground`, `Diverged`.
2. **Trajectory chart** — two polylines (yours in ink-black, partner's in terracotta), four points each (Before, R1, R2, R3), dashed midline at score 4 (unsure), legend at the bottom.
3. **Before/after cards** — `Started: X (n) · Ended: Y (m) · Net: +/-Δ` per user.
4. **Your private reflections** section (only if you wrote any). Bot's reflections must NOT appear.
5. Bottom: `← Home` and `Find another conversation`.

### Step 1.9 — Profile page

Visit `http://localhost:3000/profile` (or via the nav if signed in).

**Expected**:

1. Header shows your display name (or email prefix) and `Joined Xm/h/d ago`.
2. Stats grid: `Conversations 1 · Completed 1 · Active 0`.
3. **Statements you stand on**: your 4 propositions, the discussed one shows a sparkline (≥ 2 data points: baseline + R3 vote, at minimum); the others should have NO sparkline (only 0 or 1 points).
4. **Recent conversations**: 1 row, status `completed`, relative timestamp. Click it → lands on the results page again.
5. Click **Sign out** → redirects to `/`, session cleared.

---

## Phase 2 · Cross-user security

Open Browser B (incognito).

### Step 2.1 — Sign in as a different user

Use a different email. Complete onboarding with different picks if you want, or any picks.

### Step 2.2 — Try to view User A's conversation

Note User A's match id from Step 1.4. In Browser B, navigate to:

```
http://localhost:3000/chat/<user-a-match-id>
```

**Expected**: Next.js 404 page (`notFound()` from `app/chat/[matchId]/page.tsx` because RLS returned null for the match).

Try the results URL:

```
http://localhost:3000/chat/<user-a-match-id>/results
```

**Expected**: Redirect to `/chat/<id>` which then 404s. (Either way: no User A data shown.)

### Step 2.3 — Verify RLS at the database

Open Browser B's DevTools → Application tab → Cookies → copy your `sb-<ref>-auth-token` value.

Or: in the Supabase Dashboard → Authentication → Users, copy User B's id. Then in the SQL Editor (run as `authenticated` role, NOT `service_role` — there's a role switcher):

```sql
-- These should all return 0 rows when run AS User B:
select count(*) from public.messages where match_id = '<user-a-match-id>';
select count(*) from public.user_propositions where user_id = '<user-a-id>';
select count(*) from public.stance_history where user_id = '<user-a-id>' and match_id is null;
select count(*) from public.reflections where user_id = '<user-a-id>';
```

All four should return `0`. If any return a count > 0, RLS is misconfigured.

### Step 2.4 — Self-reaction database guard

In SQL Editor as authenticated User B, find one of YOUR OWN messages:

```sql
select id from public.messages where sender_id = auth.uid() limit 1;
```

Then try to react to it:

```sql
select public.toggle_reaction('<that-message-id>', 'heart');
```

**Expected**: `ERROR: cannot react to your own message`.

---

## Phase 3 · Reactions UX (desktop + mobile)

Back in Browser A, sign in and `pnpm bot pair YOUR_EMAIL ai-entry-level-jobs disagree agree Sam` (or queue from /match). Land in a chat.

### Step 3.1 — Desktop hover

1. Hover your mouse over a partner (bot) message.
2. Reaction picker (3 small icons) fades in below the bubble.
3. **Verify**: no other messages above or below moved when the picker appeared (no layout shift).
4. Hover over your own message.
5. **Verify**: no picker appears.

### Step 3.2 — Click reactions

1. Hover a bot message → click ❤. Should appear instantly, highlighted terracotta. Terminal B does not show anything (no bot reply triggered; reactions don't fire the reply path).
2. Click ❤ again → toggles off instantly.
3. Click ❤, then click 👎 — should swap.
4. **Verify**: change shows immediately (optimistic) and stays after a refresh.

### Step 3.3 — Realtime cross-side

This is harder to test solo since the bot doesn't react. To force-test, in Terminal C:

```sql
-- (run in SQL Editor)
-- Add a reaction from the bot to one of YOUR messages
insert into public.reactions (message_id, user_id, type, match_id)
values ('<your-message-id>', '<bot-user-id>', 'heart', '<match-id>');
```

**Expected**: within ~1 second, a `❤ 1` badge appears below your bubble in Browser A (read-only, terracotta).

Then delete it:

```sql
delete from public.reactions where message_id = '<your-message-id>' and user_id = '<bot-user-id>';
```

**Expected**: the badge disappears within ~1 second. (This is what migration 00009's REPLICA IDENTITY FULL enables — DELETE events being filterable.)

### Step 3.4 — Mobile long-press (DevTools device mode)

1. Open DevTools (Cmd+Option+I), click the device toolbar icon, pick iPhone SE (375×667).
2. Reload the chat page.
3. Click+hold on a partner message for ~500ms → picker appears.
4. Tap a reaction → it applies, picker dismisses.
5. Click+hold for ~100ms, then release → no picker (too short).
6. Click+hold then scroll → picker is cancelled by the touch-move handler.

---

## Phase 4 · End-conversation flow

In Browser A:

### Step 4.1 — Start a fresh match

Visit `/match`, pick a different proposition, click **Find someone**, get paired.

### Step 4.2 — End it

1. In the chat, click **End conversation** (top right).
2. The button replaces itself with `End now? No · Yes, end it`.
3. Click **No** — reverts.
4. Click **End conversation** again → `Yes, end it`.

**Expected**:
- Footer flips to `Conversation ended.`
- Header `End conversation` button is gone.
- Terminal B logs `match <id> abandoned — dropping`.
- No further bot messages arrive.

### Step 4.3 — Verify the match record

In Terminal C:

```
pnpm bot status
```

**Expected**: that match is no longer in active matches (status went to `abandoned`).

Or in SQL Editor:

```sql
select id, status, ended_at from public.matches order by created_at desc limit 1;
```

Should show `status = abandoned` and `ended_at` set.

### Step 4.4 — Results screen behavior for abandoned matches

In the browser, manually go to `/chat/<that-match-id>/results`.

**Expected**: redirects back to `/chat/<that-match-id>` (which shows the ended-conversation state). The payoff results screen is reserved for `completed` matches only.

---

## Phase 5 · Bot reliability

### Step 5.1 — Groq is working

Trigger a bot reply (send any message). In Terminal B:

```
[Alex   ] reply <id> [groq <N>ms]: <reply text>
```

The `[groq <N>ms]` confirms the LLM call succeeded.

### Step 5.2 — Fallback works when GROQ_API_KEY is missing

1. Stop Terminal B (Ctrl+C).
2. In `.env.local`, **temporarily** comment out or blank `GROQ_API_KEY=`.
3. Restart `pnpm bot:dev`.
4. Send a chat message. Bot replies as before, but Terminal B shows:
   ```
   [Alex   ] reply <id> [fallback]: <a canned line from the pool>
     (no_key)
   ```
5. **Restore** `GROQ_API_KEY` and restart `pnpm bot:dev`.

### Step 5.3 — Bots don't ping-pong each other

In Terminal C:

```
pnpm bot pair YOUR_EMAIL climate-reparations agree disagree Alex
```

Then in another Terminal C invocation pair a second bot with Sam:

```
pnpm bot pair OTHER_EMAIL_THAT_DOES_NOT_EXIST ... 
```

Actually just trigger two bots into the same conversation by manually inserting a match between two bots. (Easier: skip this test — the `allBotIds` filter is well-covered by the code.)

---

## Phase 6 · Analytics events

After Phases 1–4, in the Supabase SQL Editor:

```sql
select name, count(*), max(created_at) as last_seen
  from public.events
  group by name
  order by last_seen desc;
```

**Expected** — these names should all have count ≥ 1:

| name | minimum count |
|---|---|
| `signed_in` | 1 |
| `onboarding_completed` | 1 |
| `match_requested` | 2 (one per match attempt) |
| `match_found` | 2 |
| `message_sent` | many (one per user message you sent) |
| `round_voted` | 3 (rounds 1, 2, 3 from Phase 1) |
| `match_ended` | 1 (from Phase 4) |

For the funnel query, see `TECHNICAL_DOCUMENTATION.md → Analytics`.

---

## Phase 7 · Build sanity

In Terminal C:

```
pnpm lint
```

**Expected**: `Found 6 warnings.` (the known `noNonNullAssertion` warnings on Supabase clients — these don't fail the build). Exit code 0.

```
npx tsc --noEmit
```

**Expected**: no output, exit code 0.

```
pnpm build
```

**Expected**: completes with a route summary. No TypeScript errors. Reasonable bundle sizes.

---

## Phase 8 · Deploy to Vercel

Once Phases 0–7 all pass, you're ready.

### Step 8.1 — Apply all 9 migrations to production Supabase

If your dev Supabase project is separate from production, apply them in order. If you've only been using one Supabase project so far and it IS production, skip — you've already done this throughout dev.

```
00001_initial_schema.sql
00002_match_queue.sql
00003_propositions.sql
00004_tighten_privacy.sql
00005_events.sql
00006_likert_rounds_reactions.sql
00007_end_conversation.sql
00008_no_self_reactions.sql
00009_reactions_realtime_delete.sql
```

### Step 8.2 — Push to GitHub

```
git status
git add -A
git commit -m "Pre-deploy state"
git push origin main
```

### Step 8.3 — Import to Vercel

1. Vercel Dashboard → New Project → import the GitHub repo.
2. Framework preset: Next.js (auto-detected).
3. **Environment variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL           = https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY      = sb_publishable_...
   SUPABASE_SECRET_KEY                = sb_secret_...
   BOT_PASSWORD                       = <your bot password>
   GROQ_API_KEY                       = gsk_...
   BOT_WEBHOOK_SECRET                 = <new strong random string>
   ```
4. **Deploy**. Wait for the green checkmark, copy the production URL.

### Step 8.4 — Update Supabase URL configuration

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://<your-vercel-app>.vercel.app`
- **Redirect URLs**: add the same.

Without this, magic-link sign-in will reject the production URL.

### Step 8.5 — Configure the three webhooks

In Supabase Dashboard → Database → Webhooks. For each, click **Create a new hook**:

| Table | Events | Type | URL | Headers |
|---|---|---|---|---|
| `public.matches` | Insert | HTTP Request | `https://<vercel>/api/bot/match-created` | `Authorization: Bearer <BOT_WEBHOOK_SECRET>` |
| `public.messages` | Insert | HTTP Request | `https://<vercel>/api/bot/message-inserted` | `Authorization: Bearer <BOT_WEBHOOK_SECRET>` |
| `public.match_queue` | Insert | HTTP Request | `https://<vercel>/api/bot/user-queued` | `Authorization: Bearer <BOT_WEBHOOK_SECRET>` |

Save each.

### Step 8.6 — Seed bots on production

Locally (with `.env.local` pointed at production URL + secret key — if you've been using one project, no changes needed):

```
pnpm seed:bots
```

Expected: 5 bots created (or "exists" if already there).

### Step 8.7 — Smoke test the live URL

1. Open the production URL in a fresh browser / incognito.
2. Sign in with a new email.
3. Onboarding → pick 3, set stances, finish.
4. `/match` → pick a proposition → **Find someone**.
5. Within ~6 seconds, bot dispatches and you're paired.

**Expected**: same experience as local.

### Step 8.8 — Confirm webhooks are firing

In Vercel Dashboard → your project → Functions → Logs. Filter to `/api/bot/`. After the smoke test, you should see invocations of:

- `/api/bot/user-queued` (when you clicked Find someone)
- `/api/bot/match-created` (when the bot dispatched and find_match created the row)
- `/api/bot/message-inserted` (for every message in the chat)

If any of these don't appear, the corresponding webhook in Supabase is misconfigured (check the URL and the `Authorization` header).

### Step 8.9 — Verify analytics flowing in production

In the production Supabase SQL Editor:

```sql
select name, count(*), max(created_at) as last_seen
  from public.events
  where created_at > now() - interval '10 minutes'
  group by name;
```

Should match the events list from Phase 6 for your smoke test.

---

## Troubleshooting

**Bot never replies.** Check Terminal B logs. If you see `[fallback]` repeatedly, your `GROQ_API_KEY` is missing or invalid. If you see nothing, the realtime subscription isn't getting the message — check that `messages` is in `supabase_realtime` publication (migration 00001).

**Magic link redirects to `/sign-in?error=auth`.** Either the link was already used (request a new one) or the auth callback path isn't matching. Verify your Supabase URL configuration includes `http://localhost:3000` (dev) or your Vercel URL (prod).

**Vote panel never appears.** You haven't hit 20/50/100 messages. Either send more, or use `pnpm bot say` to top off the count.

**Bot voted but round didn't advance.** Both users need to vote. Check `pnpm bot status` — if the match is still `active` and `current_round` is what you expected, you (the human) haven't voted yet.

**Webhook 401 errors in Vercel logs.** The `BOT_WEBHOOK_SECRET` in Vercel doesn't match the `Authorization: Bearer ...` header in the Supabase webhook configuration. Fix one or the other.

**Production `pnpm seed:bots` says "could not sign in".** Either the bots don't exist yet (re-run) or the password in `.env.local` doesn't match what was used to create them. To reset, delete the bot users from Supabase Dashboard → Authentication → Users and re-run the seeder.

---

## Done

If every phase passed, you're ready to ship. The product flow is functionally complete end-to-end, the bot infrastructure runs as serverless functions in production, analytics are flowing, and security boundaries are verified.
