# BRO — WhatsApp-Grade Audit (Expo + Supabase)

Date: 2026-10-03
Scope: WhatsApp-grade production bar, staying on Expo + Supabase.
Source of truth: `handoff.md`, `src/`, `app/`, `supabase/migrations/`, `.env.example`.
Mode: research-only, no code changes.

## 0. Baseline — what exists today

- **App:** Expo SDK 53 (`expo 53.0.27`, RN 0.79.6, React 19, expo-router 5.1.11), TypeScript.
  See `package.json`, `app.json` (`scheme: bro`, package `app.bro`).
- **Backend:** Supabase Auth + Postgres + Realtime + (planned) Storage. No Clerk, no Convex in code.
  Client: `src/lib/supabase.ts` — AsyncStorage session, auto-refresh.
  Auth: `src/lib/auth-context.tsx` — `signInWithPassword`, `signUp`, `signOut`, `verifyOtp`.
- **Schema (live):**
  - `20261003000100_bro_initial_schema.sql`: profiles, spaces, space_members, conversations, conversation_members, messages, conversation_branches, message_reactions, attachments, activity, notifications. Full RLS, realtime publication.
  - `20261003000200_features_tranche_1.sql`: presence cols on profiles, `expires_at` on messages, invites, pinned_messages, drops + drop_responses, status_updates + status_replies, squads, plans + plan_responses, custom_reactions, blocks, user_mutes.
- **Chat:** `src/lib/conversations.ts` (fetch page, send, edit/delete, reactions, read cursors, realtime subscribe), `src/features/conversations/ConversationListScreen.tsx`, `ConversationDetail.tsx`, `NewChatScreen.tsx`, `app/chat/[id].tsx`, `app/(tabs)/chats.tsx`.
- **Presence/typing:** `src/lib/presence.ts` (broadcast + presence track), `src/lib/presence-context.tsx` (foreground online, 90s idle -> afk, background 15s grace -> offline), `src/lib/people-context.tsx` roster.
- **Verified:** signup -> profile trigger -> conversation -> message; RLS blocks anon; typecheck/lint/tests green at handoff.
- **Doc drift:** `README.md` still cites Clerk + Convex. Actual is Supabase-only. Fix before external review.

## 1. Reliability & realtime

### Current
- Single-conversation `postgres_changes` subscribe in `conversations.ts:238`.
- Message page query newest-first with LIMIT then flip in `conversations.ts:24`.
- `MessageStatus` type defines `pending|sending|sent|delivered|seen|failed` in `src/types/index.ts:1`, but no outbox/queue wires it end-to-end.
- Typing via broadcast only (`presence.ts:146`), never persisted — correct.

