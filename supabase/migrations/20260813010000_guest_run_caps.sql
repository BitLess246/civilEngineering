-- ─────────────────────────────────────────────────────────────────────────
-- THE GUEST COUNTER SET ITS OWN CEILING.
--
-- `claim_guest_run` takes `p_limit` and `p_cap` as arguments and trusts them.
-- The caller is the Edge function — but it calls PostgREST with the ANON KEY,
-- and the anon key is inlined into the JavaScript every visitor downloads. Any
-- browser can therefore POST to /rest/v1/rpc/claim_guest_run with
-- `p_limit: 2000000000` and be told yes forever.
--
-- WHAT SAVED IT UNTIL NOW, and why that is not enough. `p_subject` is a salted
-- digest and the salt is server-only, so a browser cannot compute the subject
-- the endpoint would use for it. Raising `p_limit` therefore raises the
-- allowance of a subject the attacker cannot occupy — the exploit needs the
-- salt. That is a real mitigation and it is the wrong thing to rely on: it
-- makes the ceiling depend on a secret staying secret, when the ceiling costs
-- nothing to enforce directly. Two named arguments in a public RPC signature
-- are inputs, and inputs get validated.
--
-- SO THE CEILINGS MOVE SERVER-SIDE. `p_limit` and `p_cap` remain in the
-- signature — removing them would break the deployed Edge function mid-rollout
-- — but they can now only ever LOWER the effective value. A caller may ask for
-- less. It may not ask for more.
--
-- ── AND ONE THING THE CLAMP DOES NOT FIX ─────────────────────────────────
-- `p_cap` bounds distinct routes PER SUBJECT. It has never bounded the number
-- of SUBJECTS, and subjects are 64 hex characters that anyone may invent. A
-- caller with the anon key can open one row per made-up subject and never
-- approach any per-subject cap, so the table's growth was bounded by nothing at
-- all. Clamping `p_cap` does not touch that, and it would be easy to ship the
-- clamp and believe otherwise.
--
-- `guest_trials_full()` is the bound that does apply: above a whole-table
-- ceiling, no NEW subject may open its first row. It reads `pg_class.reltuples`
-- rather than counting, because a `count(*)` on every first-run insert is a
-- sequential scan on the hot path. That estimate lags autovacuum, so the
-- ceiling is approximate — appropriate for a backstop measured in hundreds of
-- thousands of rows, and not something to build a precise quota on.
--
-- IT FAILS OPEN, deliberately, and consistently with `api/_lib/quota.ts`:
-- hitting the ceiling returns allowed = true with reason 'table-full'. A full
-- table is our problem, not the visitor's, and refusing to run a free
-- calculator because our storage backstop tripped breaks the shop window to
-- defend a five-run courtesy. The endpoint surfaces it as a degraded header so
-- the condition is visible rather than silently generous.
--
-- ── NOTE ON THE DIGEST CHANGE SHIPPING ALONGSIDE THIS ────────────────────
-- The same change removes the User-Agent from the subject derivation (see
-- `api/_lib/subject.ts`), so every subject digest is different from today's.
-- Existing `guest_trials` rows become unreachable: they are never matched
-- again, and `prune_guest_trials` sweeps them on the retention schedule. That
-- costs one fresh allowance per existing guest, which is why this lands BEFORE
-- `GUEST_TRIAL_SALT` is set and the gate starts enforcing — right now the rows
-- being orphaned are counts nothing was refusing on.
-- ─────────────────────────────────────────────────────────────────────────

-- The real ceilings, in one place. `immutable` so the planner can fold them,
-- and mirrored by GUEST_TRIAL_LIMIT / ROUTE_CAP_PER_SUBJECT on the TypeScript
-- side — `guestCaps.test.ts` reads this file and fails if they disagree.
create or replace function public.guest_run_limit() returns integer
  language sql immutable as $$ select 5 $$;

create or replace function public.guest_route_cap() returns integer
  language sql immutable as $$ select 60 $$;

-- Rows this table may hold before it stops accepting new subjects. Sized so a
-- real visitor population never meets it: at ~5 routes per subject this is
-- 100k distinct guests.
create or replace function public.guest_trials_max_rows() returns bigint
  language sql immutable as $$ select 500000::bigint $$;

/**
 * Is the table over its backstop ceiling?
 *
 * `reltuples` is the planner's estimate, maintained by autovacuum, and is -1 on
 * a table that has never been analysed — treated as "not full", since a table
 * nobody has analysed is a table with nothing in it.
 */
