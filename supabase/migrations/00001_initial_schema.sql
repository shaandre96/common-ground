-- CommonGround: Initial Schema
-- Run in Supabase SQL Editor or via supabase db push

-- =============================================================================
-- 1. PROFILES (extends auth.users)
-- =============================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,
  avatar_url    text,
  country_self  text,          -- self-reported during onboarding
  city_self     text,          -- self-reported (optional)
  country_ip    text,          -- derived from IP geolocation
  city_ip       text,          -- derived from IP geolocation
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'User profiles extending Supabase auth. Dual location columns for self-reported vs IP-derived comparison.';

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at on profile changes
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- =============================================================================
-- 2. TOPICS
-- =============================================================================
create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  slug        text unique not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.topics is 'Discussion topics available on the platform.';

-- Seed initial topics (from landing page)
insert into public.topics (name, slug) values
  ('Climate Policy',      'climate-policy'),
  ('Universal Basic Income', 'universal-basic-income'),
  ('AI & Jobs',           'ai-and-jobs'),
  ('Free Speech',         'free-speech'),
  ('Urban Planning',      'urban-planning'),
  ('Immigration',         'immigration'),
  ('Veganism',            'veganism'),
  ('Space Exploration',   'space-exploration'),
  ('Drug Policy',         'drug-policy'),
  ('Education Reform',    'education-reform'),
  ('Healthcare Systems',  'healthcare-systems'),
  ('Nuclear Energy',      'nuclear-energy'),
  ('Remote Work',         'remote-work'),
  ('Cryptocurrency',      'cryptocurrency'),
  ('Genetic Engineering', 'genetic-engineering');

-- =============================================================================
-- 3. USER_TOPICS (interests + current stance)
-- =============================================================================
create table public.user_topics (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  stance      text check (stance in ('agree', 'disagree', 'unsure')),
  created_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);

comment on table public.user_topics is 'Topics a user has selected. stance holds their current position.';

-- =============================================================================
-- 4. MATCHES
-- =============================================================================
create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id) on delete cascade,
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  stance_a    text check (stance_a in ('agree', 'disagree', 'unsure')),
  stance_b    text check (stance_b in ('agree', 'disagree', 'unsure')),
  status      text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,

  constraint different_users check (user_a <> user_b)
);

comment on table public.matches is 'A conversation between two users on a single topic.';

create index idx_matches_user_a on public.matches(user_a);
create index idx_matches_user_b on public.matches(user_b);
create index idx_matches_status on public.matches(status);

-- =============================================================================
-- 5. MESSAGES
-- =============================================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

comment on table public.messages is 'Chat messages within a match. Subscribed to via Supabase Realtime.';

create index idx_messages_match_id on public.messages(match_id, created_at);

-- =============================================================================
-- 6. REACTIONS (agree/disagree per message)
-- =============================================================================
create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('agree', 'disagree')),
  created_at  timestamptz not null default now(),

  unique (message_id, user_id)  -- one reaction per message per user
);

comment on table public.reactions is 'Agree/disagree reactions on individual messages.';

-- =============================================================================
-- 7. STANCE_HISTORY (audit trail for opinion changes)
-- =============================================================================
create table public.stance_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  stance      text not null check (stance in ('agree', 'disagree', 'unsure')),
  match_id    uuid references public.matches(id) on delete set null, -- null = updated from profile
  created_at  timestamptz not null default now()
);

comment on table public.stance_history is 'Full audit trail of stance changes. match_id links to the conversation that triggered the change (null if manual).';

create index idx_stance_history_user_topic on public.stance_history(user_id, topic_id, created_at);

-- =============================================================================
-- 8. ROW LEVEL SECURITY
-- =============================================================================

-- Profiles: users can read all profiles, update only their own
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Topics: readable by everyone
alter table public.topics enable row level security;

create policy "Topics are viewable by everyone"
  on public.topics for select
  using (true);

-- User topics: users manage their own
alter table public.user_topics enable row level security;

create policy "Users can view all user_topics"
  on public.user_topics for select
  using (true);

create policy "Users can manage their own topics"
  on public.user_topics for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own topics"
  on public.user_topics for update
  using (auth.uid() = user_id);

create policy "Users can delete their own topics"
  on public.user_topics for delete
  using (auth.uid() = user_id);

-- Matches: participants can see their own matches
alter table public.matches enable row level security;

create policy "Users can view their own matches"
  on public.matches for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Messages: participants of the match can read/write
alter table public.messages enable row level security;

create policy "Match participants can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.matches
      where matches.id = messages.match_id
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
    )
  );

create policy "Match participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches
      where matches.id = match_id
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
    )
  );

-- Reactions: participants can react
alter table public.reactions enable row level security;

create policy "Match participants can view reactions"
  on public.reactions for select
  using (
    exists (
      select 1 from public.messages
      join public.matches on matches.id = messages.match_id
      where messages.id = reactions.message_id
      and (matches.user_a = auth.uid() or matches.user_b = auth.uid())
    )
  );

create policy "Users can add their own reactions"
  on public.reactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reactions"
  on public.reactions for update
  using (auth.uid() = user_id);

-- Stance history: users can read all (for analytics), write their own
alter table public.stance_history enable row level security;

create policy "Stance history is viewable by everyone"
  on public.stance_history for select
  using (true);

create policy "Users can insert their own stance history"
  on public.stance_history for insert
  with check (auth.uid() = user_id);

-- =============================================================================
-- 9. REALTIME — enable for messages table
-- =============================================================================
alter publication supabase_realtime add table public.messages;
