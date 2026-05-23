-- CommonGround: Match queue + matching function
-- Run in Supabase SQL Editor (or via supabase db push) AFTER 00001_initial_schema.sql

-- =============================================================================
-- 1. MATCH_QUEUE — users waiting for a partner on a single topic
-- =============================================================================
create table public.match_queue (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  stance      text check (stance in ('agree', 'disagree', 'unsure')),
  created_at  timestamptz not null default now()
);

comment on table public.match_queue is 'Users currently looking for a match. One row per user — you queue for one topic at a time.';

create index idx_match_queue_topic on public.match_queue(topic_id, created_at);

alter table public.match_queue enable row level security;

create policy "Users can view their own queue entry"
  on public.match_queue for select
  using (auth.uid() = user_id);

create policy "Users can insert their own queue entry"
  on public.match_queue for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own queue entry"
  on public.match_queue for delete
  using (auth.uid() = user_id);

-- Note: no UPDATE policy. find_match handles re-queueing via upsert with
-- SECURITY DEFINER. No INSERT policy on `matches` either (kept from 00001) —
-- only find_match can create matches, which keeps the flow atomic.

-- =============================================================================
-- 2. find_match — atomic "match me or queue me" RPC
-- =============================================================================
-- Returns the match id if a partner was found (or one already exists), or NULL
-- if the caller is now waiting in the queue. Idempotent on re-entry.
create or replace function public.find_match(p_topic_id uuid, p_stance text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me              uuid := auth.uid();
  v_partner_id      uuid;
  v_partner_stance  text;
  v_match_id        uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if p_stance is not null and p_stance not in ('agree', 'disagree', 'unsure') then
    raise exception 'invalid stance';
  end if;

  -- If the caller already has an active match, return that instead of
  -- creating a new one. Prevents accidental double-matching.
  select id
    into v_match_id
    from public.matches
    where status = 'active'
      and (user_a = v_me or user_b = v_me)
    order by created_at desc
    limit 1;

  if v_match_id is not null then
    return v_match_id;
  end if;

  -- Look for a waiting partner on the same topic. Prefer a different stance
  -- (the whole point of CommonGround), FIFO by join time. Lock the row so
  -- concurrent callers can't both claim the same partner.
  select user_id, stance
    into v_partner_id, v_partner_stance
    from public.match_queue
    where topic_id = p_topic_id
      and user_id <> v_me
    order by (stance is distinct from p_stance) desc, created_at asc
    limit 1
    for update skip locked;

  if v_partner_id is not null then
    -- Pair found: remove both from the queue and create the match.
    delete from public.match_queue where user_id in (v_me, v_partner_id);

    insert into public.matches (topic_id, user_a, user_b, stance_a, stance_b)
    values (p_topic_id, v_partner_id, v_me, v_partner_stance, p_stance)
    returning id into v_match_id;

    return v_match_id;
  end if;

  -- No partner — upsert our queue entry and return null (= waiting).
  insert into public.match_queue (user_id, topic_id, stance)
  values (v_me, p_topic_id, p_stance)
  on conflict (user_id) do update
    set topic_id   = excluded.topic_id,
        stance     = excluded.stance,
        created_at = now();

  return null;
end;
$$;

revoke all on function public.find_match(uuid, text) from public;
grant execute on function public.find_match(uuid, text) to authenticated;

-- =============================================================================
-- 3. REALTIME — enable for matches so the waiting client sees the row appear
-- =============================================================================
alter publication supabase_realtime add table public.matches;
