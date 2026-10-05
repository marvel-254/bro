# Push Infra Deep Spec — to columns

Date: 2026-10-03. Supabase-only + Expo Push + FCM via EAS.

## Tables

push_tokens [user_id uuid refs auth.users, expo_push_token text unique, device text null, updated_at timestamptz, pk(user_id, expo_push_token)]
Presence source: `profiles.presence` + active socket check in Edge (via Realtime presence state or last_seen).

RLS: owner read/write only. No SELECT by others.

## Edge Function `send-push-on-message`

Trigger: `messages` insert (via pg_net webhook or Realtime → Edge).
Steps: load conversation_members except sender → for each: if has active socket/presence=here → skip (in-app only) → else fetch tokens → filter channels to mentions/replies only → POST `https://exp.host/--/api/v2/push/send` with title `yoh bruv — {sender}: {preview}`, data `{conversation_id, branch_id, message_id}`.
Throttle: 1/message/user, collapse same convo 30s.

Client: register on login `Notifications.getExpoPushTokenAsync` → upsert. Logout removes token. FCM configured in EAS or tokens never deliver on standalone.

## Deep links

`bro://conversation/:id?branch=:bid&message=:mid`. Foreground: in-app banner, no OS. Killed: OS banner → exact message, back Branch→Chat→List.
Verify: A kills app, B sends, A gets banner <10s, tap lands exact bubble, back correct.
