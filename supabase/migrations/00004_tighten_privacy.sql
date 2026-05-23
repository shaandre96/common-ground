-- CommonGround: Tighten reads on profile-shaped tables.
--
-- Conversations themselves (matches/messages/reactions) are already
-- participant-only. This migration closes leaks on profile metadata,
-- selected propositions, and stance history — all of which were previously
-- readable by any authenticated user, defeating the anonymous-strangers
-- premise of the product.
--
-- Run in Supabase SQL Editor after 00001/00002/00003.

-- =============================================================================
-- profiles: own row only
-- =============================================================================
drop policy if exists "Profiles are viewable by everyone" on public.profiles;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- =============================================================================
-- user_propositions: own rows only
--
-- Note: a future "matched partner" view does NOT need to query this table —
-- `matches.stance_a` / `stance_b` snapshot the partner's stance at match time,
-- which is what the chat header displays. So own-only is sufficient.
-- =============================================================================
drop policy if exists "User propositions are viewable by everyone"
  on public.user_propositions;

create policy "Users can view their own user_propositions"
  on public.user_propositions for select
  using (auth.uid() = user_id);

-- =============================================================================
-- stance_history: own rows only
-- =============================================================================
drop policy if exists "Stance history is viewable by everyone"
  on public.stance_history;

create policy "Users can view their own stance history"
  on public.stance_history for select
  using (auth.uid() = user_id);
