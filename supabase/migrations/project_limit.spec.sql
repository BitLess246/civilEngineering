-- ─────────────────────────────────────────────────────────────────────────
-- Behavioural spec for the project ceiling, runnable against a throwaway
-- Postgres from THIS directory:
--
--   createdb spec && psql -v ON_ERROR_STOP=1 -d spec -f project_limit.spec.sql
--
-- Unlike `claim_guest_run.spec.sql` this file loads the migrations itself,
-- because it first has to stand up a stub `auth` schema: the projects table
-- references `auth.users`, and the whole point of the exercise is what
-- `auth.uid()` and `auth.jwt()` return.
--
-- IT RUNS AS A NON-SUPERUSER. Superusers bypass row level security, so a spec
-- that stayed superuser would pass with the policies deleted. Everything below
-- `set role authenticated` is what a browser holding the anon key and a session
-- can actually do.
--
-- The assertion that matters is "one bulk insert cannot exceed the ceiling".
-- It is SQL rather than vitest because the bug WAS the SQL — snapshot
-- visibility inside a multi-row command does not survive being mocked.
-- ─────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.check(label text, got anyelement, want anyelement)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % — got %, want %', label, got, want;
  end if;
  raise notice 'ok   %', label;
end $$;

-- ── stub the pieces of Supabase this migration leans on ──────────────────
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

