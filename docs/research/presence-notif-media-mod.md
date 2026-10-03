# BRO v1 Presence / Notifications / Media / Moderation deltas (Frozen)

Date: 2026-10-03
All Supabase-native. No custom backend.

## Presence (builds on current broadcast + profiles mirror)

States: here / chilling iykyk / locked in / brb / off the grid. Custom text+emoji 24h.
Rules: foreground online, 90s idle afk, background 15s grace offline. Manual pins until background.
Typing `cooking...` broadcast only, 3s timeout, local hide after 5s even if no event.
Whisper (v2): ephemeral DM `expires_at +60s`, never fetched in history.
Guard: mutuals only, coarse, off default for new users. No exact location v1.

## Notifications

Table `push_tokens [user_id, expo_push_token, device, updated_at]` RLS owner-only.
Edge on messages insert: if recipient has no active socket → Expo push; channels: mentions/replies only.
Foreground: in-app only, no OS banner. Killed: OS banner → `bro://conversation/:id?branch=:bid&message=:mid`.
Copy: `yoh bruv — Sarah: uko wapi msee? — tap in` / `fyi — Nia mentioned you.`
FCM via EAS required for Android standalone, else tokens never deliver.

## Media

Buckets private: `avatars, chat-media, voice-notes, statuses`. Storage RLS mirrors membership.
Pipeline: pick → 1920px JPEG 0.8 + 400px thumb parallel → row in `attachments [storage_path, mime, bytes]` → signed URL for DMs.
Voice: `expo-av` m4a/opus 60s max v1 + inline player. Validate MIME+size server-side.
Cleanup: orphan sweeper job. No E2EE media v1.

## Moderation / safety

Reuse `blocks, user_mutes`. Add `reports [reporter, target_type, target_id, reason, created_at]` RLS reporter-only + moderator read.
Space roles reuse `is_space_member / is_conversation_admin`. Throttles via RPC: 5 msg/min/convo, 10 reactions/min.
`expires_at` sweeper via pg_cron for messages/drops/status. FTS `tsvector` GIN on messages scoped to member convos for search.
Sentry + RLS-denial log P1. Calls/E2EE: E2EE pilot DMs via Signal+SQLCipher dev-build only, 1:1 WebRTC test, group LiveKit later. Mark incomplete until device-tested.
