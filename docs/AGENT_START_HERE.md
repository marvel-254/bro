# BRO — Builder Start Here (v1 foundation)

For the next agent who builds. Read this first, then the linked docs. Research-only so far, no v1 code cut.

## 1. What BRO is

Living communication environment, not chat list. Tagline: TALK. CONNECT. EXIST.
V1 target: WhatsApp-grade reliability + BRO soul (Pulse, branches, drops/plans, presence moods, street voice).

Stack locked: Expo SDK 53 + RN 0.79.6 + expo-router 5.1.11 + TypeScript + Supabase (Auth/Postgres/Realtime/Storage). No Clerk/Convex in code — README drift, ignore it.

Branch: `feat/supabase-chat` (working). Package `app.bro`, scheme `bro://`.

## 2. Frozen decisions — do not re-debate

- `docs/research/whatsapp-grade-audit.md` — P0→P3, reliability/security/media/push gaps.
- `docs/research/out-of-box-ideas.md` — Pulse/Branches/Drops/Plans/Squads/Status/I’m-Free.
- `docs/research/bro-voice-guide.md` — 20 locked lines. Copy verbatim. Max 1 slang/line. Clean English for Block/Delete/Report/Privacy.
- `docs/research/dashboard-layout-A.md` — v1 nav: Home(Pulse)/Chats/+/Bros/Me. No layout picker.
- `docs/research/chat-detail.md` — row + detail spec, branch pill, composer.

Voice core: `yoh, tsup bruv, uko wapi msee, cuz, pull up, tap in, run it back`.

## 3. Repo map

- `app/index.tsx` — auth redirect (Loading → welcome or tabs).
- `app/_layout.tsx` — Auth + Presence + People providers.
- `app/(tabs)/` — index=Home Pulse, chats, people=Bros, you=Me. `app/chat/[id].tsx` detail, `app/new-chat.tsx`.
- `src/features/auth/WelcomeScreen.tsx` — current `BRO / Communication, reimagined / Create account / Sign in`.
- `src/features/pulse/PulseScreen.tsx` — mock data now, replace with Live/Tap-in/Around.
- `src/features/conversations/` — List, Detail, NewChat, BranchDetail.
- `src/lib/` — `supabase.ts` (AsyncStorage session), `auth-context.tsx`, `conversations.ts`, `presence.ts`, `presence-context.tsx`, `people-context.tsx`, `database.types.ts`.
- `supabase/migrations/` — 001 initial (11 tables+RLS), 002 tranche-1 (drops/status/squads/plans/blocks/mutes/presence/expires_at).
- `.github/workflows/` — ci, android-build (debug APK `BRO-debug`), release, validate-secrets.

## 4. Where to start — in order

P0 stop-loss:
1. Rotate service-role key (pasted in chat, in local `.env` — bypasses RLS). Only human in dashboard.
2. Fix README Clerk/Convex → Supabase-only.
3. Prove 2-client realtime + read receipts + unread. If INSERT works but subscriber sees nothing, check RLS SELECT — silent fail.
4. Design `push_tokens` + buckets `avatars, chat-media, voice-notes, statuses` (no code until approved).

P1 reliability: `expo-sqlite` + outbox + `client_msg_id` + ack + reconnect refetch + pagination.
P2 media+push: buckets RLS + compress pipeline + `expo-av` voice + Expo push offline-only fanout + `bro://` deep links.
P3 trust: throttles via RPC, `reports` table, pg_cron for `expires_at`, Sentry, then E2EE pilot, then calls.

Do NOT build v1: layout switcher, rail nav, marketplace/payments, AI, livestream, group calls, bots.

## 5. Commands

```bash
cd /home/marvel/Projects/bro
git checkout feat/supabase-chat
npm run typecheck && npm run lint && npm test
supabase db push --password "$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"
gh workflow run android-build.yml --repo marvel-254/bro --ref feat/supabase-chat
```

Supabase CLI token: `~/.config/supabase/access-token`.

## 6. Gotchas

- Postgres `language sql` RLS helpers must be defined AFTER tables they reference, else `db push` fails.
- `supabase projects api-keys` inside repo creates `supabase/.temp/linked-project.json` → `rm -rf supabase/.temp` (gitignored).
- Tag pushes may not trigger workflows — use `gh workflow run ... --ref <tag>`.
- Realtime 500 on plain GET is meaningless. Prove with 2 authed clients.
- Session in AsyncStorage now, move to `expo-secure-store` when touching auth.
- Known LSP/type errors in `ConversationDetail.tsx`, `ConversationListScreen.tsx`, `@/` alias in `app/` — fix when you touch those files, not before.
- Test user + Smoke Test convo + 1 msg in live DB from verification — ask before deleting.

## 7. Definition of done (per feature)

UI + nav + backend + validation + loading/empty/error + BRO voice + tests + CI green + back-nav verified + 2-device check (airplane send → reconnect once, killed-app push → exact message).

## 8. First PR suggestion

`docs: fix README stack drift + add SECURITY checklist` — zero risk, unblocks external review. Then `feat: prove 2-client delivery + unread`.

Questions? Read handoff.md for full history, then ask sir (Langat Gideon) — feature-by-feature, honest about what's not working.