-- Supabase derives these from the request JWT. Here they read session GUCs so
-- a test can put on a different hat between statements.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('spec.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('spec.jwt', true), '')::jsonb, '{}'::jsonb)
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
grant usage on schema public to authenticated;
-- The INSERT policy calls `auth.uid()`, and a policy expression runs as the
-- querying role, so `authenticated` needs to reach the schema. Supabase grants
-- this out of the box; a throwaway database does not.
grant usage on schema auth to authenticated;

\i 20260804010000_projects.sql
\i 20260813000000_project_limit_trigger.sql

-- Supabase grants these by default; the migration does not, so the spec must.
grant select, insert, update, delete on public.projects to authenticated;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

\set U1 '''11111111-1111-1111-1111-111111111111'''
\set U2 '''22222222-2222-2222-2222-222222222222'''

-- A helper so each case reads as "this user, this many rows, one statement".
create or replace function pg_temp.bulk(uid uuid, n integer, tag text)
returns void language plpgsql as $$
begin
  insert into public.projects (id, user_id, project)
  select tag || '-' || i, uid, '{}'::jsonb from generate_series(1, n) i;
end $$;

set role authenticated;
set spec.uid = '11111111-1111-1111-1111-111111111111';
set spec.jwt = '{"app_metadata":{"plan":"free"}}';

-- ── the free ceiling still holds for ordinary one-at-a-time saves ────────
do $$
declare i int; blocked text;
begin
  for i in 1..3 loop
    insert into public.projects (id, user_id, project)
      values ('single-' || i, auth.uid(), '{}'::jsonb);
  end loop;
  perform pg_temp.check('three single saves allowed',
    (select count(*)::int from public.projects), 3);

  begin
    insert into public.projects (id, user_id, project)
      values ('single-4', auth.uid(), '{}'::jsonb);
    blocked := 'not blocked';
  exception
    when insufficient_privilege then blocked := 'rls';   -- 42501, the policy
    when check_violation        then blocked := 'trigger';
  end;
  -- The policy is expected to win here: it refuses before a row is written,
  -- which is both cheaper and the error the client already translates.
  perform pg_temp.check('a fourth single save is refused', blocked, 'rls');
end $$;

-- ── THE ONE THAT MATTERS ─────────────────────────────────────────────────
-- Before the trigger this inserted all one hundred rows: `project_count()` is
-- STABLE, so every per-row `with check` evaluation read the same pre-statement
-- zero. PostgREST emits exactly this statement for a JSON-array request body.
do $$
declare blocked text;
begin
  delete from public.projects;
  begin
    perform pg_temp.bulk(auth.uid(), 100, 'bulk');
    blocked := 'not blocked';
  exception
    when insufficient_privilege then blocked := 'rls';
    when check_violation        then blocked := 'trigger';
  end;
  perform pg_temp.check('one bulk insert of 100 is refused', blocked, 'trigger');
  perform pg_temp.check('and left nothing behind',
    (select count(*)::int from public.projects), 0);
end $$;

-- ── but a legitimate bulk insert up to the ceiling still works ───────────
-- The fix must not be "refuse every multi-row insert". Someone importing three
-- projects on a free plan is doing nothing wrong.
do $$
begin
  delete from public.projects;
  perform pg_temp.bulk(auth.uid(), 3, 'exact');
  perform pg_temp.check('a bulk insert of exactly 3 is allowed',
    (select count(*)::int from public.projects), 3);
end $$;

-- ── the ceiling counts what is already there, not just the batch ─────────
do $$
declare blocked text;
begin
  delete from public.projects;
  perform pg_temp.bulk(auth.uid(), 2, 'have');
  begin
    perform pg_temp.bulk(auth.uid(), 2, 'more');
    blocked := 'not blocked';
  exception
    when insufficient_privilege then blocked := 'rls';
    when check_violation        then blocked := 'trigger';
  end;
  perform pg_temp.check('2 existing + a bulk of 2 is refused', blocked, 'trigger');
  perform pg_temp.check('the refused batch rolled back',
    (select count(*)::int from public.projects), 2);

  perform pg_temp.bulk(auth.uid(), 1, 'last');
  perform pg_temp.check('2 existing + a bulk of 1 is allowed',
    (select count(*)::int from public.projects), 3);
end $$;

-- ── deleting frees a slot; the ceiling is not a high-water mark ──────────
do $$
begin
  delete from public.projects where id = 'last-1';
  insert into public.projects (id, user_id, project)
    values ('reused', auth.uid(), '{}'::jsonb);
  perform pg_temp.check('a freed slot can be filled again',
    (select count(*)::int from public.projects), 3);
end $$;

-- ── another account's rows are not mine ──────────────────────────────────
do $$
declare mine int;
begin
  set local spec.uid = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.bulk(auth.uid(), 3, 'theirs');
  select count(*)::int into mine from public.projects
   where user_id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.check('a second account gets its own three', mine, 3);
end $$;

-- ── a plan without a ceiling is not throttled ────────────────────────────
do $$
begin
  delete from public.projects;
  set local spec.jwt = '{"app_metadata":{"plan":"pro"}}';
  perform pg_temp.bulk(auth.uid(), 100, 'pro');
  perform pg_temp.check('pro takes a bulk insert of 100',
    (select count(*)::int from public.projects), 100);
end $$;

-- ── an UPDATE is never blocked, even far over the ceiling ────────────────
-- A plan that lapses must not make existing work unsavable. This is the reason
-- the count lives on INSERT alone, and the trigger must not have changed it:
-- the hundred rows above are still there while the plan reads free again.
do $$
declare touched int;
begin
  set local spec.jwt = '{"app_metadata":{"plan":"free"}}';
  update public.projects set project = '{"edited":true}'::jsonb where id = 'pro-1';
  get diagnostics touched = row_count;
  perform pg_temp.check('a lapsed plan can still save existing work', touched, 1);
end $$;

-- ── an unknown plan falls to the free allowance, never to unlimited ──────
do $$
declare blocked text;
begin
  delete from public.projects;
  set local spec.jwt = '{"app_metadata":{"plan":"enterprise-unicorn"}}';
  begin
    perform pg_temp.bulk(auth.uid(), 10, 'unknown');
    blocked := 'not blocked';
  exception
    when insufficient_privilege then blocked := 'rls';
    when check_violation        then blocked := 'trigger';
  end;
  perform pg_temp.check('an unrecognised plan is not unlimited', blocked, 'trigger');
end $$;

-- ── the plan cannot be raised from the browser ───────────────────────────
-- `user_metadata` is writable by the account itself. If `project_limit()` ever
-- reads it, one console call buys unlimited projects.
do $$
declare blocked text;
begin
  delete from public.projects;
  set local spec.jwt = '{"app_metadata":{"plan":"free"},"user_metadata":{"plan":"max"}}';
  begin
    perform pg_temp.bulk(auth.uid(), 10, 'selfclaim');
    blocked := 'not blocked';
  exception
    when insufficient_privilege then blocked := 'rls';
    when check_violation        then blocked := 'trigger';
  end;
  perform pg_temp.check('a self-claimed plan buys nothing', blocked, 'trigger');
end $$;

reset role;

-- ── the enforcement is not snapshot-based, structurally ──────────────────
do $$
declare after_insert boolean; is_constraint boolean; snapshot_fn boolean;
begin
  -- pg_trigger.tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT, 64 = INSTEAD OF.
  -- AFTER is the absence of both BEFORE and INSTEAD.
  select (t.tgtype & 66) = 0 and (t.tgtype & 4) <> 0 and (t.tgtype & 1) <> 0,
         t.tgconstraint <> 0
    into after_insert, is_constraint
    from pg_trigger t where t.tgname = 'projects_limit' and not t.tgisinternal;

  perform pg_temp.check('the check fires AFTER the rows land', after_insert, true);
  perform pg_temp.check('and is a constraint trigger', is_constraint, true);

  -- The trigger body must not go back to the STABLE counter that caused this.
  select pg_get_functiondef(p.oid) ilike '%project_count%'
    into snapshot_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_project_limit';
  perform pg_temp.check('the trigger does not use the STABLE project_count()', snapshot_fn, false);
end $$;

-- ── the ownership half of the policy is still there ──────────────────────
do $$
declare owns boolean;
begin
  select pg_get_expr(pol.polwithcheck, pol.polrelid) like '%uid()%'
    into owns
    from pg_policy pol
   where pol.polrelid = 'public.projects'::regclass
     and pol.polcmd = 'a';   -- INSERT
  perform pg_temp.check('INSERT still checks the row belongs to the caller', owns, true);
end $$;

delete from public.projects;
select 'project limit spec passed' as result;
