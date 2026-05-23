-- CommonGround: Move from topic-level stance to per-proposition stance.
-- Topics stay as categories. Each topic gets 3 debatable propositions, and
-- users now hold stances on propositions, not topics.
--
-- Run in Supabase SQL Editor AFTER 00001 and 00002.

-- =============================================================================
-- 0. Wipe matchmaking data — the column shape is changing under it.
--    Safe because this is a dev DB; in production you'd migrate the data.
-- =============================================================================
truncate
  public.reactions,
  public.messages,
  public.matches,
  public.match_queue,
  public.stance_history,
  public.user_topics
  restart identity cascade;

-- Force everyone back through onboarding so they pick propositions.
update public.profiles set onboarded = false;

-- =============================================================================
-- 1. PROPOSITIONS — debatable claims grouped under topics
-- =============================================================================
create table public.propositions (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id) on delete cascade,
  text        text not null,
  slug        text unique not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.propositions is 'Debatable claims grouped under topics. Users hold stances on propositions, not topics.';

create index idx_propositions_topic on public.propositions(topic_id, active);

alter table public.propositions enable row level security;

create policy "Propositions are viewable by everyone"
  on public.propositions for select
  using (true);

-- =============================================================================
-- 2. user_topics  ->  user_propositions
-- =============================================================================
alter table public.user_topics rename to user_propositions;

-- Swap the FK column.
alter table public.user_propositions drop constraint user_topics_pkey;
alter table public.user_propositions drop column topic_id;
alter table public.user_propositions
  add column proposition_id uuid not null
    references public.propositions(id) on delete cascade;
alter table public.user_propositions
  add constraint user_propositions_pkey primary key (user_id, proposition_id);

-- Replace the old user_topics policies.
drop policy if exists "Users can view all user_topics"    on public.user_propositions;
drop policy if exists "Users can manage their own topics" on public.user_propositions;
drop policy if exists "Users can update their own topics" on public.user_propositions;
drop policy if exists "Users can delete their own topics" on public.user_propositions;

create policy "User propositions are viewable by everyone"
  on public.user_propositions for select using (true);
create policy "Users can insert their own user_propositions"
  on public.user_propositions for insert with check (auth.uid() = user_id);
create policy "Users can update their own user_propositions"
  on public.user_propositions for update using (auth.uid() = user_id);
create policy "Users can delete their own user_propositions"
  on public.user_propositions for delete using (auth.uid() = user_id);

-- =============================================================================
-- 3. matches: topic_id  ->  proposition_id
-- =============================================================================
alter table public.matches drop column topic_id;
alter table public.matches
  add column proposition_id uuid not null
    references public.propositions(id) on delete cascade;

-- =============================================================================
-- 4. match_queue: topic_id  ->  proposition_id
-- =============================================================================
drop index if exists public.idx_match_queue_topic;

alter table public.match_queue drop column topic_id;
alter table public.match_queue
  add column proposition_id uuid not null
    references public.propositions(id) on delete cascade;

create index idx_match_queue_proposition
  on public.match_queue(proposition_id, created_at);

-- =============================================================================
-- 5. stance_history: topic_id  ->  proposition_id
-- =============================================================================
drop index if exists public.idx_stance_history_user_topic;

alter table public.stance_history drop column topic_id;
alter table public.stance_history
  add column proposition_id uuid not null
    references public.propositions(id) on delete cascade;

create index idx_stance_history_user_proposition
  on public.stance_history(user_id, proposition_id, created_at);

