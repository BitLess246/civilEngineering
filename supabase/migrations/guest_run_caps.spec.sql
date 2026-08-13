-- ─────────────────────────────────────────────────────────────────────────
-- Behavioural spec for the CLAMPED `claim_guest_run`, runnable against a
-- throwaway Postgres with the three guest-trial migrations applied:
--
--   psql -v ON_ERROR_STOP=1 -f 20260804000000_guest_trials.sql
--   psql -v ON_ERROR_STOP=1 -f 20260812000000_guest_run_claims.sql
--   psql -v ON_ERROR_STOP=1 -f 20260813010000_guest_run_caps.sql
--   psql -v ON_ERROR_STOP=1 -f guest_run_caps.spec.sql
--
-- `claim_guest_run.spec.sql` still holds the behaviour of the function itself —
-- run it too, and it must still pass, because clamping the ceilings must not
-- change what happens below them. This file covers only what the clamp adds.
--
-- The caller these assertions imitate is not the Edge function. It is a browser
-- holding the anon key, POSTing to /rest/v1/rpc/claim_guest_run with whatever
-- arguments it likes — which is exactly what a named argument in a public RPC
-- signature invites.
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

\set S '''aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111'''

truncate public.guest_trials;

-- ── THE ONE THAT MATTERS: a caller cannot raise its own allowance ────────
-- Six arrivals, each asking for a limit of two billion. The sixth must still
-- be refused, because the ceiling is the server's and not the argument's.
do $$
declare r record; i int; last_reason text; allowed_count int := 0;
begin
  for i in 1..6 loop
    select * into r from public.claim_guest_run(
      'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
      '/steel/beam', 'greedy-token-' || i, 2000000000, 2000000000);
    if r.allowed then allowed_count := allowed_count + 1; end if;
    last_reason := r.reason;
  end loop;

  perform pg_temp.check('a limit of two billion still buys five runs', allowed_count, 5);
  perform pg_temp.check('and the sixth is exhausted', last_reason, 'exhausted');
  perform pg_temp.check('the row shows five, not more',
    (select used from public.guest_trials
      where route = '/steel/beam'), 5);
end $$;

-- ── the same, through the argument DEFAULTS rather than explicit values ──
do $$
declare r record; i int; allowed_count int := 0;
begin
  truncate public.guest_trials;
  for i in 1..6 loop
    -- p_limit / p_cap omitted entirely: the defaults must land in the same
    -- place the clamp does, or the two disagree the moment one is edited.
    select * into r from public.claim_guest_run(
      'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
      '/steel/beam', 'default-token-' || i);
    if r.allowed then allowed_count := allowed_count + 1; end if;
  end loop;
  perform pg_temp.check('the defaults give the same five', allowed_count, 5);
end $$;

-- ── a caller may still ask for LESS ──────────────────────────────────────
-- The clamp is one-directional on purpose: a staging deployment that wants a
-- stingier allowance is a legitimate request, and refusing it would mean
-- ignoring the argument altogether.
do $$
declare r record;
begin
  truncate public.guest_trials;
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'small-token-01', 1, 60);
  perform pg_temp.check('one run allowed under a self-imposed limit of 1', r.allowed, true);

  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'small-token-02', 1, 60);
  perform pg_temp.check('and the second is refused', r.allowed, false);
end $$;

-- ── a negative or null limit does not read as unlimited ──────────────────
do $$
declare r record;
begin
  truncate public.guest_trials;
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'neg-token-0001', -1, 60);
  perform pg_temp.check('a negative limit refuses rather than opens', r.allowed, false);

  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'null-token-0001', null, null);
  perform pg_temp.check('a null limit falls to the server ceiling', r.allowed, true);
end $$;

