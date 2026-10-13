-- ─────────────────────────────────────────────────────────────────────────
-- Behavioural spec for `apply_billing_event`, runnable against a throwaway
-- Postgres. Outside Supabase, stub the parts it relies on first:
--
--   create role anon; create role authenticated; create role service_role;
--   create schema auth;
--   create table auth.users (id uuid primary key, raw_app_meta_data jsonb);
--   psql -v ON_ERROR_STOP=1 -f 20261013000000_apply_billing_event.sql
--   psql -v ON_ERROR_STOP=1 -f apply_billing_event.spec.sql
--
-- The concurrency half is `apply_billing_event_race.spec.sh` — a race needs
-- two sessions, and a psql script is one.
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

delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
insert into auth.users values ('00000000-0000-0000-0000-0000000000b1',
  '{"provider":"email","providers":["email"]}');

do $$
declare u uuid := '00000000-0000-0000-0000-0000000000b1'; m jsonb;
begin
  perform pg_temp.check('first event applied',
    public.apply_billing_event(u, 'evt_1', 'pro', '2026-10-01T12:00:00Z', 'ctm_1', 'sub_1'), 'applied');
  select raw_app_meta_data into m from auth.users where id = u;
  perform pg_temp.check('plan written', m->>'plan', 'pro');
  perform pg_temp.check('Supabase provider keys survive', m->>'provider', 'email');
  perform pg_temp.check('customer id kept', m->>'paddle_customer_id', 'ctm_1');

  perform pg_temp.check('same event again is a duplicate',
    public.apply_billing_event(u, 'evt_1', 'pro', '2026-10-01T12:00:00Z'), 'duplicate');

  perform pg_temp.check('later cancel applied',
    public.apply_billing_event(u, 'evt_2', 'free', '2026-10-01T12:05:00Z'), 'applied');
  select raw_app_meta_data into m from auth.users where id = u;
  perform pg_temp.check('cancel without ids keeps the customer id', m->>'paddle_customer_id', 'ctm_1');

  -- the redelivered purchase: a different id from the last applied one, but older
  perform pg_temp.check('redelivered older purchase is stale',
    public.apply_billing_event(u, 'evt_1', 'pro', '2026-10-01T12:00:00Z'), 'stale');
  select raw_app_meta_data into m from auth.users where id = u;
  perform pg_temp.check('plan stays cancelled', m->>'plan', 'free');

  -- same instant, different event: allowed
  perform pg_temp.check('equal timestamp, distinct event applied',
    public.apply_billing_event(u, 'evt_3', 'max', '2026-10-01T12:05:00Z'), 'applied');

  -- precision differences compare as instants, not strings
  perform pg_temp.check('coarser precision of an older instant is stale',
    public.apply_billing_event(u, 'evt_4', 'pro', '2026-10-01T12:04:59.999999Z'), 'stale');

  -- an event with no timestamp applies and does not erase the watermark
  perform pg_temp.check('untimed event applied',
    public.apply_billing_event(u, 'evt_5', 'pro', null), 'applied');
  select raw_app_meta_data into m from auth.users where id = u;
  perform pg_temp.check('watermark survives an untimed event', m->>'billing_event_at', '2026-10-01T12:05:00.000000Z');

  perform pg_temp.check('unknown user',
    public.apply_billing_event('00000000-0000-0000-0000-00000000dead', 'evt_9', 'pro', null), 'no-user');

  begin
    perform public.apply_billing_event(u, 'evt_6', 'enterprise', null);
    raise exception 'FAIL bad plan accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'ok   bad plan refused';
  end;
end $$;

-- only the service role may call it
do $$
begin
  perform pg_temp.check('anon cannot execute',
    has_function_privilege('anon', 'public.apply_billing_event(uuid,text,text,timestamptz,text,text)', 'execute'), false);
  perform pg_temp.check('authenticated cannot execute',
    has_function_privilege('authenticated', 'public.apply_billing_event(uuid,text,text,timestamptz,text,text)', 'execute'), false);
  perform pg_temp.check('service_role can execute',
    has_function_privilege('service_role', 'public.apply_billing_event(uuid,text,text,timestamptz,text,text)', 'execute'), true);
end $$;
