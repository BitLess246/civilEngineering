-- ─────────────────────────────────────────────────────────────────────────
-- The project ceiling was countable around. This closes it.
--
-- THE BUG. `20260804010000_projects.sql` enforces the plan limit inside the
-- INSERT policy:
--
--   with check (auth.uid() = user_id
--               and (project_limit() is null or project_count() < project_limit()))
--
-- `project_count()` is a `STABLE` function, so within one command it sees the
-- snapshot as of the START of that command and cannot see rows the command
-- itself is inserting. Postgres evaluates the `with check` clause once per row,
-- but every one of those evaluations reads the same pre-statement count. For a
-- SINGLE-row insert that is correct. For a MULTI-row insert it is not: an
-- account holding zero projects gets `0 < 3` for row 1 and, identically, for
-- row 100.
--
-- That shape is not exotic — it is exactly what PostgREST emits when the
-- request body is a JSON array, so a browser holding the anon key and a session
-- reaches it with one fetch. Reproduced on Postgres 16: four separate inserts
-- stop at three; one array insert of a hundred admits all hundred.
--
-- `VOLATILE` DOES NOT FIX IT. The tempting one-word change is wrong for a
-- reason worth writing down: the invisibility here is not about caching, it is
-- MVCC command-id visibility. Rows written by the current command carry that
-- command's cmin and are not visible to a query running inside it, no matter
-- how often the function is re-evaluated. A volatile `project_count()` runs a
-- hundred times and returns 0 a hundred times.
--
-- THE FIX: check AFTER the rows land. A constraint trigger fires at the end of
-- the statement, when the inserted rows are visible to an ordinary count, so
-- the ceiling is tested against the real post-insert total exactly once per
-- row instead of against a stale snapshot.
--
-- THE RLS POLICY STAYS AS IT IS. Both halves earn their place:
--   • `auth.uid() = user_id` is the ownership boundary and has nothing to do
--     with counting — removing it would let any signed-in account plant rows
--     under somebody else's id.
--   • the count in the policy is now a fast path, not the enforcement. It
--     refuses the ordinary single-row over-limit save with 42501 before a row
--     is ever written, which is cheaper and gives the client the error it
--     already knows how to translate.
-- The trigger is what makes the ceiling true; the policy is what makes the
-- common refusal cheap.
--
-- See `project_limit.spec.sql` for the executable version of all of this.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cap integer;
  n   integer;
begin
  -- No authenticated user means row level security was bypassed, and only the
  -- service role can do that. Server-side imports, restores and migrations are
  -- not what the paywall is for. Note that `anon` cannot reach here: the INSERT
  -- policy requires `auth.uid() = user_id`, and NULL never equals a uuid.
  if auth.uid() is null then return null; end if;

  cap := public.project_limit();
  if cap is null then return null; end if;   -- pro / max: no ceiling

  -- Counted for the row's OWNER rather than for the caller. Under the INSERT
  -- policy the two are always the same; being explicit means the trigger is
  -- still correct if that policy is ever relaxed.
  select count(*) into n from public.projects where user_id = new.user_id;

  if n > cap then
    raise exception 'project limit reached'
      using errcode = 'check_violation',
            detail  = format('%s saved projects, plan allows %s', n, cap),
            hint    = 'Delete a project, or move to a plan without a limit.';
  end if;

  return null;   -- AFTER trigger: the return value is ignored
end $$;

-- CONSTRAINT TRIGGER, not a plain AFTER trigger. Both would see the new rows,
-- but a constraint trigger is deferrable, which is what lets a future
-- multi-statement transaction (a restore, say) defer the check to COMMIT
-- without this migration having to be revisited. `initially immediate` keeps
-- today's behaviour: the check runs at the end of the statement.
drop trigger if exists projects_limit on public.projects;
create constraint trigger projects_limit
  after insert on public.projects
  deferrable initially immediate
  for each row execute function public.enforce_project_limit();
