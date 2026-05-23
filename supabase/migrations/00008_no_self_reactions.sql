-- CommonGround: forbid users from reacting to their own messages.
--
-- The UI hides the reaction picker for self-messages, but server-side this
-- block prevents the same outcome via a direct RPC call. Defense in depth.
--
-- Run in Supabase SQL Editor after 00001-00007.

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
  v_me         uuid := auth.uid();
  v_match_id   uuid;
  v_sender_id  uuid;
  v_existing   record;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_type not in ('heart', 'thumbs_up', 'thumbs_down') then
    raise exception 'invalid reaction type';
  end if;

  select msg.match_id, msg.sender_id
    into v_match_id, v_sender_id
    from public.messages msg
    where msg.id = p_message_id;
  if v_match_id is null then raise exception 'message not found'; end if;

  -- New rule (00008): you can't react to your own messages.
  if v_sender_id = v_me then
    raise exception 'cannot react to your own message';
  end if;

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
