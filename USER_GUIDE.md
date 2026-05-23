# CommonGround — User Guide

A guide to what CommonGround is, how to use it, and what to expect.

This document evolves with the product — sections marked _(coming soon)_ describe features that exist in the design but aren't fully built yet.

---

## What is CommonGround?

CommonGround matches you with a stranger who sees a topic differently than you do. You both pick a debatable statement — "AI replacing entry-level jobs is a net negative for society", "Cars should be banned from city centers" — and you have a conversation about it. At the end, you each say whether the conversation changed your mind.

It's deliberately not a social network. There's no feed, no follower count, no algorithm pushing you toward outrage. One conversation, one topic, two people. Then it ends.

---

## Signing in

Go to **`/sign-in`**. Enter your email. We send you a sign-in link.

- Click the link in your inbox. That's it — no password to remember.
- The link signs you in on the device that opened it.
- If you'd rather use a Google account, hit **Continue with Google** instead. _(Google sign-in requires the project's OAuth client to be configured — for self-hosted instances, it falls back to magic link only.)_

If you click the link and land on `/sign-in?error=auth`, the link expired or was already used. Request a new one.

---

## Setting up your account (onboarding)

The first time you sign in, you'll land on the onboarding screen. Two steps.

### Step 1: Pick statements

You'll see 45 statements grouped under 15 topics — categories like _Climate Policy_, _Free Speech_, _Healthcare Systems_. Each topic has three sharp claims.

Pick **3 to 5 statements** you'd want to discuss with someone who disagrees with you. Pick claims you actually have a position on — vague interest won't make for a good conversation.

You can change your selections later. _(Editing selections in your profile — coming soon.)_

### Step 2: Set your stance (optional)

For each statement you picked, drag a position on a **7-point slider** from "Strongly disagree" (1) through "Unsure" (4) to "Strongly agree" (7). The scale captures more nuance than a yes/no — "lean disagree" is a real position too.

This is optional — leave any unset and decide it during the conversation.

Your stance is used to match you with someone who disagrees. The more honest you are here, the more interesting your conversation will be.

Hit **Finish** and you're in.

---

## Finding a conversation

Go to **`/match`**. You'll see the statements you picked during onboarding, each with the position you set. Pick the one you want to debate **right now** and tap **Find someone**.

We'll look for a partner who:

- Cares about the same statement, and
- Holds a different position than yours (or hasn't decided)

If no one's available immediately, you'll see a "Looking for someone who sees it differently…" screen. Keep the tab open. When a partner arrives, you'll both be dropped into the conversation automatically — no refresh, no notification needed.

If you change your mind, tap **Cancel** to leave the queue. You can come back anytime.

You can only be in one match at a time. If you already have an active conversation, visiting `/match` jumps you straight back into it.

---

## The conversation

You and your partner share a single chat room. The statement is pinned at the top, along with both of your positions ("You lean disagree · They strongly agree") and the current round.

A few things to know:

- **You're anonymous.** No names, no profile pictures, no profiles. The only things your partner knows about you are your stance and what you say.
- **Messages stream in real time.** When you send a message, your partner sees it within a fraction of a second.
- **React to messages.** Below each bubble there's a small row of three icons — **heart**, **thumbs up**, **thumbs down**. Tap one to react. Tap again to remove. You can only have one reaction per message; switching is fine.
- **You can end the conversation** at any time using the **End conversation** button in the top-right. We'll ask for a quick confirm before closing it for both of you — the match goes to a private "ended" state and neither side can send more.
- **Leave** (top-left) just navigates you away without ending the conversation. The chat stays active and you can come back to it later by visiting `/chat/<id>` directly or returning through `/match`.

We're not a moderation platform. You can disagree sharply, but stay focused on the statement. Personal attacks are off-topic.

## Rounds — how the conversation is paced

Every conversation has **three rounds**, gated by cumulative message count:

1. **Opening** (messages 1–20) — establish your position. The system shows a prompt like _"Start by saying why you hold this position."_
2. **Deepening** (messages 21–50) — get into the weeds. _"What evidence would change your mind?"_
3. **Closing** (messages 51–100) — wrap up. _"Find the strongest version of their argument and respond to it."_

When a round's message budget is full, sending is paused and a vote panel appears. Both of you slide where you now stand (same 7-point scale as onboarding) and optionally jot a one-line reflection — **your reflection stays private to you**, your partner never sees it. Once both votes are in, the next round opens with a fresh prompt.

After round 3's votes, the conversation is complete. _(The results screen showing how you both moved is the next thing being built.)_

The 100-message cap (50 per person) keeps the conversation tight. If you reach the end of round 3 without voting, the conversation just sits as "active" until you do.

---

## Stance tracking & results

You vote your position three times during a conversation (one per round, on the same 7-point slider you used at onboarding). Plus your baseline from onboarding, that's **four data points per proposition per conversation** — a real measurement of whether and how the conversation moved you.

When a conversation completes (after round 3's votes), the chat room shows a **See the results →** link. The results screen renders both your trajectories side by side as a small line chart, summarizes how each of you moved (`+2`, `-1`, `no change`, etc.), and gives the conversation a verdict:

- **Converged** — you ended closer than you started.
- **Held ground** — neither of you really moved.
- **Diverged** — you ended further apart than you started.

The results screen also shows any **reflections you wrote** during the per-round votes — those stay private to you, your partner never sees them. You can revisit the results page anytime via `/chat/<match-id>/results` as long as the match is yours.

Your full stance history across all conversations is stored. The forthcoming profile page will let you see how your views have evolved over time.

---

## Your profile

Visit **`/profile`** anytime to see your private dashboard.

It shows:

- **Your display name** and when you joined.
- **Stats** across your most recent 20 conversations: total, completed, and currently active.
- **Statements you stand on** — the 3-to-5 propositions you picked at onboarding, with your current position and a tiny sparkline showing how that position has shifted across votes over time.
- **Recent conversations** — quick list with status (`completed` / `abandoned` / `active`). Clicking a completed one opens its results screen; clicking an active one drops you back into the chat.
- **Sign out** at the bottom.

There are no follower counts, no public profile, no comparisons to other users. Everything here is yours alone — your stance history and any private reflections are gated by row-level security to your account only.

---

## Privacy & safety

- Messages are stored so you can scroll back during a conversation, but conversations are private — only you and your partner can read them. Row-Level Security on the database enforces this; even the developers can't query messages without admin credentials.
- Your email is used only to sign you in. It's never shared with conversation partners or shown publicly.
- The propositions you select, your stances, and your stance history are visible **only to you**. Other users cannot enumerate this data.
- We log a small set of usage events (when you sign in, finish onboarding, request a match, send a message) so we can understand product health. The events include your user ID and timestamps but **never message contents**. Event data is self-hosted on the same database — no third-party trackers, no advertising cookies.
- You can delete your account by contacting the maintainer (a self-serve delete is on the roadmap).

---

## Reporting bugs

If something breaks during a conversation, take note of:

- The proposition you were discussing
- Roughly when it happened
- What you expected vs. what you saw

…and open an issue in the GitHub repo. Bug reports with specifics are 10x more useful than "it didn't work."
