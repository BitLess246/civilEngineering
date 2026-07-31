-- ─────────────────────────────────────────────────────────────────────────
-- Soil investigations — durable storage.
--
-- ONE ROW PER INVESTIGATION, the document in a jsonb column, not a normalised
-- thirty-table schema. That decision and its cost are argued in
-- webapp/src/engine/soils/remoteStore.ts; in short, nothing in the app queries
-- across investigations yet, the Investigation type is still moving, and
-- normalising later is a migration rather than a rewrite.
--
-- ROW LEVEL SECURITY IS THE SECURITY BOUNDARY. The browser holds the anon key
-- and the user's session; the `.eq('user_id', …)` filters in the client are an
-- optimisation, not a control. These policies are what stop one account
-- reading another's laboratory data.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.soil_investigations (
  id             text        primary key,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  investigation  jsonb       not null,
  -- Mirrors SOILS_SCHEMA_VERSION in the client. A row written by a newer
  -- client is refused by the reader rather than parsed.
  schema_version integer     not null default 1,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- The listing is "my investigations, newest first" and nothing else.
create index if not exists soil_investigations_user_updated_idx
  on public.soil_investigations (user_id, updated_at desc);

alter table public.soil_investigations enable row level security;

-- Four policies rather than one FOR ALL: a reader should be able to see at a
-- glance that INSERT cannot be used to plant a row under another user_id.
drop policy if exists "own investigations are readable" on public.soil_investigations;
create policy "own investigations are readable"
  on public.soil_investigations for select
  using (auth.uid() = user_id);

drop policy if exists "own investigations are insertable" on public.soil_investigations;
create policy "own investigations are insertable"
  on public.soil_investigations for insert
  with check (auth.uid() = user_id);

-- USING controls which rows may be updated; WITH CHECK stops an update from
-- reassigning the row to somebody else. Both are needed.
drop policy if exists "own investigations are updatable" on public.soil_investigations;
create policy "own investigations are updatable"
  on public.soil_investigations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own investigations are deletable" on public.soil_investigations;
create policy "own investigations are deletable"
  on public.soil_investigations for delete
  using (auth.uid() = user_id);

-- updated_at is written by the client because it is the OPTIMISTIC CONCURRENCY
-- token: the update is conditional on the value the client last read, so a
-- trigger overwriting it here would break conflict detection rather than help.
comment on column public.soil_investigations.updated_at is
  'Concurrency token. Clients write this and condition updates on it; do not add a trigger that overwrites it.';
