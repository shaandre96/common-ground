-- CommonGround: product analytics events table.
--
-- Self-hosted, write-only from the app. Events flow in via the `track()`
-- helper in `lib/analytics.ts`; reads happen in the Supabase SQL Editor
-- using the service role — there is no client-side SELECT policy on purpose.
--
-- Run in Supabase SQL Editor after 00001-00004.

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  name        text not null,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.events is
  'Product analytics events. Fire-and-forget from server actions. No client read access — query via the SQL editor with the service role.';

create index idx_events_name_time on public.events(name, created_at desc);
create index idx_events_user_time on public.events(user_id, created_at desc);

alter table public.events enable row level security;

-- INSERT-only from the app: callers may attach their own user_id, or none.
create policy "Authenticated callers can insert their own events"
  on public.events for insert
  with check (user_id is null or auth.uid() = user_id);

-- No SELECT / UPDATE / DELETE policies — only the service role reads or
-- mutates this table, via Supabase dashboard / scheduled reports.