### Gaps to WhatsApp-grade
1. **Broadcast is transient.** Disconnects (tunnel, sleep, backgrounded, token refresh fail) lose events. No gap-fetch on reconnect.
2. **No offline outbox.** No `expo-sqlite` store, no `client_msg_id` idempotency, no `tempId -> serverId` reconciliation, no exponential backoff retry.
3. **No ack discipline.** No `broadcast ack:true` where UI must reflect success/failure; no instrumentation for silent RLS SELECT denials (sender can INSERT but subscribers can't SELECT -> realtime appears broken).
4. **No smart sync.** Full refetch risk on long histories; no cursor-based “only missed” sync, no virtualized list.
5. **Session storage:** Supabase session in AsyncStorage (`supabase.ts:29`), not hardware-backed `expo-secure-store`.

### Recommendations (stay on stack)
- Local-first: `expo-sqlite` messages + outbox `[client_msg_id uuid unique, conversation_id, payload, retry_count, created_at]`.
- Flow: optimistic `sending` -> `sent` on server ack -> `delivered/seen` via `conversation_members.last_read_message_id`.
- Two-tier realtime: broadcast for ephemeral (typing/presence), `postgres_changes` for durable (messages/reactions/cursors) + explicit `refetchMissingSince(lastSeenAt)` on `reconnect` / foreground.
- Add `client_msg_id` column, dedup on retry.
- Tune reconnect: initial 1s, max 30s, max 5 retries, only on recoverable close codes.
- Move session to `expo-secure-store` or at minimum document why AsyncStorage remains.

## 2. Security & privacy

### Current
- RLS on all tables, `auth.uid()` as caller. Helper functions defined after tables (Postgres `language sql` validation gotcha documented in handoff).
- `.env.example` correctly notes `EXPO_PUBLIC_*` is baked into bundle, anon key is public-but-RLS-gated.

### Gaps
1. **Service-role key exposed** — pasted in chat + local `.env`. Bypasses RLS. Must rotate in dashboard. Never in client bundle or git.
2. **No MFA / OAuth / biometric lock.** Only email/password + OTP verify. No `expo-local-authentication`, no session revocation UX.
3. **No rate limiting / abuse counters.** No Postgres RPC throttles for sends, reactions, invites. No server-side MIME/size validation for future uploads.
4. **No E2EE.** Supabase can read plaintext today. Do not claim E2EE until Signal Protocol path is done.
5. **Storage RLS missing** because buckets don’t exist yet (see §3).

### Recommendations
- P0: rotate service-role, audit `gh secret` list (only URL + anon), add SECURITY checklist to PR template.
- Add RPC-based throttles (e.g., max N messages / min / conversation), input length caps enforced in Postgres, not just UI.
- E2EE as explicit later phase: `open-e2ee` + SQLCipher via `expo-sqlite` config plugin + `expo-secure-store` vault + `react-native-get-random-values`, dev builds only (not Expo Go), separate relay for envelopes/prekeys. Keep Supabase for app rows/auth, relay separate. No plaintext in Supabase if claiming E2EE.

## 3. Media & calls

### Current
- `attachments` table exists, Storage buckets do NOT: `avatars, chat-media, voice-notes, statuses` planned, uncreated.
- No `expo-image-picker`, `expo-file-system`, `expo-av`, `expo-notifications` in `package.json` deps.
- Calls: zero WebRTC code. Handoff notes `react-native-webrtc` needs dev build + STUN/TURN + SFU for group.

### Gaps
- No upload pipeline (compress, thumb, parallel upload, signed URLs).
- No voice notes (record + upload + inline player).
- No 1:1 or group calls.
- No media moderation / cleanup job for orphans.

### Recommendations
- Buckets private by default, Storage RLS mirrors conversation/space membership.
- Pipeline: pick -> compress to 1920px JPEG 0.8 + 400px thumb -> parallel upload -> row in `attachments` with `storage_path`, MIME, bytes. Validate server-side, never trust client MIME.
- Voice: `expo-av` record m4a/opus, same bucket pattern under `voice-notes/`.
- Calls Phase 3: 1:1 via `react-native-webrtc` P2P + Supabase broadcast signaling; group via LiveKit SFU. Requires EAS dev builds, cannot stay on Expo Go. Honestly mark incomplete until device-tested.

## 4. Notifications & presence

### Current
- Presence solid for foreground: broadcast live + `profiles.presence` mirror for outsiders. `Avatar.tsx` dot, `PeopleScreen.tsx` “Who’s Around”.
- Deep-link scheme exists: `bro://`, `app/chat/[id].tsx`, `router.push('/chat/${id}')` in list.
- No push infra.

### Gaps
- No `push_tokens` table, no Edge Function fanout, no FCM/APNs config. Killed-app delivery impossible.
- No offline-only rule (push only if no active socket), no mention-only fanout for channels.
- No notification -> branch -> message routing, no Android back-map verification.

### Recommendations
- Add `push_tokens [user_id, expo_push_token, device, updated_at]` with RLS owner-only.
- Edge Function on `messages` insert: fetch members except sender, check active presence/socket, send via `exp.host/--/api/v2/push/send` only to offline users; channels: mentions/replies only.
- Foreground: suppress OS banner, show in-app. Background: OS banner with deep link `bro://conversation/:id?branch=:bid&message=:mid`.
- Verify back stack: Branch -> Conversation -> List, Modal -> close, Space -> Spaces.

## 5. Cross-cutting — scale, search, moderation

- **Search:** `SearchScreen.tsx` exists, no message FTS. Add Postgres `tsvector` + GIN on messages (per-conversation scope), plus people/spaces prefix search.
- **Moderation:** `blocks`, `user_mutes` schematized, `report` tables missing. Add `reports [target_type, target_id, reason, reporter]` + Space role checks (`is_space_member`, `is_conversation_admin` already in migrations — reuse).
- **Disappearing messages:** `expires_at` column exists, no sweeper or UI. Needs pg_cron purge + client filter.
- **Observability:** no Sentry/crash, no realtime health log, no RLS denial log. Add lightweight Edge log + client `__tests__` for authz negatives.
- **CI truth:** `android-build.yml`, `ci.yml`, `release.yml`, `validate-secrets.yml` exist. APK `BRO-debug` ~49MB compressed. Tag pushes may not trigger — use `gh workflow run --ref <tag>`.

## 6. Phased roadmap (no stack change)

**P0 — stop-loss (before features):**
- Rotate service-role key, verify secrets, fix README Clerk/Convex drift.
- Prove 2-client realtime, read receipts, unread badges end-to-end.
- Create buckets + `push_tokens` design (no code yet if research-only).

**P1 — reliability (makes it feel real):**
- `expo-sqlite` + outbox + `client_msg_id` + ack + reconnect refetch + cursor pagination + virtualized lists.

**P2 — media + push:**
- Private buckets + Storage RLS + compression pipeline + voice notes.
- Expo push + FCM + offline-only fanout + deep links + Android back verification.

**P3 — trust + voice:**
- Throttles, reports, pg_cron for `expires_at`, RLS audit, Sentry.
- E2EE pilot (DMs), then calls (1:1 WebRTC, group LiveKit).

## 7. How to verify each milestone

```bash
cd /home/marvel/Projects/bro
npm run typecheck && npm run lint && npm test
supabase db push --password "$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"
gh workflow run android-build.yml --repo marvel-254/bro --ref feat/supabase-chat
```

Manual: two devices/accounts, airplane-mode send -> reconnect delivers once, no dupes; killed-app push deep-links to exact message; RLS negative tests (non-member SELECT/INSERT denied).

## 8. Open decisions for out-of-box phase

- E2EE scope: DMs only first, or groups from day one?
- Calls: 1:1 P2P minimum vs LiveKit from start?
- Offline scope: full history vs last N + media cache caps?
- Push provider: Expo Push direct vs FCM/APNs via EAS?
- Next research inputs: user scale target, retention policy, moderation staffing.

---
Next: `docs/research/out-of-box-ideas.md` — Pulse/branches/Spaces differentiators that still feel WhatsApp-simple.