-- ── the route cap is clamped too ─────────────────────────────────────────
-- 61 distinct routes for one subject, each asking for a cap of two billion.
-- The 61st must be refused at the server's 60.
do $$
declare r record; i int; opened int := 0; last_reason text;
begin
  truncate public.guest_trials;
  for i in 1..61 loop
    select * into r from public.claim_guest_run(
      'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
      '/route-' || i, 'cap-token-' || i, 5, 2000000000);
    if r.allowed then opened := opened + 1; end if;
    last_reason := r.reason;
  end loop;
  perform pg_temp.check('a cap of two billion still opens sixty routes', opened, 60);
  perform pg_temp.check('and the sixty-first hits the route cap', last_reason, 'route-cap');
end $$;

-- ── the whole-table backstop the route cap cannot provide ────────────────
-- The route cap is PER SUBJECT, and subjects are 64 hex characters anyone may
-- invent, so it has never bounded the table. This is what does — and it lets
-- the visitor compute rather than refusing, because a full table is our
-- problem and not theirs.
do $$
declare r record; est real;
begin
  truncate public.guest_trials;

  -- Drive the planner's estimate above the ceiling without inserting half a
  -- million rows: `guest_trials_full()` reads reltuples, so setting it is a
  -- faithful way to reach the branch. The estimate being settable by hand is
  -- also why this is a backstop and not a quota.
  update pg_class set reltuples = 600000::real
   where oid = 'public.guest_trials'::regclass;
  select reltuples into est from pg_class where oid = 'public.guest_trials'::regclass;
  perform pg_temp.check('the estimate is above the ceiling', est >= 500000::real, true);
  perform pg_temp.check('and the table reads as full', public.guest_trials_full(), true);

  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'full-token-0001', 5, 60);
  perform pg_temp.check('a new subject is ALLOWED when the table is full', r.allowed, true);
  perform pg_temp.check('but not charged', r.charged, false);
  perform pg_temp.check('and says why', r.reason, 'table-full');
  perform pg_temp.check('and no row was opened',
    (select count(*)::int from public.guest_trials), 0);

  update pg_class set reltuples = 0::real
   where oid = 'public.guest_trials'::regclass;
  perform pg_temp.check('and it reads as not full again', public.guest_trials_full(), false);
end $$;

-- ── an EXISTING subject keeps working while the table is full ────────────
-- The backstop blocks new rows, not existing counts. Someone mid-visit must
-- not have their allowance stop being enforced because storage filled up.
do $$
declare r record;
begin
  truncate public.guest_trials;
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'before-full-01', 5, 60);
  perform pg_temp.check('a row exists before the table fills', r.used, 1);

  update pg_class set reltuples = 600000::real
   where oid = 'public.guest_trials'::regclass;

  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'after-full-001', 5, 60);
  perform pg_temp.check('the existing row still charges', r.charged, true);
  perform pg_temp.check('and still counts up', r.used, 2);

  update pg_class set reltuples = 0::real
   where oid = 'public.guest_trials'::regclass;
end $$;

-- ── the ceilings are functions, not literals scattered through the body ──
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_guest_run';

  perform pg_temp.check('the limit comes from guest_run_limit()',
    src like '%guest_run_limit()%', true);
  perform pg_temp.check('the cap comes from guest_route_cap()',
    src like '%guest_route_cap()%', true);
  perform pg_temp.check('both arguments are clamped with least()',
    (length(src) - length(replace(src, 'least(', ''))) / length('least(') >= 2, true);
end $$;

-- ── anon may still call it, and still cannot reach the table ─────────────
do $$
declare tbl_ok boolean; fn_ok boolean;
begin
  select has_table_privilege('anon', 'public.guest_trials', 'select')
      or has_table_privilege('anon', 'public.guest_trials', 'insert')
    into tbl_ok;
  select has_function_privilege('anon',
    'public.claim_guest_run(text,text,text,integer,integer)', 'execute') into fn_ok;

  perform pg_temp.check('anon cannot touch guest_trials', tbl_ok, false);
  perform pg_temp.check('anon may still execute the claim', fn_ok, true);
end $$;

truncate public.guest_trials;
select 'guest run caps spec passed' as result;
