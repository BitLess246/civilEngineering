-- ─────────────────────────────────────────────────────────────────────────
-- ONE RUN TOKEN, ONE CHARGE — including when two callers race the insert.
--
-- `claim_guest_run` is idempotent per run token: present the same token twice
-- and the second call is allowed without being charged. That is what stops a
-- calculator recomputing on every keystroke from spending the allowance in a
-- second, and it is honoured on the path where the row already exists:
--
--   if found and token is not null and token = any(row_runs) then …not charged…
--
-- THE INSERT PATH DID NOT HONOUR ANY OF IT. With no row yet, the function
-- inserted with `on conflict (subject, route) do update set used = used + 1`,
-- and that conflicting update:
--
--   1. charged unconditionally, without checking whether the existing row
--      already remembers this token — so two callers presenting the SAME token,
--      both finding no row, both reaching the insert, produce used = 2 for one
--      arrival;
--   2. skipped the `row_used >= eff_limit` check that the found path makes, so
--      the same race could record a SIXTH run past a five-run ceiling;
--   3. overwrote `recent_runs` with `excluded.recent_runs` — just the incoming
--      token — discarding up to four remembered tokens, which is the multi-tab
--      memory `guest_run_memory()` exists to provide.
--
-- WHY THAT WINDOW JUST GOT WIDE. Until now the two halves of the counter used
-- different functions: the browser's `guest-quota` called
-- `consume_guest_trial`, the calculation endpoint called `claim_guest_run`.
-- They double-charged every arrival on the three API-served calculators, which
-- is fixed by pointing both at `claim_guest_run` with the same run token. That
-- makes two concurrent first-claims for one arrival the NORMAL case rather than
-- a curiosity — both are triggered by the same page load — so the insert path
-- has to honour the token, or the double charge just moves into a race.
--
-- ── HOW ──────────────────────────────────────────────────────────────────
-- The clever fix is to make the `on conflict do update` clause token-aware.
-- The correct fix is to not have two places that decide: insert with
-- `on conflict do nothing`, and if the row turned out to exist, go round the
-- loop so the FOUND path decides. That path already honours the token, the
-- limit and the memory, and now it is the only code that does.
--
-- The loop is the standard upsert idiom and terminates: after a conflict the
-- row exists, and the `for update` at the top of the next pass blocks on the
-- inserting transaction rather than spinning. A second pass is the practical
-- maximum — a third would need the row deleted mid-flight, which only
-- `prune_guest_trials` does, on a retention schedule.
--
-- Nothing else changes: the clamps, the ceilings and the table backstop from
-- 20260813010000 are carried through unaltered.
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

  eff_limit := least(greatest(coalesce(p_limit, public.guest_run_limit()), 0), public.guest_run_limit());
  eff_cap   := least(greatest(coalesce(p_cap,   public.guest_route_cap()), 1), public.guest_route_cap());

  token := case
    when p_run is not null and char_length(p_run) between 8 and 64 then p_run
    else null
  end;

  loop
    -- Lock the row for the whole decision. Without FOR UPDATE two tabs can both
    -- read used = 4 and both be told yes, handing out a sixth run.
    select gt.used, gt.recent_runs into row_used, row_runs
      from public.guest_trials gt
     where gt.subject = p_subject and gt.route = p_route
       for update;

    if found then
      -- Known token: the same run continuing. Already paid for.
      if token is not null and token = any(row_runs) then
        update public.guest_trials set last_seen = now()
         where subject = p_subject and route = p_route;
        return query select true, false, row_used, null::text; return;
      end if;

      -- A NEW run, and it has to be paid for.
      if row_used >= eff_limit then
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

    -- No row yet: this subject's first run of this route, and the only branch
    -- that GROWS the table — so it carries both bounds.
    select count(*) into distinct_rts from public.guest_trials where subject = p_subject;
    if distinct_rts >= eff_cap then
      return query select false, false, 0, 'route-cap'::text; return;
    end if;

    -- ALLOWED, not refused: a full table is our problem, not the visitor's.
    if public.guest_trials_full() then
      return query select true, false, 0, 'table-full'::text; return;
    end if;

    if eff_limit < 1 then
      return query select false, false, 0, 'exhausted'::text; return;
    end if;

    insert into public.guest_trials (subject, route, used, recent_runs)
    values (p_subject, p_route, 1,
            case when token is null then '{}'::text[] else array[token] end)
    on conflict (subject, route) do nothing;

    if found then
      return query select true, true, 1, null::text; return;
    end if;

    -- The row was created by another caller between the SELECT and the INSERT.
    -- Round again: the row exists now, so the FOUND path above decides, which
    -- is the one that honours the token, the ceiling and the memory.
  end loop;
end;
$$;

revoke all on function public.claim_guest_run(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_guest_run(text, text, text, integer, integer)
  to anon, authenticated;
