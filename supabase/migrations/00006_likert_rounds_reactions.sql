-- CommonGround: 7-point Likert stance, round-based conversation, message
-- reactions, and per-round reflections.
--
-- Run in Supabase SQL Editor after 00001-00005.

-- =============================================================================
-- 1. SCORE (7-point Likert) alongside the existing stance enum.
--    1 = strongly disagree, 4 = unsure, 7 = strongly agree.
--    `stance` stays for the coarse label; `score` is canonical going forward.
-- =============================================================================
alter table public.user_propositions
  add column score smallint check (score between 1 and 7);

update public.user_propositions
   set score = case stance
     when 'agree'    then 6
     when 'disagree' then 2
     when 'unsure'   then 4
   end
 where stance is not null;

alter table public.matches
  add column score_a smallint check (score_a between 1 and 7),
  add column score_b smallint check (score_b between 1 and 7);

update public.matches
   set score_a = case stance_a
     when 'agree' then 6 when 'disagree' then 2 when 'unsure' then 4 end,
       score_b = case stance_b
     when 'agree' then 6 when 'disagree' then 2 when 'unsure' then 4 end;

alter table public.stance_history
  add column score smallint check (score between 1 and 7),
  add column round smallint check (round between 1 and 3);

update public.stance_history
   set score = case stance
     when 'agree' then 6 when 'disagree' then 2 when 'unsure' then 4 end;

-- =============================================================================
-- 2. ROUNDS — every conversation has 3 rounds, gated by cumulative message
--    counts (20 / 50 / 100). current_round only advances when both users vote.
-- =============================================================================
alter table public.matches
  add column current_round smallint not null default 1
    check (current_round between 1 and 3);

-- =============================================================================
-- 3. REFLECTIONS — private, per-round, ≤280 chars. Kept in their own table so
--    the partner can never read what you wrote, even with relaxed RLS on
--    stance_history below.
-- =============================================================================
create table public.reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    uuid not null references public.matches(id) on delete cascade,
  round       smallint not null check (round between 1 and 3),
  text        text not null check (length(text) > 0 and length(text) <= 280),
  created_at  timestamptz not null default now(),
  unique (user_id, match_id, round)
);

comment on table public.reflections is
  'Per-round end-of-vote reflections. Strictly private to the writer.';

create index idx_reflections_user on public.reflections(user_id, created_at desc);

alter table public.reflections enable row level security;

create policy "Users can view their own reflections"
  on public.reflections for select
  using (auth.uid() = user_id);

create policy "Users can insert their own reflections"
  on public.reflections for insert
  with check (auth.uid() = user_id);

-- =============================================================================
-- 4. REACTIONS — repurpose from agree/disagree to heart / thumbs_up /
--    thumbs_down. Add match_id for realtime filtering. Enable realtime.
-- =============================================================================
alter table public.reactions
  drop constraint reactions_type_check;
alter table public.reactions
  add constraint reactions_type_check
    check (type in ('heart', 'thumbs_up', 'thumbs_down'));

alter table public.reactions
  add column match_id uuid references public.matches(id) on delete cascade;

-- Backfill from messages (likely empty after the 00003 truncate, but safe):
update public.reactions r
   set match_id = m.match_id
  from public.messages m
 where r.message_id = m.id
   and r.match_id is null;

alter table public.reactions
  alter column match_id set not null;

create index idx_reactions_match on public.reactions(match_id);

alter publication supabase_realtime add table public.reactions;

-- =============================================================================
-- 5. STANCE_HISTORY — relax SELECT so match partners can see each other's
--    per-round score votes (but not their reflections; those live in
--    `reflections` with stricter RLS).
-- =============================================================================
drop policy if exists "Users can view their own stance history"
  on public.stance_history;

create policy "Users can view stance_history for their own rows or shared matches"
  on public.stance_history for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.matches m
       where m.id = stance_history.match_id
         and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- =============================================================================
