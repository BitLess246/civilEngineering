-- ─────────────────────────────────────────────────────────────────────────
-- Guest trial counts — the server's copy, so clearing the browser does not
-- hand out a fresh allowance.
--
-- The counter used to live only in localStorage. Anything the browser stores,
-- the browser can drop: "clear site data" reset every calculator to five more
-- free runs. This table is the durable half.
--
-- NO RLS POLICIES, DELIBERATELY. RLS is enabled and NOT ONE policy is defined,
-- which in Postgres means anon and authenticated can do nothing at all here —
-- no select, no insert, no update. The only writer is the `guest-quota` Edge
-- Function, which holds the service-role key and bypasses RLS. A guest must
-- not be able to read the table (it would expose every subject digest) and
-- above all must not be able to write it (that is the counter itself).
--
-- WHAT `subject` IS. A salted SHA-256 over the client IP and a coarse
-- browser/platform token — see supabase/functions/_shared/guestSubject.ts for
-- the derivation and for what it does and does not identify. It is NOT an
-- account, NOT reversible without the salt, and NOT a promise of uniqueness:
-- an office behind one NAT shares a row, and a VPN makes a new one.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.guest_trials (
  -- 64 hex chars of SHA-256. Stored as text so it is greppable in psql; the
  -- length check is what stops the column being used as free storage.
  subject    text        not null check (char_length(subject) = 64),
  route      text        not null check (char_length(route) between 1 and 64),
  used       integer     not null default 0 check (used >= 0),
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (subject, route)
);

-- The only query besides the primary-key lookup is "how many routes has this
-- subject touched?", used to cap row growth per subject.
create index if not exists guest_trials_subject_idx on public.guest_trials (subject);

-- Retention: a trial count is worthless once the visitor is long gone, and
-- keeping IP-derived digests forever is not defensible for a five-run counter.
create index if not exists guest_trials_last_seen_idx on public.guest_trials (last_seen);

alter table public.guest_trials enable row level security;

-- Belt and braces beside the empty policy list: revoke the grants the `public`
-- role gets by default, so the table is unreachable even if a future migration
-- adds a permissive policy by accident.
revoke all on public.guest_trials from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Consuming one trial run, ATOMICALLY.
--
-- The obvious implementation — read `used`, add one, write it back — loses
-- increments whenever two tabs run a calculator at the same moment: both read
-- 2, both write 3, and one run is free. `on conflict do update set used =
-- guest_trials.used + 1` is done inside the row lock, so it cannot.
--
-- Returns the new count, or -1 when the subject has already opened
-- `p_cap` distinct routes (the only way this table can be made to grow).
-- That check is a SOFT cap: it races with a concurrent insert of a new route,
-- which at worst admits an extra row or two and is not worth a table lock.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.consume_guest_trial(
  p_subject text, p_route text, p_cap integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  distinct_routes integer;
  new_used integer;
begin
  select count(*) into distinct_routes from public.guest_trials where subject = p_subject;

  if distinct_routes >= p_cap
     and not exists (select 1 from public.guest_trials
                     where subject = p_subject and route = p_route) then
    return -1;
  end if;

  insert into public.guest_trials (subject, route, used)
  values (p_subject, p_route, 1)
  on conflict (subject, route) do update
    set used = public.guest_trials.used + 1,
        last_seen = now()
  returning used into new_used;

  return new_used;
end;
$$;

revoke all on function public.consume_guest_trial(text, text, integer)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Pruning.
--
-- SECURITY DEFINER so it can delete despite RLS, but EXECUTE is granted to
-- nobody — it is called by a scheduler or by hand with the service role, never
-- from the browser. `search_path` is pinned because a SECURITY DEFINER
-- function that resolves names through the caller's search_path is a
-- privilege-escalation hole.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.prune_guest_trials(older_than interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.guest_trials where last_seen < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_guest_trials(interval) from public, anon, authenticated;

-- Schedule it if pg_cron is enabled on the project (Database → Extensions):
--
--   select cron.schedule('prune-guest-trials', '17 3 * * *',
--                        $$select public.prune_guest_trials()$$);
--
-- Without pg_cron the table simply grows slowly; run the function by hand from
-- the SQL editor now and then.
