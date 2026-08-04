-- ─────────────────────────────────────────────────────────────────────────
-- Saved projects — durable storage for Model Space.
--
-- Until now the 3D model lived in `sessionStorage`, so it survived a reload
-- and nothing else: close the tab and the work was gone. `saved-projects` has
-- been listed on every plan since pricing was written, with no store behind it.
--
-- ONE ROW PER PROJECT, the document in a jsonb column, not a normalised
-- schema. The argument is the same one made for soil investigations and is set
-- out at length in webapp/src/engine/projects/remoteStore.ts: nothing queries
-- across projects, the document shape is still moving, and normalising later
-- is a migration rather than a rewrite.
--
-- ROW LEVEL SECURITY IS THE SECURITY BOUNDARY. The browser holds the anon key
-- and the user's session; the `.eq('user_id', …)` filters in the client are an
-- optimisation, not a control.
--
-- AND IT IS ALSO THE PAYWALL. The insert policy counts existing rows against
-- the plan in the caller's JWT, so the project ceiling is enforced HERE rather
-- than by a check in the browser that devtools could talk out of. That makes
-- the saved-project limit the first entitlement in this app that is a real
-- boundary rather than a product promise.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id             text        primary key,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  project        jsonb       not null,
  -- Mirrors PROJECT_SCHEMA_VERSION in the client. A row written by a newer
  -- client is refused by the reader rather than parsed.
  schema_version integer     not null default 1,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- The listing is "my projects, newest first" and nothing else. The insert
-- policy's count runs on the same index.
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- How many projects may this account keep?
--
-- THIS DUPLICATES `maxProjects` IN webapp/src/lib/plans.ts, and there is no way
-- around that: the server cannot import TypeScript and the browser cannot be
-- trusted to enforce its own ceiling. The mitigation is a test —
-- `plans.limits.test.ts` reads THIS FILE and fails if the two disagree — so the
-- copies cannot drift silently.
--
-- The plan is read from app_metadata, which only the service-role key can
-- write (migration 20260731120000). Reading it from user_metadata would let an
-- account raise its own ceiling with one call from a browser console.
--
-- NULL means no limit. An unknown or absent plan falls to the free allowance,
-- never to unlimited: the failure direction has to cost the business nothing.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.project_limit()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'plan', 'free')
           when 'pro' then null
           when 'max' then null
           when 'free' then 3
           else 3
         end::integer;
$$;

grant execute on function public.project_limit() to authenticated;

create or replace function public.project_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.projects where user_id = auth.uid();
$$;

grant execute on function public.project_count() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Policies. Four rather than one FOR ALL, so a reader can see at a glance that
-- INSERT cannot plant a row under another user_id and that only INSERT carries
-- the ceiling.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "own projects are readable" on public.projects;
create policy "own projects are readable"
  on public.projects for select
  using (auth.uid() = user_id);

-- The ceiling applies to CREATING a project, never to saving one that already
-- exists. A plan that lapses must not make existing work unsavable — meeting a
-- paywall mid-edit, holding changes you cannot store, is the worst possible
-- moment for it.
drop policy if exists "own projects are insertable within the plan limit" on public.projects;
create policy "own projects are insertable within the plan limit"
  on public.projects for insert
  with check (
    auth.uid() = user_id
    and (public.project_limit() is null or public.project_count() < public.project_limit())
  );

-- USING controls which rows may be updated; WITH CHECK stops an update from
-- reassigning the row to somebody else. Both are needed, and neither counts.
drop policy if exists "own projects are updatable" on public.projects;
create policy "own projects are updatable"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own projects are deletable" on public.projects;
create policy "own projects are deletable"
  on public.projects for delete
  using (auth.uid() = user_id);
