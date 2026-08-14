#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Concurrency spec for `claim_guest_run`.
#
# This is a shell script and not a `.sql` spec for one reason: the bugs it
# covers only exist BETWEEN two sessions, and a psql script is one session.
# `claim_guest_run.spec.sql` and `guest_run_caps.spec.sql` cover everything
# expressible in a single connection; these two cases are not.
#
# Both scenarios open a transaction that claims and then HOLDS without
# committing, so the second session genuinely cannot see the row and takes the
# insert path. That is the window the `on conflict do update` clause used to get
# wrong, and it stopped being a curiosity when both halves of the counter
# started claiming the same arrival.
#
# Usage, against a throwaway database with the guest-trial migrations applied:
#
#   PGHOST=/var/tmp/pg/sock PGUSER=postgres PGDATABASE=gq ./guest_run_race.spec.sh
#
# Exits non-zero on the first failure.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

PSQL=(psql -q -t -A -v ON_ERROR_STOP=1)
SUBJECT=aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111
ROUTE=/steel/beam
fails=0

check () {  # check <label> <got> <want>
  if [ "$2" = "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1 — got '$2', want '$3'"
    fails=$((fails + 1))
  fi
}

reset () { "${PSQL[@]}" -c 'truncate public.guest_trials' >/dev/null; }

# ── one arrival claimed by both halves at once costs ONE run ─────────────
# The browser's `guest-quota` call and the calculation endpoint's claim are
# triggered by the same page load and carry the same run token. Whichever
# arrives second must be admitted free.
race_same_token () {
  reset
  "${PSQL[@]}" -c "
    begin;
    select public.claim_guest_run('$SUBJECT','$ROUTE','shared-run-tok',5,60);
    select pg_sleep(2);
    commit;" >/dev/null 2>&1 &
  local holder=$!
  sleep 0.4
  local second
  second=$("${PSQL[@]}" -F, -c "
    select allowed, charged, used
      from public.claim_guest_run('$SUBJECT','$ROUTE','shared-run-tok',5,60);")
  wait $holder

  check "a concurrent claim of the SAME run is allowed" "${second%%,*}" "t"
  check "and is NOT charged" "$(echo "$second" | cut -d, -f2)" "f"
  check "so one arrival cost one run" "$("${PSQL[@]}" -c 'select used from public.guest_trials')" "1"
}

# ── the insert path cannot step over the ceiling ─────────────────────────
# The holder runs the allowance to five inside an uncommitted transaction, so
# the second session sees no row at all and heads for the insert. The old
# `on conflict do update set used = used + 1` had no ceiling check on that
# path and granted a sixth run.
race_over_ceiling () {
  reset
  "${PSQL[@]}" -c "
    begin;
    select public.claim_guest_run('$SUBJECT','$ROUTE','tok-aaaa-0001',5,60);
    select public.claim_guest_run('$SUBJECT','$ROUTE','tok-aaaa-0002',5,60);
    select public.claim_guest_run('$SUBJECT','$ROUTE','tok-aaaa-0003',5,60);
    select public.claim_guest_run('$SUBJECT','$ROUTE','tok-aaaa-0004',5,60);
    select public.claim_guest_run('$SUBJECT','$ROUTE','tok-aaaa-0005',5,60);
    select pg_sleep(2);
    commit;" >/dev/null 2>&1 &
  local holder=$!
  sleep 0.6
  local sixth
  sixth=$("${PSQL[@]}" -F, -c "
    select allowed, used, coalesce(reason,'-')
      from public.claim_guest_run('$SUBJECT','$ROUTE','tok-bbbb-0001',5,60);")
  wait $holder

  check "a sixth run racing the insert is refused" "${sixth%%,*}" "f"
  check "with the honest reason" "$(echo "$sixth" | cut -d, -f3)" "exhausted"
  check "and the ceiling held" "$("${PSQL[@]}" -c 'select used from public.guest_trials')" "5"
}

race_same_token
race_over_ceiling
reset

if [ "$fails" -ne 0 ]; then
  echo "guest run race spec FAILED ($fails)"
  exit 1
fi
echo "guest run race spec passed"
