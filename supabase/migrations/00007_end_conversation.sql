-- CommonGround: let either participant end a conversation at any time.
--
-- matches has no client UPDATE policy by design (state transitions must go
-- through SECURITY DEFINER functions). This adds the explicit "abandon"
-- function — distinct from `submit_round_vote`'s natural "completed" exit
-- after round 3.
--
-- Run in Supabase SQL Editor after 00001-00006.

create or replace function public.end_conversation(p_match_id uuid)
returns text  -- the resulting match.status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_match  record;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select id, status, user_a, user_b
    into v_match
    from public.matches
    where id = p_match_id;
  if v_match.id is null then raise exception 'match not found'; end if;
  if v_match.user_a <> v_me and v_match.user_b <> v_me then
    raise exception 'not a participant';
  end if;

  -- Idempotent: already non-active matches just return their current status.
  if v_match.status <> 'active' then
    return v_match.status;
  end if;

  update public.matches
     set status   = 'abandoned',
         ended_at = now()
   where id = p_match_id;

  return 'abandoned';
end;
$$;

revoke all on function public.end_conversation(uuid) from public;
grant execute on function public.end_conversation(uuid) to authenticated;

-- =============================================================================
-- Update find_match to snapshot scores from user_propositions into the new
-- matches.score_a / score_b columns at pairing time. Previously these were
-- left null when pairing through the queue, breaking the chat header's
-- "You X · They Y" line.
-- =============================================================================
create or replace function public.find_match(p_proposition_id uuid, p_stance text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me              uuid := auth.uid();
  v_partner_id      uuid;
  v_partner_stance  text;
  v_partner_score   smallint;
  v_my_score        smallint;
  v_match_id        uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_stance is not null and p_stance not in ('agree', 'disagree', 'unsure') then
    raise exception 'invalid stance';
  end if;

  -- Existing active match — return it.
  select id into v_match_id
    from public.matches
    where status = 'active' and (user_a = v_me or user_b = v_me)
    order by created_at desc
    limit 1;
  if v_match_id is not null then
    return v_match_id;
  end if;

  -- Look for a waiting partner.
  select user_id, stance
    into v_partner_id, v_partner_stance
    from public.match_queue
    where proposition_id = p_proposition_id and user_id <> v_me
    order by (stance is distinct from p_stance) desc, created_at asc
    limit 1
    for update skip locked;

  if v_partner_id is not null then
    -- Snapshot both users' scores from user_propositions for the chat header.
    select score into v_partner_score
      from public.user_propositions
      where user_id = v_partner_id and proposition_id = p_proposition_id;
    select score into v_my_score
      from public.user_propositions
      where user_id = v_me and proposition_id = p_proposition_id;

    delete from public.match_queue where user_id in (v_me, v_partner_id);

    insert into public.matches
      (proposition_id, user_a, user_b, stance_a, stance_b, score_a, score_b)
    values
      (p_proposition_id, v_partner_id, v_me,
       v_partner_stance, p_stance,
       v_partner_score, v_my_score)
    returning id into v_match_id;

    return v_match_id;
  end if;

  insert into public.match_queue (user_id, proposition_id, stance)
  values (v_me, p_proposition_id, p_stance)
  on conflict (user_id) do update
    set proposition_id = excluded.proposition_id,
        stance         = excluded.stance,
        created_at     = now();

  return null;
end;
$$;

revoke all on function public.find_match(uuid, text) from public;
grant execute on function public.find_match(uuid, text) to authenticated;