-- 6. submit_round_vote — atomic per-round vote
--
-- Inserts into stance_history (+ reflections if provided), counts votes in
-- the current round, and advances matches.current_round when both have voted
-- (or marks the match completed if it was round 3).
-- =============================================================================
create or replace function public.submit_round_vote(
  p_match_id  uuid,
  p_score     smallint,
  p_reflection text default null
)
returns table (
  new_round    smallint,
  both_voted   boolean,
  match_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me               uuid := auth.uid();
  v_match            record;
  v_already_voted    uuid;
  v_vote_count       integer;
  v_new_round        smallint;
  v_new_status       text;
  v_derived_stance   text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_score < 1 or p_score > 7 then raise exception 'score must be 1-7'; end if;

  select id, status, current_round, proposition_id, user_a, user_b
    into v_match
    from public.matches
    where id = p_match_id
    for update;
  if v_match.id is null then raise exception 'match not found'; end if;
  if v_match.user_a <> v_me and v_match.user_b <> v_me then
    raise exception 'not a participant';
  end if;
  if v_match.status <> 'active' then
    raise exception 'match is no longer active';
  end if;

  -- Already voted this round?
  select id into v_already_voted
    from public.stance_history
    where match_id = p_match_id
      and user_id = v_me
      and round = v_match.current_round;
  if v_already_voted is not null then
    raise exception 'already voted this round';
  end if;

  v_derived_stance :=
    case when p_score >= 5 then 'agree'
         when p_score <= 3 then 'disagree'
         else 'unsure' end;

  insert into public.stance_history
    (user_id, proposition_id, stance, score, round, match_id)
  values
    (v_me, v_match.proposition_id, v_derived_stance, p_score,
     v_match.current_round, p_match_id);

  if p_reflection is not null and length(trim(p_reflection)) > 0 then
    insert into public.reflections (user_id, match_id, round, text)
    values (v_me, p_match_id, v_match.current_round, trim(p_reflection));
  end if;

  -- Did both users vote this round?
  select count(distinct user_id) into v_vote_count
    from public.stance_history
    where match_id = p_match_id
      and round = v_match.current_round;

  v_new_round  := v_match.current_round;
  v_new_status := v_match.status;

  if v_vote_count >= 2 then
    if v_match.current_round = 3 then
      v_new_status := 'completed';
      update public.matches
         set status = 'completed', ended_at = now()
       where id = p_match_id;
    else
      v_new_round := v_match.current_round + 1;
      update public.matches
         set current_round = v_new_round
       where id = p_match_id;
    end if;
  end if;

  return query select v_new_round, v_vote_count >= 2, v_new_status;
end;
$$;

revoke all on function public.submit_round_vote(uuid, smallint, text) from public;
grant execute on function public.submit_round_vote(uuid, smallint, text) to authenticated;

-- =============================================================================
-- 7. toggle_reaction — atomic add / change / remove
--
-- One reaction per (message, user). Same type clicked again removes it; a
-- different type updates in place; no existing reaction inserts.
-- =============================================================================
create or replace function public.toggle_reaction(
  p_message_id uuid,
  p_type       text
)
returns text  -- 'added' | 'changed' | 'removed'
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_match_id  uuid;
  v_existing  record;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_type not in ('heart', 'thumbs_up', 'thumbs_down') then
    raise exception 'invalid reaction type';
  end if;

  select msg.match_id into v_match_id
    from public.messages msg
    where msg.id = p_message_id;
  if v_match_id is null then raise exception 'message not found'; end if;

  perform 1
    from public.matches
    where id = v_match_id
      and (user_a = v_me or user_b = v_me);
  if not found then raise exception 'not a participant'; end if;

  select id, type into v_existing
    from public.reactions
    where message_id = p_message_id and user_id = v_me;

  if v_existing.id is not null then
    if v_existing.type = p_type then
      delete from public.reactions where id = v_existing.id;
      return 'removed';
    else
      update public.reactions
         set type = p_type
       where id = v_existing.id;
      return 'changed';
    end if;
  end if;

  insert into public.reactions (message_id, user_id, type, match_id)
  values (p_message_id, v_me, p_type, v_match_id);
  return 'added';
end;
$$;

revoke all on function public.toggle_reaction(uuid, text) from public;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
