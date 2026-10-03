# BRO — Handoff / State of Work

Date: 2026-10-03 (updated after chat system + CI fixes landed)
Project root: `/home/marvel/Projects/bro/`
Branch: `feat/supabase-chat` (working branch, pushed, PR #3 open → main)
App name: **bro** (NOT "BROS" — sir confirmed the name stays `bro`, package `app.bro`)

Current state: typecheck clean, lint 0 errors (2 `any` warnings), 181/181 tests
pass, all 5 PR checks green (quality, validate, secrets-check, fdroid-compliance,
build-android with `BRO-debug` APK artifact).

---

## 1. What BRO is

An Expo / React Native chat app for a private group of friends ("the bros").
Builds to an Android APK via GitHub Actions. Backend is Supabase (Auth,
PostgreSQL, Realtime, Storage).

**Stack:** Expo SDK 53 (expo 53.0.27, RN 0.79.6, React 19, expo-router 5.1.11),
TypeScript, Supabase. NOT Next.js / PWA / Tailwind — sir explicitly reverted the
web-app spec and wants the APK in Expo, keeping only the *design direction* from
that spec (dark-first, near-black, one accent, thin borders, monospace metadata,
compact chat with sender name above message).

## 2. Live infrastructure

- **Supabase project `bro`**: ref `zchsmnelvcuexchpwfgr`, Central EU.
- **Repo secrets set**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  (Clerk secret was deleted — auth is now Supabase Auth.)
- **Local `.env`** (gitignored, verified): contains anon key, DB password, and
  the service-role key.
- **DB password** and **service-role key** were pasted in chat by sir. The
  service-role key bypasses RLS — **should be rotated in the dashboard** (open item).

## 3. Database schema (applied to live DB)

Migration `20261003000100_bro_initial_schema.sql` (11 tables, full RLS):
profiles, spaces, space_members, conversations, conversation_members, messages,
conversation_branches, message_reactions, attachments, activity, notifications.

Migration `20261003000200_features_tranche_1.sql` (applied, uncommitted until
commit 23d1895): added presence columns to profiles, disappearing-message
columns to messages, invites, pinned_messages, drops + drop_responses,
status_updates + status_replies, squads, plans + plan_responses,
custom_reactions, blocks, user_mutes. RLS on all. Realtime publication updated.

**GOTCHA (critical):** Postgres validates `language sql` function bodies at
creation time, so RLS helper functions (is_conversation_member, is_space_member,
is_conversation_admin) MUST be defined AFTER the tables they reference, not at
the top of a migration. This bit us on the first `db push`.

## 4. Auth

Supabase Auth (Clerk fully removed). `src/lib/auth-context.tsx`:
signInWithPassword, signUp, signOut, verifyOtp. Session persisted to
AsyncStorage, auto-refresh on. `handle_new_user` trigger auto-creates a
`profiles` row on signup (verified live).

## 5. Feature status

### DONE
- **Expo 53 upgrade** — fixed the Android build (was expo-module-gradle-plugin
  missing in SDK 52; expo/expo#36638). APK builds in CI.
- **Supabase backend** — schema, RLS, realtime publication, verified end-to-end
  (signup → profile trigger → conversation → message). RLS confirmed blocking anon.
- **Presence (Feature 1)** — commit `23d1895`:
  - `presence-context.tsx`: online on foreground, afk after 90s idle, offline on
    background (15s grace); manual presence pins until backgrounded; persisted to profiles.
  - `people-context.tsx`: roster of conversation peers with live presence,
    refreshed on profiles UPDATE via realtime.
  - `Avatar.tsx`: presence dot with per-state colour.
  - `PeopleScreen.tsx`: "Who's Around" list + presence picker modal with custom
    activity + quick chips.
  - `presence.ts`: broadcast-channel presence + typing helpers (typing never touches disk).
  - Verified: typecheck 0, eslint 0, 42/42 tests.
- **Chat system (Feature 2)** — commit `51795e1`: list + detail together.
  - `ConversationListScreen.tsx`: peer avatars + presence dot, last-message preview,
    unread badge, realtime reorder on new message.
  - `ConversationDetail.tsx`: replies, reactions, edit/delete-for-everyone, typing
    indicator, read receipts, pagination, compact sender-name-above-message layout.
  - `NewChatScreen.tsx`: start/resume a direct chat from the Who's Around roster.
  - `conversations.ts`: full data access + `subscribeToConversation` /
    `subscribeToConversationList` realtime channels.
  - Decision made: list + detail shipped together (sir's call).
- **Tests for the chat module** — commit `e018915`: 45 unit tests for
  `conversations.ts` (chainable Supabase query-builder mock, terminal-method
  overrides). 87 tests total, all passing.
- **Doc stack drift fixed** — commit `e018915`: README, PRIVACY, fdroid/README,
  fdroid/metadata.toml, website/PRIVACY, website/download.html now say Supabase
  (were still claiming Clerk + Convex). Verified zero `clerk|convex` matches outside
  `docs/research/` (which legitimately narrates the migration).
- **CI secrets-check fixed** — commit `77157ef`: `validate-secrets.yml` used
  `gh secret view`, which cannot read repo secrets under the default GITHUB_TOKEN,
  so it failed every PR even though the secrets existed. Now uses the `secrets`
  context via `env:`. `secrets-setup.md` + `setup-secrets.sh` rewritten for
  Supabase (were Clerk).

### Build state — honest status vs. the docs
Built and verified: auth, presence, chat (list + detail), new chat, live Pulse,
global search, Spaces, Supabase backend + RLS.

**Landed this session:**
- **Pulse made live** (`5ea5eed`) — `src/lib/pulse.ts`. Live now (≥2 non-self
  messages in a 15-min window), Tap-in (unexpired plans with a Going tally),
  Around (peers + presence). Chronological only, no ranking, so it cannot decay
  into a feed. Mock `activeUsers`/`liveConversations` arrays deleted.
- **Global search** (`e5bd40e`) — `src/lib/search.ts` + migration
  `20261003000300_search.sql` (applied to the live DB). Generated tsvector over
  message bodies with the `simple` config so slang is not stemmed, GIN index, and
  a `search_messages` SECURITY DEFINER RPC that filters every row through
  `is_conversation_member()`. Verified an anon call returns no rows.
  SearchScreen was an 8-line placeholder with **no route at all**; it is now
  reachable at `/search` from the Pulse header.
- **Spaces** (`c425027`) — `src/lib/spaces.ts`. Real join/leave/create with
  slug-collision retry and rollback. Mock "24.8k members" removed.
- **Activity** — `src/lib/activity.ts`, `ActivityScreen.tsx`,
  `activity-badge-context.tsx`, route `/activity`, badge on the Chats header.
  Migration `20261003000400_activity_notifications.sql` (applied) fixes a
  **privacy leak**: `activity` was readable by any signed-in user, so everyone
  could read everyone else's replies, mentions, reactions and follows. The
  policy is now relevance-scoped (you, your targets, your conversations), and
  the screen reads owner-scoped `notifications` instead so the narrow path is
  the only path. The same migration adds an `activity_fan_out` trigger, because
  nothing had ever written to `notifications` — an Activity screen built on it
  would otherwise have been permanently empty.

**Still not built:**
- **Branches** — the signature feature. `BranchDetail.tsx` exists but nothing
  creates a branch or renders the "↳ N replies" pill from the chat screen.
- Drops / Plans creation UI / Squads / Statuses: tables exist, read-only in Pulse.
  Nothing calls `recordActivity`, so the fan-out trigger has no producers yet.
- Media: no `expo-image-picker`/`expo-av`, no Storage buckets created.
- Push notifications: no `push_tokens` table, no fanout, no OS delivery.
- `SpaceDetail.tsx` is still a 9-line placeholder.
- `YouScreen` / `SpaceListItem` still carry `any` casts (2 lint warnings left).

**Nav note:** `app/(tabs)/spaces.tsx` and `create.tsx` existed but were
unregistered in `_layout.tsx`, so both were unreachable. They are now routable
but hidden with `href: null`, keeping the frozen Home/Chats/Bros/Me tab set.
`/search`, `/activity` and `/new-chat` are stack routes off the tabs.

Next feature per the docs build order is **conversation branches**.

### NOT YET BUILT (future features, in sir's order)
- Friends/friend requests (no `friendships` table yet — Who's Around currently
  lists conversation peers as the honest interim)
- Bro Board (temporary social board, 24h posts) — schema exists (drops/statuses)
- Statuses (24h) — schema exists (status_updates/status_replies)
- Plans (Going/Maybe/Can't) — schema exists (plans/plan_responses)
- Voice notes (needs recording + upload)
- Media uploads (Supabase Storage buckets: avatars, chat-media, voice-notes,
  statuses — NOT created yet)
- 1-to-1 voice/video calls (WebRTC) — needs `react-native-webrtc` native module,
  custom dev build (NOT Expo Go), STUN/TURN, HTTPS for browser testing. SFU
  (LiveKit) abstraction for group calls later. **Cannot verify real calls from
  here; mark incomplete honestly.**
- Notifications (in-app first, Web Push later)
- PWA — NOT applicable (native app)
- Disappearing messages — schema exists (expires_at) but UI not built

## 6. Design direction (from the reverted web spec — ADOPT)

Dark-first, near-black background (#090A0F canvas already in theme), off-white
text, ONE configurable accent, thin borders, minimal gradients/glassmorphism,
strong typography, monospace for metadata/status, small purposeful animations,
streetwear/underground character. AVOID: generic SaaS dashboard, excessive
rounded cards, purple AI gradients, giant icons, everything-in-a-card, fake
stats/data. Bottom nav: Home / Chats / Calls / Bros / Me.

## 7. Key files

| Path | Purpose |
|---|---|
| `src/lib/supabase.ts` | Supabase client (AsyncStorage session) |
| `src/lib/auth-context.tsx` | Supabase Auth context |
| `src/lib/presence.ts` | presence/typing broadcast helpers + DISAPPEAR_PRESETS |
| `src/lib/presence-context.tsx` | presence lifecycle provider |
| `src/lib/people-context.tsx` | Who's Around roster provider |
| `src/lib/conversations.ts` | message fetch/send/edit/delete, reactions, read cursors, realtime subscribe |
| `src/lib/database.types.ts` | row types |
| `src/features/conversations/ConversationDetail.tsx` | chat screen (real, working) |
| `src/features/people/PeopleScreen.tsx` | Who's Around |
| `src/components/ui/Avatar.tsx` | avatar + presence dot |
| `supabase/migrations/` | schema (001 initial, 002 features) |
| `supabase/README.md` | backend setup docs |

## 8. CI / Build

- `android-build.yml` — builds debug APK, requires Supabase env secrets.
- `release.yml` — builds on `v*` tags.
- `validate-secrets.yml` — was broken twice: first bad YAML indentation, then it
  used `gh secret view`, which cannot read repo secrets under the default
  GITHUB_TOKEN and so failed every PR despite the secrets existing. Fixed in
  `77157ef` to read the `secrets` context via `env:`.
- **GOTCHA:** tag pushes may not trigger workflows in this repo (GitHub-side
  issue seen on the aide project). Publish via `gh workflow run ... --ref <tag>`.
- APK artifact name: `BRO-debug` (~49MB compressed, ~169MB uncompressed debug APK).
- `ci.yml` / `fdroid-check.yml` / `validate-secrets.yml` trigger only on
  `main`/`develop` (push or PR). To exercise them on a feature branch, open a PR.
- **PR #3** (`feat/supabase-chat` → `main`) is open and all 5 checks are green:
  `quality`, `validate`, `secrets-check`, `fdroid-compliance`, `build-android`.

## 9. Open items / security

1. **Rotate service-role key** — it was pasted in chat and is in local `.env`.
   Bypasses RLS. Only sir can do this in the dashboard. **Still open.**
2. **Realtime unproven** — WebSocket handshake returned 500 to a plain GET
   (may be meaningless); never confirmed a message arriving in a second client.
   Needs two devices/accounts to settle.
3. **One test user** (`broprobe2026@gmail.com`) + one "Smoke Test" conversation
   + one message exist in the DB (created during verification). Offer to delete.
4. **Storage buckets** not created (avatars, chat-media, voice-notes, statuses).
5. **Friendships table** not created — Who's Around lists conversation peers.
6. **PR #2** (`fix/validate-secrets-api`) is superseded by `77157ef`; close it.
7. Screens still mock/placeholder — see "Build state" in section 5.

## 10. How to verify / continue

```bash
cd /home/marvel/Projects/bro
git checkout feat/supabase-chat
npm run typecheck && npm run lint && npm test
# apply schema (if new migrations added):
supabase db push --password "$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"
# trigger a build:
gh workflow run android-build.yml --repo marvel-254/bro --ref feat/supabase-chat
```

Supabase CLI token: `~/.config/supabase/access-token` (can list projects, NOT
read keys or admin-read). **GOTCHA:** running `supabase projects api-keys` inside
a repo auto-creates `supabase/.temp/linked-project.json` pointing that repo at a
production DB — always `rm -rf supabase/.temp` and it's gitignored now.

## 11. Sir's preferences

- Name: Langat Gideon, prefers "sir". Black site = office computer (SSH), sudo
  password `marvelx`.
- Feature-by-feature delivery, sir reviews between each.
- Be honest about what's not actually working; never claim completion on
  compilation alone.
- App name is `bro`, not BROS.