create or replace function public.guest_trials_full() returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.reltuples from pg_class c
      where c.oid = 'public.guest_trials'::regclass), -1) >= public.guest_trials_max_rows()::real
$$;

revoke all on function public.guest_run_limit() from public, anon, authenticated;
revoke all on function public.guest_route_cap() from public, anon, authenticated;
revoke all on function public.guest_trials_max_rows() from public, anon, authenticated;
revoke all on function public.guest_trials_full() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Republished with the ceilings clamped. The body is otherwise the function
-- from 20260812000000; the differences are the two `least(...)` lines below and
-- the table-full branch on the insert path.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.claim_guest_run(
  p_subject text,
  p_route   text,
  p_run     text,
  p_limit   integer default 5,
  p_cap     integer default 60
)
returns table (allowed boolean, charged boolean, used integer, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_used     integer;
  row_runs     text[];
  token        text;
  distinct_rts integer;
  eff_limit    integer;
  eff_cap      integer;
begin
  if p_subject is null or char_length(p_subject) <> 64 then
    return query select false, false, 0, 'bad-subject'::text; return;
  end if;
  if p_route is null or char_length(p_route) not between 1 and 64 then
    return query select false, false, 0, 'bad-route'::text; return;
  end if;

  -- THE CLAMP. A caller may ask for a smaller allowance than the plan gives —
  -- useful for a staging deployment, and harmless — but never a larger one.
  -- `greatest(…, 0)` keeps a negative or null argument from reading as
  -- unlimited via some later comparison; 0 means "no runs", which is a coherent
  -- request and is handled below.
  eff_limit := least(greatest(coalesce(p_limit, public.guest_run_limit()), 0), public.guest_run_limit());
  eff_cap   := least(greatest(coalesce(p_cap,   public.guest_route_cap()), 1), public.guest_route_cap());

  token := case
    when p_run is not null and char_length(p_run) between 8 and 64 then p_run
    else null
  end;

  select gt.used, gt.recent_runs into row_used, row_runs
    from public.guest_trials gt
   where gt.subject = p_subject and gt.route = p_route
     for update;

  if found and token is not null and token = any(row_runs) then
    update public.guest_trials set last_seen = now()
     where subject = p_subject and route = p_route;
    return query select true, false, row_used, null::text; return;
  end if;

  if found then
    if row_used >= eff_limit then
      return query select false, false, row_used, 'exhausted'::text; return;
    end if;
    update public.guest_trials
       set used        = public.guest_trials.used + 1,
           last_seen   = now(),
           recent_runs = (
             select coalesce(array_agg(t order by ord), '{}'::text[])
               from (
                 select u.t, u.ord
                   from unnest(array_prepend(coalesce(token, ''), row_runs))
                        with ordinality as u(t, ord)
                  where u.t <> ''
                  order by u.ord
                  limit public.guest_run_memory()
               ) keep
           )
     where public.guest_trials.subject = p_subject
       and public.guest_trials.route   = p_route
     returning public.guest_trials.used into row_used;
    return query select true, true, row_used, null::text; return;
  end if;

  -- No row yet. This is the only branch that GROWS the table, so it carries
  -- both bounds: the per-subject route cap, and the whole-table backstop that
  -- the route cap cannot provide because subjects are caller-invented.
  select count(*) into distinct_rts from public.guest_trials where subject = p_subject;
  if distinct_rts >= eff_cap then
    return query select false, false, 0, 'route-cap'::text; return;
  end if;

  -- ALLOWED, not refused. See the header: a full table is our problem. The
  -- visitor computes and simply is not counted, and the endpoint reports the
  -- condition so it is visible.
  if public.guest_trials_full() then
    return query select true, false, 0, 'table-full'::text; return;
  end if;

  if eff_limit < 1 then
    return query select false, false, 0, 'exhausted'::text; return;
  end if;

  insert into public.guest_trials (subject, route, used, recent_runs)
  values (p_subject, p_route, 1,
          case when token is null then '{}'::text[] else array[token] end)
  on conflict (subject, route) do update
     set used        = public.guest_trials.used + 1,
         last_seen   = now(),
         recent_runs = excluded.recent_runs
  returning public.guest_trials.used into row_used;

  return query select true, true, row_used, null::text;
end;
$$;

revoke all on function public.claim_guest_run(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_guest_run(text, text, text, integer, integer)
  to anon, authenticated;
