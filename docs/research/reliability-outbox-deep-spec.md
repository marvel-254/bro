# Reliability/Outbox Deep Spec — to columns

Date: 2026-10-03. Makes sends never lose. Expo-sqlite + Supabase.

## DB delta

messages add `client_msg_id uuid unique not null` (idempotency), index (conversation_id, created_at desc).
conversation_members add `last_read_message_id` (already helper `move read cursor` — wire it).

## Client store (expo-sqlite)

outbox [client_msg_id pk, conversation_id, payload_json, retry_count, created_at]
messages cache [id/server_id null, client_msg_id unique, status sending/sent/delivered/seen/failed].

Flow: type → optimistic `sending` with tempId → persist outbox → try send → ack `sent` + serverId → realtime/postgres confirms → `delivered/seen` via read cursor.
Retry: exponential 1s→30s max 5, only recoverable net errors. Dedupe by client_msg_id on retry.

## Realtime

Durable: `postgres_changes` messages/reactions/cursors (SELECT-scoped). Ephemeral: broadcast typing/presence with `ack:false` except send-ack `ack:true`.
Reconnect: `refetchMissingSince(lastSeenAt)` cursor pagination, not full. Virtualized list, 30/page.

Verify: airplane send → `sending` → reconnect → `sent` once (no dupe), 2nd device sees once, read → `✓✓`, kill+reopen retains.
