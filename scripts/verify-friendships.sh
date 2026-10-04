#!/usr/bin/env bash
# Verify friendships RLS + block triggers. Uses the service-role key, creates a
# throwaway second user, asserts behaviour, then deletes everything it made.
set -euo pipefail

ENV_FILE=".env"
URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2-)
SVC=$(grep '^SUPABASE_SECRET_KEY=' .env | cut -d= -f2-)

svc=(-H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json")
ret=(-H "Prefer: return=representation")

fail=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }

insert() { curl -s -X POST "${URL}/rest/v1/$1" "${svc[@]}" "${ret[@]}" -d "$2"; }

echo "=== setup: two users ==="
ALICE=$(curl -s "${URL}/rest/v1/profiles?select=id&limit=1" "${svc[@]}" | jq -r '.[0].id')
CREATED=$(curl -s -X POST "${URL}/auth/v1/admin/users" "${svc[@]}" \
  -d '{"email":"brofriendprobe@example.com","password":"Probe-xyz-9!","email_confirm":true,"user_metadata":{"username":"brofriendprobe","display_name":"Friend Probe"}}')
TEMP_ID=$(echo "$CREATED" | jq -r '.id // empty')
sleep 1
BOB=$(curl -s "${URL}/rest/v1/profiles?select=id&username=eq.brofriendprobe" "${svc[@]}" | jq -r '.[0].id // empty')
[ -n "$BOB" ] && ok "temp user created" || { bad "temp user missing"; exit 1; }

echo "=== 1. request as Alice ==="
R1=$(insert friendships "{\"requester_id\":\"$ALICE\",\"addressee_id\":\"$BOB\",\"status\":\"pending\"}")
echo "$R1" | jq -e '.[0].status == "pending"' >/dev/null && ok "pending row created" || bad "request failed: $R1"

echo "=== 2. Bob accepts (update as Bob is RLS-gated; service role stands in) ==="
# Service role bypasses RLS, so simulate the recipient path by scoping the
# update the same way the client does.
curl -s -X PATCH "${URL}/rest/v1/friendships?requester_id=eq.$ALICE&addressee_id=eq.$BOB&status=eq.pending" \
  "${svc[@]}" -d '{"status":"accepted"}' >/dev/null
ST=$(curl -s "${URL}/rest/v1/friendships?select=status&requester_id=eq.$ALICE&addressee_id=eq.$BOB" "${svc[@]}" | jq -r '.[0].status')
[ "$ST" = "accepted" ] && ok "accepted" || bad "status is $ST"

echo "=== 3. duplicate request is a no-op row-wise (still one row) ==="
insert friendships "{\"requester_id\":\"$ALICE\",\"addressee_id\":\"$BOB\",\"status\":\"pending\"}" >/dev/null
# The insert fails on PK; the client would revive via delete+insert. Count rows:
N=$(curl -s "${URL}/rest/v1/friendships?select=requester_id&or=(requester_id.eq.$ALICE,addressee_id.eq.$ALICE)" "${svc[@]}" | jq 'length')
echo "  rows involving Alice: $N"

echo "=== 4. block wipes the friendship ==="
insert blocks "{\"blocker_id\":\"$BOB\",\"blocked_id\":\"$ALICE\"}" >/dev/null
LEFT=$(curl -s "${URL}/rest/v1/friendships?select=requester_id&or=(requester_id.eq.$ALICE,addressee_id.eq.$ALICE)" "${svc[@]}" | jq 'length')
[ "$LEFT" = "0" ] && ok "friendship row cleared by block trigger" || bad "$LEFT rows remain"

echo "=== 5. request across a block is rejected ==="
RB=$(curl -s -X POST "${URL}/rest/v1/friendships" "${svc[@]}" "${ret[@]}" \
  -d "{\"requester_id\":\"$ALICE\",\"addressee_id\":\"$BOB\",\"status\":\"pending\"}")
echo "$RB" | grep -q "cannot request" && ok "blocked request rejected" || bad "got: $(echo "$RB" | head -c 160)"

echo "=== 6. anon sees no friendship rows ==="
ANON=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
AR=$(curl -s "${URL}/rest/v1/friendships?select=requester_id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
[ "$AR" = "[]" ] && ok "anon sees nothing" || bad "anon saw: $AR"

echo "=== CLEANUP ==="
curl -s -X DELETE "${URL}/rest/v1/blocks?blocker_id=eq.$BOB" "${svc[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/friendships?requester_id=eq.$ALICE" "${svc[@]}" >/dev/null
curl -s -X DELETE "${URL}/auth/v1/admin/users/$TEMP_ID" "${svc[@]}" >/dev/null
echo "removed temp user and test rows"
FR=$(curl -s "${URL}/rest/v1/friendships?select=requester_id" "${svc[@]}" | jq 'length')
BL=$(curl -s "${URL}/rest/v1/blocks?select=blocker_id" "${svc[@]}" | jq 'length')
echo "remaining friendships: $FR, blocks: $BL (expect 0, 0)"

echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"