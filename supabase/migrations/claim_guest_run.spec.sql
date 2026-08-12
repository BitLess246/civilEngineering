-- ─────────────────────────────────────────────────────────────────────────
-- Behavioural spec for `claim_guest_run`, runnable against a throwaway
-- Postgres with both guest-trial migrations applied:
--
--   psql -v ON_ERROR_STOP=1 -f 20260804000000_guest_trials.sql
--   psql -v ON_ERROR_STOP=1 -f 20260812000000_guest_run_claims.sql
--   psql -v ON_ERROR_STOP=1 -f claim_guest_run.spec.sql
--
-- Every assertion below is a rule the trial gate depends on. It is SQL rather
-- than vitest because the rules ARE the SQL — the row lock and the ON CONFLICT
-- are the interesting parts, and neither survives being mocked.
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

-- 64 hex chars, the shape a real salted digest has.
\set S '''aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111'''
\set T '''cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111'''

truncate public.guest_trials;

-- ── one arrival costs one run ────────────────────────────────────────────
do $$
declare r record;
begin
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'run-token-0001', 5, 60);
  perform pg_temp.check('first arrival allowed',  r.allowed, true);
  perform pg_temp.check('first arrival charged',  r.charged, true);
  perform pg_temp.check('first arrival used = 1', r.used,    1);
end $$;

-- ── THE ONE THAT MATTERS: replaying the token is free and unlimited ──────
-- Typing in a field recomputes every 250 ms. If these were charged, five runs
-- would be gone in about a second.
do $$
declare r record; i int;
begin
  for i in 1..50 loop
    select * into r from public.claim_guest_run(
      'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
      '/steel/beam', 'run-token-0001', 5, 60);
  end loop;
  perform pg_temp.check('50 recomputes still allowed', r.allowed, true);
  perform pg_temp.check('50 recomputes charged nothing', r.charged, false);
  perform pg_temp.check('50 recomputes left used = 1',   r.used,   1);
end $$;

-- ── a fresh token is a fresh arrival, and the fifth is the last ──────────
do $$
declare r record; i int;
begin
  for i in 2..5 loop
    select * into r from public.claim_guest_run(
      'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
      '/steel/beam', 'run-token-000' || i, 5, 60);
    perform pg_temp.check('arrival ' || i || ' allowed', r.allowed, true);
    perform pg_temp.check('arrival ' || i || ' used',    r.used,    i);
  end loop;

  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'run-token-0006', 5, 60);
  perform pg_temp.check('sixth arrival refused',   r.allowed, false);
  perform pg_temp.check('sixth arrival not charged', r.charged, false);
  perform pg_temp.check('sixth arrival reason',    r.reason,  'exhausted');
  perform pg_temp.check('sixth arrival used stays 5', r.used,  5);
end $$;

-- ── an exhausted subject keeps its most recent tokens working ────────────
-- Otherwise the visitor who is mid-calculation on their fifth run gets cut off
-- the instant they touch a field.
do $$
declare r record;
begin
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/beam', 'run-token-0005', 5, 60);
  perform pg_temp.check('fifth run continues after exhaustion', r.allowed, true);
  perform pg_temp.check('and is not charged again',             r.charged, false);
end $$;

-- ── the token memory is bounded, and it is the OLDEST that falls out ─────
do $$
declare r record; runs text[];
begin
  select recent_runs into runs from public.guest_trials
   where route = '/steel/beam'
     and subject = 'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111';
  perform pg_temp.check('memory is capped at 4', array_length(runs, 1), 4);
  perform pg_temp.check('newest token is first', runs[1], 'run-token-0005');
  -- token 0001 was five arrivals ago and must have aged out
  perform pg_temp.check('oldest token forgotten', 'run-token-0001' = any(runs), false);
end $$;

-- ── routes are counted separately ────────────────────────────────────────
do $$
declare r record;
begin
  select * into r from public.claim_guest_run(
    'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    '/steel/column', 'other-route-tok', 5, 60);
  perform pg_temp.check('a different calculator has its own allowance', r.allowed, true);
  perform pg_temp.check('and starts at one',                            r.used,    1);
end $$;

-- ── subjects are counted separately ──────────────────────────────────────
do $$
declare r record;
begin
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', 'run-token-0001', 5, 60);
  perform pg_temp.check('another visitor is unaffected', r.allowed, true);
  perform pg_temp.check('and starts at one',             r.used,    1);
end $$;

-- ── a missing token spends a run every time, never grants one ────────────
do $$
declare r record;
begin
  truncate public.guest_trials;
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', null, 2, 60);
  perform pg_temp.check('no token: first is allowed', r.allowed, true);
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', null, 2, 60);
  perform pg_temp.check('no token: second is allowed', r.allowed, true);
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', null, 2, 60);
  perform pg_temp.check('no token: third is refused',  r.allowed, false);
end $$;

-- A token too short to be worth remembering is treated as no token at all,
-- so it cannot be used to dodge the counter with a 1-char string.
do $$
declare r record;
begin
  truncate public.guest_trials;
  perform public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', 'x', 5, 60);
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/steel/beam', 'x', 5, 60);
  perform pg_temp.check('a 1-char token charges every time', r.used, 2);
end $$;

-- ── malformed input is refused, not stored ───────────────────────────────
do $$
declare r record;
begin
  select * into r from public.claim_guest_run('too-short', '/steel/beam', 'tok-12345678', 5, 60);
  perform pg_temp.check('short subject refused', r.reason, 'bad-subject');
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    repeat('x', 65), 'tok-12345678', 5, 60);
  perform pg_temp.check('over-long route refused', r.reason, 'bad-route');
end $$;

-- ── the distinct-route cap is the only bound on row growth ───────────────
do $$
declare r record; i int;
begin
  truncate public.guest_trials;
  for i in 1..3 loop
    perform public.claim_guest_run(
      'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
      '/route-' || i, 'tok-1234567' || i, 5, 3);
  end loop;
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/route-4', 'tok-12345674', 5, 3);
  perform pg_temp.check('a fourth route past the cap is refused', r.reason, 'route-cap');
  select * into r from public.claim_guest_run(
    'cccccccc11111111cccccccc11111111cccccccc11111111cccccccc11111111',
    '/route-2', 'tok-fresh-002', 5, 3);
  perform pg_temp.check('an already-open route still works at the cap', r.allowed, true);
end $$;

-- ── the table itself stays unreachable ───────────────────────────────────
do $$
declare ok boolean;
begin
  select has_table_privilege('anon', 'public.guest_trials', 'select') into ok;
  perform pg_temp.check('anon cannot read guest_trials', ok, false);
  select has_table_privilege('anon', 'public.guest_trials', 'update') into ok;
  perform pg_temp.check('anon cannot write guest_trials', ok, false);
  select has_function_privilege('anon',
    'public.claim_guest_run(text,text,text,integer,integer)', 'execute') into ok;
  perform pg_temp.check('anon may call claim_guest_run', ok, true);
  select has_function_privilege('anon', 'public.consume_guest_trial(text,text,integer)', 'execute') into ok;
  perform pg_temp.check('anon still may NOT call consume_guest_trial', ok, false);
end $$;

truncate public.guest_trials;
select 'claim_guest_run spec passed' as result;
