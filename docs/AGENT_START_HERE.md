# BRO — Builder Start Here (v1 foundation)

For the next agent who builds. Read this first, then the linked docs. Research-only so far, no v1 code cut.

## 1. What BRO is

Living communication environment, not chat list. Tagline: TALK. CONNECT. EXIST.
V1 target: WhatsApp-grade reliability + BRO soul (Pulse, branches, drops/plans, presence moods, street voice).

Stack locked: Expo SDK 53 + RN 0.79.6 + expo-router 5.1.11 + TypeScript + Supabase (Auth/Postgres/Realtime/Storage). No Clerk/Convex in code — that drift is fixed.

Branch: `feat/supabase-chat` (working, pushed, PR #3 open → main, all checks green). Package `app.bro`, scheme `bro://`.

Current state: 216/216 tests, typecheck clean, lint 0 errors.

## 2. Frozen decisions — do not re-debate

- `docs/research/whatsapp-grade-audit.md` — P0→P3, reliability/security/media/push gaps.
- `docs/research/out-of-box-ideas.md` — Pulse/Branches/Drops/Plans/Squads/Status/I’m-Free.
- `docs/research/bro-voice-guide.md` — 20 locked lines. Copy verbatim. Max 1 slang/line. Clean English for Block/Delete/Report/Privacy.
- `docs/research/dashboard-layout-A.md` — v1 nav: Home(Pulse)/Chats/+/Bros/Me. No layout picker.
- `docs/research/chat-detail.md` — row + detail spec, branch pill, composer.

Voice core: `yoh, tsup bruv, uko wapi msee, cuz, pull up, tap in, run it back`.

## 3. Repo map

- `app/index.tsx` — auth redirect (Loading → welcome or tabs).
- `app/_layout.tsx` — Auth + Presence + People + ActivityBadge providers.
- `app/(tabs)/` — index=Home Pulse, chats, people=Bros, you=Me. `spaces` and
  `create` are registered with `href: null` (routable but hidden from the bar).
  Stack routes: `/chat/[id]`, `/chat/[id]/branch/[branchId]`, `/new-chat`,
  `/search`, `/activity`.
- `src/features/auth/WelcomeScreen.tsx` — current `BRO / Communication, reimagined / Create account / Sign in`.
- `src/features/pulse/PulseScreen.tsx` — **live**: Live now / Tap-in / Around.
- `src/features/conversations/` — List, Detail, NewChat, BranchDetail (all real now).
- `src/features/search/SearchScreen.tsx` — grouped global search (was an unreachable placeholder).
- `src/features/spaces/SpacesScreen.tsx` — Your spaces / Discover + create sheet (was mock).
- `src/features/activity/ActivityScreen.tsx` — activity feed (was an empty directory).
- `src/lib/` — `supabase.ts` (AsyncStorage session), `auth-context.tsx`,
  `conversations.ts`, `branches.ts`, `pulse.ts`, `search.ts`, `spaces.ts`,
  `activity.ts`, `activity-badge-context.tsx`, `presence.ts`,
  `presence-context.tsx`, `people-context.tsx`, `database.types.ts`.
- `supabase/migrations/` — 001 initial (11 tables+RLS), 002 tranche-1,
  003 search, 004 activity, 005 branches.
- `.github/workflows/` — ci, android-build (debug APK `BRO-debug`), release, validate-secrets, fdroid-check.

## 4. Where to start — in order

P0 stop-loss:
1. Rotate service-role key (pasted in chat, in local `.env` — bypasses RLS). Only human in dashboard. **STILL OPEN.**
2. Fix README Clerk/Convex → Supabase-only. **DONE** (`e018915`).
3. Prove 2-client realtime + read receipts + unread. If INSERT works but subscriber sees nothing, check RLS SELECT — silent fail. **STILL OPEN, needs 2 devices.**
4. Design `push_tokens` + buckets `avatars, chat-media, voice-notes, statuses` (no code until approved).

Then the feature order actually used, all landed and on `feat/supabase-chat`:
- Presence (Feature 1) — `23d1895`
- Chat list + detail (Feature 2) — `51795e1`
- Pulse made live — `5ea5eed`
- Global search (+ migration 003) — `e5bd40e`
- Spaces — `c425027`
- Activity (+ migration 004, closed a privacy leak) — `862f714`

- Activity (+ migration 004, closed a privacy leak) — `862f714`
- Conversation branches (+ migration 005) — the signature feature

Next: wire `recordActivity()` producers so the Activity feed has real events,
then media (Storage buckets) and push notifications.

P1 reliability: `expo-sqlite` + outbox + `client_msg_id` + ack + reconnect refetch + pagination.
P2 media+push: buckets RLS + compress pipeline + `expo-av` voice + Expo push offline-only fanout + `bro://` deep links.
P3 trust: throttles via RPC, `reports` table, pg_cron for `expires_at`, Sentry, then E2EE pilot, then calls.

Do NOT build v1: layout switcher, rail nav, marketplace/payments, AI, livestream, group calls, bots.

## 5. Commands

```bash
cd /home/marvel/Projects/bro
git checkout feat/supabase-chat
npx tsc --noEmit && npx eslint . && npx jest
supabase db push --password "$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"
gh workflow run android-build.yml --repo marvel-254/bro --ref feat/supabase-chat
gh pr checks 3
```

`npm run` scripts time out on this machine — call the binaries directly.

Supabase CLI token: `~/.config/supabase/access-token`.

## 6. Gotchas

- Postgres `language sql` RLS helpers must be defined AFTER tables they reference, else `db push` fails.
- In a `SECURITY DEFINER` migration, a second `drop function if exists` after `create function` deletes the function you just made.
- `AND`ing a tsvector match with an `ilike` fallback makes the fallback unreachable. `OR` them.
- Some tables are only readable inside a scope you are already in (`space_members` for spaces you joined). Return `null` for unknown counts, never `0`.
- `supabase projects api-keys` inside repo creates `supabase/.temp/linked-project.json` → `rm -rf supabase/.temp` (gitignored).
- Tag pushes may not trigger workflows — use `gh workflow run ... --ref <tag>`.
- Realtime 500 on plain GET is meaningless. Prove with 2 authed clients.
- Session in AsyncStorage now, move to `expo-secure-store` when touching auth.
- `npm run` scripts time out on this machine; call `npx tsc` / `npx eslint` / `npx jest` directly.
- LSP reports bogus "cannot find module '@/...'" errors in `app/**` because tsconfig only includes `src/**/*`. Harmless — `tsc` passes.
- Test user + Smoke Test convo + 1 msg in live DB from verification — ask before deleting.

## 7. Definition of done (per feature)

UI + nav + backend + validation + loading/empty/error + BRO voice + tests + CI green + back-nav verified + 2-device check (airplane send → reconnect once, killed-app push → exact message).

The 2-device check is still outstanding for everything shipped so far — do not
mark a feature fully done without it, and say so plainly rather than implying it
was verified.

## 8. First PR suggestion

DONE — `docs: fix README stack drift + add SECURITY checklist` equivalent landed as
`e018915` (drift) and `77157ef` (CI secrets-check). PR #3 is open with all 5 checks
green. Next PR should be branches.

Questions? Read handoff.md for full history, then ask sir (Langat Gideon) — feature-by-feature, honest about what's not working.
