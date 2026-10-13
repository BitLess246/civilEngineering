-- ─────────────────────────────────────────────────────────────────────────
-- APPLY A BILLING EVENT ATOMICALLY (GEN-05).
--
-- The webhook used to read app_metadata over the Auth admin API, run its
-- duplicate and ordering checks in the function, then write the whole object
-- back. Two deliveries for one user — which Paddle produces routinely: a
-- `subscription.created` and a `transaction.completed` seconds apart, or a
-- retry overlapping a new event — could both read the SAME metadata, both pass,
-- and the later WRITE won regardless of which event HAPPENED later. A cancel
-- landing a few milliseconds before a delayed redelivery of the purchase left
-- the account on the paid plan.
--
-- This moves read-check-write into one transaction behind a row lock on the
-- user, so concurrent deliveries for one user serialise: the second waits for
-- the first to commit, then checks against what the first wrote.
--
--   'duplicate' — this event id is the last one applied (a provider retry)
--   'stale'     — the event happened before the last applied one
--   'applied'   — written
--   'no-user'   — no such account
--
-- Ordering compares timestamps as timestamptz, not text: the old JS compare
-- relied on fixed-width ISO strings, which a provider changing its fractional
-- precision would break, and text comparison under a non-C collation is not
-- character order at all.
--
-- The merge is `||` (top-level spread), so Supabase's own `provider` and
-- `providers` keys survive, and null arguments are stripped so an event that
-- carries no customer/subscription id cannot blank out an earlier one.
--
-- Callable by the service role only.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.apply_billing_event(
  p_user            uuid,
  p_event_id        text,
  p_plan            text,
  p_occurred_at     timestamptz default null,
  p_customer_id     text default null,
  p_subscription_id text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta    jsonb;
  last_at timestamptz;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200 then
    raise exception 'apply_billing_event: bad event id';
  end if;
  if p_plan is null or p_plan not in ('free', 'pro', 'max') then
    raise exception 'apply_billing_event: bad plan %', p_plan;
  end if;

  select coalesce(raw_app_meta_data, '{}'::jsonb) into meta
  from auth.users where id = p_user
  for update;
  if not found then return 'no-user'; end if;

  if meta->>'billing_event_id' = p_event_id then return 'duplicate'; end if;

  -- A malformed stored watermark must not wedge the account: treat it as absent.
  begin
    last_at := (meta->>'billing_event_at')::timestamptz;
  exception when others then
    last_at := null;
  end;
  -- Strictly older is refused; equal is allowed (two distinct events can share
  -- a timestamp, and a true redelivery was caught by the id check above).
  if p_occurred_at is not null and last_at is not null and p_occurred_at < last_at then
    return 'stale';
  end if;

  update auth.users
  set raw_app_meta_data = meta || jsonb_strip_nulls(jsonb_build_object(
        'plan',                   p_plan,
        'billing_event_id',       p_event_id,
        'billing_updated_at',     to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'billing_event_at',       to_char(p_occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'paddle_customer_id',     p_customer_id,
        'paddle_subscription_id', p_subscription_id
      ))
  where id = p_user;
  return 'applied';
end $$;

revoke all on function public.apply_billing_event(uuid, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_billing_event(uuid, text, text, timestamptz, text, text)
  to service_role;
