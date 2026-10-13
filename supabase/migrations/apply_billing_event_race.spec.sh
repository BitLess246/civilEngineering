#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Concurrency spec for `apply_billing_event` (GEN-05).
#
# The bug this covers only exists BETWEEN two sessions: a cancel and a
# redelivered (older) purchase for one user, in flight at once. The old webhook
# read app_metadata, checked, and wrote back, so both deliveries read the
# pre-cancel state, both passed, and whichever WROTE last won — the purchase,
# here, leaving a cancelled customer on the paid plan.
#
# Session A applies the cancel and HOLDS its transaction open; session B
# delivers the older purchase meanwhile. B must block on the row lock, then see
# A's watermark and answer 'stale'.
#
# Usage, against a throwaway database prepared as apply_billing_event.spec.sql
# describes:
#
#   PGHOST=/var/tmp/pg/sock PGUSER=postgres PGDATABASE=bw ./apply_billing_event_race.spec.sh
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

PSQL=(psql -q -t -A -v ON_ERROR_STOP=1)
U=00000000-0000-0000-0000-0000000000c1
fails=0
check () {  # check <label> <got> <want>
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 — got '$2', want '$3'"; fails=$((fails + 1)); fi
}

"${PSQL[@]}" -c "delete from auth.users where id = '$U';
  insert into auth.users values ('$U', '{\"provider\":\"email\"}');
  select public.apply_billing_event('$U', 'evt_buy', 'pro', '2026-10-01T12:00:00Z');" >/dev/null

# A: the cancel (12:05), held open for 2 s
"${PSQL[@]}" -c "begin;
  select public.apply_billing_event('$U', 'evt_cancel', 'free', '2026-10-01T12:05:00Z');
  select pg_sleep(2);
  commit;" >/dev/null &
A=$!
sleep 0.5

# B: the purchase redelivered — not the last-applied id any more once A lands
t0=$(date +%s.%N)
got=$("${PSQL[@]}" -c "select public.apply_billing_event('$U', 'evt_buy', 'pro', '2026-10-01T12:00:00Z');")
t1=$(date +%s.%N)
wait $A

check "older purchase delivered during the cancel is stale" "$got" "stale"
check "B waited for A's row lock" "$(echo "$t1 - $t0 > 1" | bc)" "1"
check "plan stays cancelled" "$("${PSQL[@]}" -c "select raw_app_meta_data->>'plan' from auth.users where id = '$U';")" "free"

[ "$fails" -eq 0 ] || { echo "$fails failure(s)"; exit 1; }
