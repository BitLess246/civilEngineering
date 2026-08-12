-- ─────────────────────────────────────────────────────────────────────────
-- CLAIMING A RUN — the half of the trial counter that can actually REFUSE.
--
-- `consume_guest_trial` (20260804000000) only ever RECORDS. The browser asked
-- it to count a run and then decided for itself whether to show the page, so
-- the count was advisory: anyone who never called it had an unlimited
-- allowance, and the calculation happened in their browser regardless.
--
-- The calculation now happens in a Vercel Edge function, so there is finally
-- something to withhold. This function is what withholds it: it answers
-- "may this subject start a run of this route?" and charges the allowance in
-- the same statement, under the row lock, so two tabs cannot both be told yes
-- on the last remaining run.
--
-- ── WHAT A "RUN" IS ──────────────────────────────────────────────────────
-- One ARRIVAL at a calculator page, not one computation. The pages recompute
-- on a 250 ms debounce every time a field changes, so charging per request
-- would burn a five-run allowance in about a second of typing. The caller
-- therefore names each run with an opaque token, and this function counts
-- DISTINCT tokens:
--
--   • token already seen for this row → same run. Allowed, not charged.
--   • token not seen → a new run. Charged, and refused when the allowance is
--     spent.
--
-- Replaying one token forever is therefore "one run", which is exactly what a
-- visitor who leaves the tab open already gets. Getting a SECOND run means
-- presenting a second token, and that is what runs the counter down. The limit
-- this enforces is five ARRIVALS, which is precisely what the pricing page
-- promises — no more, and no longer any less.
--
-- `recent_runs` keeps the last few tokens rather than only the current one, so
-- a visitor with two tabs open on the same calculator, alternating between
-- them, is not charged a fresh run on every switch.
--
-- ── WHY anon MAY EXECUTE THIS ────────────────────────────────────────────
-- `guest_trials` is unreachable by anon and authenticated (no RLS policies,
-- grants revoked) and that has not changed. What is granted here is EXECUTE on
-- this one SECURITY DEFINER function, so the Edge function can call it with
-- the ANON KEY and no service-role key has to exist in the Vercel environment.
--
-- That grant is safe because of what the function will and will not do:
--   • it returns only the counts for the subject the caller names, never a
--     listing, never another subject's row, never the digests themselves;
--   • `p_subject` is a SALTED digest (see api/_lib/subject.ts). The salt lives
--     only in the server environment, so a browser holding the anon key cannot
--     compute its own subject, let alone anyone else's. The best it can do is
--     spend runs belonging to a random 64-hex string.
-- Row growth from someone doing exactly that is bounded per subject by p_cap
-- and swept by `prune_guest_trials`.
-- ─────────────────────────────────────────────────────────────────────────

-- Tokens seen recently for this (subject, route). Bounded by the function
-- below; the column default keeps every existing row valid.
alter table public.guest_trials
  add column if not exists recent_runs text[] not null default '{}';

-- How many tokens to remember per row. Two open tabs is the case this covers;
-- four leaves room for a third and a stale one without letting the array grow
-- into storage.
create or replace function public.guest_run_memory() returns integer
  language sql immutable as $$ select 4 $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Returns one row:
--   allowed  — may the caller compute?
--   charged  — did this call spend a run? (false when replaying a token)
--   used     — runs spent on this route after the call
--   reason   — why not, when allowed is false
--
-- A token longer than 64 chars, or absent, is treated as a NEW run every time.
-- That is the strict direction: stripping the header does not buy anything, it
-- just spends the allowance faster.
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
begin
  if p_subject is null or char_length(p_subject) <> 64 then
    return query select false, false, 0, 'bad-subject'::text; return;
  end if;
  if p_route is null or char_length(p_route) not between 1 and 64 then
    return query select false, false, 0, 'bad-route'::text; return;
  end if;

  -- A token we are willing to remember. Anything else counts as "no token",
  -- which means every request is its own run.
  token := case
    when p_run is not null and char_length(p_run) between 8 and 64 then p_run
    else null
  end;

  -- Lock the row for the whole decision. Without FOR UPDATE two tabs can both
  -- read used = 4 and both be told yes, handing out a sixth run.
  -- Every column is qualified through `gt`: this function RETURNS TABLE with a
  -- column called `used`, which otherwise shadows `guest_trials.used` and makes
  -- the reference ambiguous at run time rather than at create time.
  select gt.used, gt.recent_runs into row_used, row_runs
    from public.guest_trials gt
   where gt.subject = p_subject and gt.route = p_route
     for update;

  -- Known token on an existing row: the same run continuing. Already paid for.
  if found and token is not null and token = any(row_runs) then
    update public.guest_trials set last_seen = now()
     where subject = p_subject and route = p_route;
    return query select true, false, row_used, null::text; return;
  end if;

  -- From here it is a NEW run and has to be paid for.
  if found then
    if row_used >= p_limit then
      return query select false, false, row_used, 'exhausted'::text; return;
    end if;
    update public.guest_trials
       set used        = public.guest_trials.used + 1,
           last_seen   = now(),
           -- newest first, oldest dropped past the memory window. WITH
           -- ORDINALITY because array_agg over a bare unnest has no defined
           -- order to rely on.
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

  -- No row yet: this subject's first run of this route. Cap the number of
  -- DISTINCT routes one subject may open, which is the only way this table can
  -- be made to grow. Nobody legitimately opens sixty calculators as a guest.
  select count(*) into distinct_rts from public.guest_trials where subject = p_subject;
  if distinct_rts >= p_cap then
    return query select false, false, 0, 'route-cap'::text; return;
  end if;

  if p_limit < 1 then
    return query select false, false, 0, 'exhausted'::text; return;
  end if;

  -- ON CONFLICT covers the race with another request inserting the same row
  -- between the SELECT above and here; the conflicting update takes the same
  -- +1 the branch above would have.
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

-- The table stays unreachable; only this entry point is exposed, and only to
-- callers who can already produce a valid salted subject.
revoke all on function public.claim_guest_run(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_guest_run(text, text, text, integer, integer)
  to anon, authenticated;

revoke all on function public.guest_run_memory() from public, anon, authenticated;