-- =============================================================================
-- 6. find_match — new signature: takes a proposition, not a topic
-- =============================================================================
drop function if exists public.find_match(uuid, text);

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
  v_match_id        uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;

  if p_stance is not null and p_stance not in ('agree', 'disagree', 'unsure') then
    raise exception 'invalid stance';
  end if;

  -- Return any existing active match (re-entrant).
  select id
    into v_match_id
    from public.matches
    where status = 'active' and (user_a = v_me or user_b = v_me)
    order by created_at desc
    limit 1;
  if v_match_id is not null then
    return v_match_id;
  end if;

  -- Look for a waiting partner on the same proposition. Prefer a different
  -- stance, FIFO. Lock so concurrent callers don't claim the same partner.
  select user_id, stance
    into v_partner_id, v_partner_stance
    from public.match_queue
    where proposition_id = p_proposition_id and user_id <> v_me
    order by (stance is distinct from p_stance) desc, created_at asc
    limit 1
    for update skip locked;

  if v_partner_id is not null then
    delete from public.match_queue where user_id in (v_me, v_partner_id);
    insert into public.matches (proposition_id, user_a, user_b, stance_a, stance_b)
    values (p_proposition_id, v_partner_id, v_me, v_partner_stance, p_stance)
    returning id into v_match_id;
    return v_match_id;
  end if;

  -- No partner — upsert our queue entry.
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

