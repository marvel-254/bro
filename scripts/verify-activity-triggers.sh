#!/usr/bin/env bash
# End-to-end check that activity producers fire. Uses the service-role key to
# write rows directly, then asserts activity + notifications were created, then
# cleans up everything it made. Safe to re-run.
set -euo pipefail

ENV_FILE=".env"
URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
SVC=$(grep '^SUPABASE_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2-)

auth=(-H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json")

# PostgREST returns no body for an INSERT unless asked, so every write that needs
# to read back an id must send this.
ret=(-H "Prefer: return=representation")

insert() { # insert <table> <json>
  curl -s -X POST "${URL}/rest/v1/$1" "${auth[@]}" "${ret[@]}" -d "$2"
}

echo "=== profiles (need two users for reply/mention) ==="
USERS=$(curl -s "${URL}/rest/v1/profiles?select=id,username&limit=2" "${auth[@]}")
echo "$USERS"
ALICE=$(echo "$USERS" | jq -r '.[0].id')
BOB=$(echo "$USERS" | jq -r '.[1].id // empty')
ALICE_NAME=$(echo "$USERS" | jq -r '.[0].username')
BOB_NAME=$(echo "$USERS" | jq -r '.[1].username // empty')

# A reply or mention needs a second party. Create a throwaway auth user; the
# handle_new_user trigger creates its profile. Removed again in cleanup.
TEMP_EMAIL="brotriggerprobe@example.com"
TEMP_PASSWORD="Probe-$(date +%s)-Aa1!"
if [ -z "$BOB" ]; then
  echo "--- creating a temporary second user to test fan-out with ---"
  CREATED=$(curl -s -X POST "${URL}/auth/v1/admin/users" "${auth[@]}" \
    -d "{\"email\":\"$TEMP_EMAIL\",\"password\":\"$TEMP_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"username\":\"brotriggerprobe\",\"display_name\":\"Trigger Probe\"}}")
  TEMP_ID=$(echo "$CREATED" | jq -r '.id // empty')
  if [ -z "$TEMP_ID" ]; then
    echo "could not create temp user: $CREATED"
    exit 1
  fi
  # handle_new_user is a trigger; give it a moment to land.
  sleep 1
  BOB=$(curl -s "${URL}/rest/v1/profiles?select=id,username&username=eq.brotriggerprobe" "${auth[@]}" | jq -r '.[0].id // empty')
  BOB_NAME="brotriggerprobe"
  echo "temp user: $BOB ($TEMP_EMAIL)"
fi

if [ -z "$ALICE" ] || [ -z "$BOB" ]; then
  echo "NEED TWO PROFILES to test reply/mention fan-out."
  [ -n "${TEMP_ID:-}" ] && curl -s -X DELETE "${URL}/auth/v1/admin/users/$TEMP_ID" "${auth[@]}" >/dev/null
  exit 1
fi

echo "=== creating a conversation with both users ==="
CONV=$(insert conversations "{\"type\":\"direct\",\"created_by\":\"$ALICE\"}" | jq -r '.[0].id // empty')
if [ -z "$CONV" ]; then
  echo "could not create conversation"
  exit 1
fi
insert conversation_members "[{\"conversation_id\":\"$CONV\",\"user_id\":\"$ALICE\",\"role\":\"admin\"},{\"conversation_id\":\"$CONV\",\"user_id\":\"$BOB\",\"role\":\"member\"}]" >/dev/null
echo "conversation: $CONV"

echo "=== Alice posts a root message ==="
ROOT=$(insert messages "{\"conversation_id\":\"$CONV\",\"sender_id\":\"$ALICE\",\"content\":\"yo @${BOB_NAME} what is up\",\"type\":\"text\",\"status\":\"sent\"}" | jq -r '.[0].id // empty')
if [ -z "$ROOT" ]; then
  echo "could not create root message"
  exit 1
fi
echo "root message: $ROOT"

echo "=== Bob replies to Alice's message (expect reply activity + mention activity) ==="
insert messages "{\"conversation_id\":\"$CONV\",\"sender_id\":\"$BOB\",\"content\":\"all good\",\"type\":\"text\",\"status\":\"sent\",\"reply_to_message_id\":\"$ROOT\"}" >/dev/null

echo "--- activity rows (expect: mention, reply) ---"
curl -s "${URL}/rest/v1/activity?select=type,actor_id,target_id,target_type&order=created_at.desc&limit=10" "${auth[@]}" | jq -r '[.[].type] | join(", ")'
echo "--- notifications fan-out (migration 004) ---"
curl -s "${URL}/rest/v1/notifications?select=user_id,is_read,deep_link&order=created_at.desc&limit=10" "${auth[@]}" | jq -r '.[] | "  user=\(.user_id[0:8]) read=\(.is_read) link=\(.deep_link)"'

echo "=== Bob reacts to Alice's message (expect reaction activity) ==="
insert message_reactions "{\"message_id\":\"$ROOT\",\"user_id\":\"$BOB\",\"emoji\":\"fr\"}" >/dev/null
curl -s "${URL}/rest/v1/activity?select=type&order=created_at.desc&limit=10" "${auth[@]}" | jq -r '[.[].type] | join(", ")'

echo "=== CLEANUP ==="
curl -s -X DELETE "${URL}/rest/v1/message_reactions?message_id=eq.$ROOT" "${auth[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/activity?target_id=eq.$ROOT" "${auth[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/activity?target_id=eq.$BOB" "${auth[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/messages?conversation_id=eq.$CONV" "${auth[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/conversation_members?conversation_id=eq.$CONV" "${auth[@]}" >/dev/null
curl -s -X DELETE "${URL}/rest/v1/conversations?id=eq.$CONV" "${auth[@]}" >/dev/null

# Notifications cascade from activity, which we just deleted.
LEFT=$(curl -s "${URL}/rest/v1/notifications?select=id" "${auth[@]}" | jq 'length')
echo "remaining notification rows: $LEFT"

if [ -n "${TEMP_EMAIL:-}" ]; then
  curl -s -X DELETE "${URL}/auth/v1/admin/users/$TEMP_ID" "${auth[@]}" >/dev/null
  echo "removed temp user $TEMP_EMAIL"
fi

REMAIN_ACT=$(curl -s "${URL}/rest/v1/activity?select=id" "${auth[@]}" | jq 'length')
REMAIN_MSG=$(curl -s "${URL}/rest/v1/messages?conversation_id=eq.$CONV&select=id" "${auth[@]}" | jq 'length')
echo "remaining activity rows: $REMAIN_ACT"
echo "remaining messages in test conversation: $REMAIN_MSG (expect 0)"
echo "done"