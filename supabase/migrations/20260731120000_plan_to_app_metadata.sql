-- ─────────────────────────────────────────────────────────────────────────
-- Move the subscription plan from user_metadata to app_metadata.
--
-- WHY. `raw_user_meta_data` is writable by the account itself — a signed-in
-- user can run `supabase.auth.updateUser({ data: { plan: 'max' } })` from a
-- browser console and the app would believe them. `raw_app_meta_data` is
-- writable only with the service-role key, which lives in the billing webhook
-- and nowhere else.
--
-- The client now reads app_metadata with NO FALLBACK to user_metadata, so this
-- migration must run for existing paying users to keep their plan.
--
-- Safe to re-run: it copies only where a plan exists and app_metadata does not
-- already carry one, so a second run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────

update auth.users
set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
           'plan',               raw_user_meta_data->>'plan',
           'billing_event_id',   raw_user_meta_data->>'billing_event_id',
           'billing_updated_at', raw_user_meta_data->>'billing_updated_at'
         ))
where raw_user_meta_data ? 'plan'
  and coalesce(raw_app_meta_data->>'plan', '') = '';

-- Then remove the old copy, so nothing reads a stale plan and no user can
-- resurrect one by editing their own metadata.
--
-- Runs SECOND and separately: if the copy above failed, this would otherwise
-- delete the only record of what people had paid for.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'plan' - 'billing_event_id' - 'billing_updated_at'
where raw_user_meta_data ? 'plan'
  and raw_app_meta_data->>'plan' is not null;

-- Check afterwards — every row should show the plan under app, and nothing
-- under user:
--
--   select email,
--          raw_app_meta_data->>'plan'  as app_plan,
--          raw_user_meta_data->>'plan' as user_plan
--   from auth.users
--   order by email;