-- =============================================================================
-- 7. Seed 3 propositions per topic (45 total)
-- =============================================================================
insert into public.propositions (topic_id, text, slug) values
  ((select id from public.topics where slug = 'climate-policy'),
   'Wealthy nations should pay climate reparations to vulnerable countries.', 'climate-reparations'),
  ((select id from public.topics where slug = 'climate-policy'),
   'Carbon taxes do more good than emissions trading markets.', 'carbon-tax-vs-trading'),
  ((select id from public.topics where slug = 'climate-policy'),
   'Individual lifestyle changes meaningfully fight climate change.', 'climate-individual-action'),

  ((select id from public.topics where slug = 'universal-basic-income'),
   'A universal basic income would reduce, not increase, unemployment.', 'ubi-reduces-unemployment'),
  ((select id from public.topics where slug = 'universal-basic-income'),
   'Means-tested welfare is more just than universal transfers.', 'means-tested-vs-universal'),
  ((select id from public.topics where slug = 'universal-basic-income'),
   'Replacing existing welfare with UBI is a worthwhile tradeoff.', 'ubi-replaces-welfare'),

  ((select id from public.topics where slug = 'ai-and-jobs'),
   'AI replacing entry-level jobs is a net negative for society.', 'ai-entry-level-jobs'),
  ((select id from public.topics where slug = 'ai-and-jobs'),
   'Companies using AI should pay a worker-displacement tax.', 'ai-displacement-tax'),
  ((select id from public.topics where slug = 'ai-and-jobs'),
   'Most knowledge workers will be obsolete within 20 years.', 'knowledge-workers-obsolete'),

  ((select id from public.topics where slug = 'free-speech'),
   'Social platforms should never deplatform legal speech.', 'no-deplatform-legal'),
  ((select id from public.topics where slug = 'free-speech'),
   'Hate speech laws do more harm than the speech they restrict.', 'hate-speech-laws-harm'),
  ((select id from public.topics where slug = 'free-speech'),
   'Anonymous online speech does more good than harm.', 'anonymous-speech-good'),

  ((select id from public.topics where slug = 'urban-planning'),
   'Cars should be banned from city centers.', 'cars-banned-city-centers'),
  ((select id from public.topics where slug = 'urban-planning'),
   'Single-family zoning is the main driver of housing crises.', 'single-family-zoning-housing'),
  ((select id from public.topics where slug = 'urban-planning'),
   'Tall buildings make cities better places to live.', 'tall-buildings-better'),

  ((select id from public.topics where slug = 'immigration'),
   'Open borders would make the world meaningfully richer.', 'open-borders-richer'),
  ((select id from public.topics where slug = 'immigration'),
   'Cultural assimilation should be required for citizenship.', 'assimilation-required'),
  ((select id from public.topics where slug = 'immigration'),
   'Skilled-worker visas matter more than asylum policy.', 'skilled-vs-asylum'),

  ((select id from public.topics where slug = 'veganism'),
   'Eating meat is morally indefensible.', 'meat-indefensible'),
  ((select id from public.topics where slug = 'veganism'),
   'Lab-grown meat will end factory farming.', 'lab-meat-ends-farming'),
  ((select id from public.topics where slug = 'veganism'),
   'Vegan diets are healthier for most people.', 'vegan-healthier'),

  ((select id from public.topics where slug = 'space-exploration'),
   'Governments should fund space, not leave it to billionaires.', 'space-public-vs-private'),
  ((select id from public.topics where slug = 'space-exploration'),
   'Colonizing Mars is a serious strategic priority.', 'mars-colonization'),
  ((select id from public.topics where slug = 'space-exploration'),
   'Space spending would be better spent on Earth''s problems.', 'space-vs-earth'),

  ((select id from public.topics where slug = 'drug-policy'),
   'All drugs should be legalized and regulated.', 'legalize-all-drugs'),
  ((select id from public.topics where slug = 'drug-policy'),
   'The War on Drugs caused more harm than the drugs.', 'war-on-drugs-harm'),
  ((select id from public.topics where slug = 'drug-policy'),
   'Psychedelic therapy should be available on prescription.', 'psychedelic-therapy'),

  ((select id from public.topics where slug = 'education-reform'),
   'College should be tuition-free for everyone.', 'tuition-free-college'),
  ((select id from public.topics where slug = 'education-reform'),
   'Standardized testing should be abolished.', 'abolish-standardized-testing'),
  ((select id from public.topics where slug = 'education-reform'),
   'Trade schools should be valued equally to universities.', 'trade-vs-university'),

  ((select id from public.topics where slug = 'healthcare-systems'),
   'Single-payer healthcare is the only just system.', 'single-payer-just'),
  ((select id from public.topics where slug = 'healthcare-systems'),
   'Private healthcare delivers better outcomes than public.', 'private-better-outcomes'),
  ((select id from public.topics where slug = 'healthcare-systems'),
   'Doctors should be paid significantly less.', 'doctors-paid-less'),

  ((select id from public.topics where slug = 'nuclear-energy'),
   'Nuclear is essential for hitting climate targets.', 'nuclear-essential-climate'),
  ((select id from public.topics where slug = 'nuclear-energy'),
   'Nuclear waste remains an unsolved problem.', 'nuclear-waste-unsolved'),
  ((select id from public.topics where slug = 'nuclear-energy'),
   'Small modular reactors will displace fossil fuels.', 'smr-displaces-fossil'),

  ((select id from public.topics where slug = 'remote-work'),
   'Remote work harms early-career professionals.', 'remote-harms-early-career'),
  ((select id from public.topics where slug = 'remote-work'),
   'Companies that mandate office returns are losing talent.', 'rto-losing-talent'),
  ((select id from public.topics where slug = 'remote-work'),
   'Productivity is higher in offices than at home.', 'office-more-productive'),

  ((select id from public.topics where slug = 'cryptocurrency'),
   'Bitcoin will be a legitimate reserve asset within 10 years.', 'bitcoin-reserve-asset'),
  ((select id from public.topics where slug = 'cryptocurrency'),
   'Crypto''s energy use disqualifies it from mainstream use.', 'crypto-energy-disqualifies'),
  ((select id from public.topics where slug = 'cryptocurrency'),
   'Smart contracts will replace most traditional contracts.', 'smart-contracts-replace'),

  ((select id from public.topics where slug = 'genetic-engineering'),
   'Editing human embryos for traits should be allowed.', 'edit-embryos-traits'),
  ((select id from public.topics where slug = 'genetic-engineering'),
   'GMO crops are safer than organic ones.', 'gmo-safer-than-organic'),
  ((select id from public.topics where slug = 'genetic-engineering'),
   'Bringing back extinct species is a moral imperative.', 'de-extinction-imperative');
