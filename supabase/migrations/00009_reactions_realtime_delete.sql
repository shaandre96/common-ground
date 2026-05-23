-- CommonGround: fix realtime DELETE events on reactions.
--
-- Supabase Realtime's `postgres_changes` filter (e.g. `match_id=eq.<id>`)
-- matches DELETE events against the OLD row. By default Postgres emits only
-- the primary key in the WAL old-tuple, so `old.match_id` is undefined and
-- the filter rejects every DELETE — meaning unreact events never reach the
-- chat-room subscriber. Setting REPLICA IDENTITY FULL tells Postgres to ship
-- the full pre-image of the row, so the filter can match and the event flows
-- through.
--
-- INSERT and UPDATE work fine on the default identity because they always
-- include the new row in full. Only DELETE was affected.
--
-- Costs: marginally larger WAL entries on this table. Negligible for the
-- volume of reactions we expect.
--
-- Run in Supabase SQL Editor after 00001-00008.

alter table public.reactions replica identity full;
