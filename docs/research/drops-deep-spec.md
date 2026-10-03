# Drops Deep Spec — to RLS columns

Date: 2026-10-03. Builds on create-sheet + presence-notif-media-mod. Supabase-only.

## Tables (delta to 002 migration)

drops [id uuid pk, host_id uuid refs auth.users, text varchar(120), place text null, audience squad_id uuid null, expires_at timestamptz, conversation_id uuid null refs conversations, created_at]
drop_responses [drop_id, user_id, status Going/Maybe/Can't, updated_at, pk(drop_id,user_id)]

Indexes: drops(expires_at), drops(audience), responses(drop_id).

## RLS

- drops SELECT: host OR audience member OR invited. INSERT: authed, text 1-120, expires 1-12h. UPDATE: host only pre-expiry. DELETE: host.
- responses SELECT: drop visible. INSERT/UPDATE: self only, one row/user (upsert).
- conversation auto-created type=`drop`, members = host + tap-ins. Reuse `is_conversation_member`.

Helpers after tables (sql-validation gotcha): `is_drop_visible(uid,drop)`, `is_drop_host`.

## Logic

- Post: validate → insert drop → create conversation link → broadcast `drops:new`.
- Tap-in: upsert Going → add conversation_member → push to host `cuz — X tapped in`.
- Expiry: pg_cron `archived=true`, no delete, chat read-only, no new responses.
- Throttle RPC `create_drop`: max 5/hr/user.

## Realtime

`postgres_changes` on drops + responses (SELECT-scoped) for tally live. Broadcast `typing` in drop chat only, never persisted.

## UX states

Compose: `What’s the vibe?` + chips 2h/4h/Tonight + Squad▾ + [Drop it — bet].
Card: text, `3 Going · ends 2h`, [Tap in]/[Maybe]. Success toast `Bet — live.`
Empty/expired: `Expired quiet. No flop talk fr.` Errors reuse voice: `Say something first msee`.

## Verify

2 accounts: A posts 2h drop → B sees in Pulse Tap-in <5s → B Going → B in chat → kill B app → host update pushes → expiry archives, chat read-only. RLS negative: non-member SELECT denied, non-host UPDATE denied, dupe response upserts not dupes.
