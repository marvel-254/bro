# BRO — Handoff / State of Work

Date: 2026-10-03
Project root: `/home/marvel/Projects/bro/`
Branch: `feat/supabase-chat` (working branch, pushed to origin)
App name: **bro** (NOT "BROS" — sir confirmed the name stays `bro`, package `app.bro`)

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

### NEXT (Feature 2 — chat system)
Per sir's order, feature-by-feature. Feature 2 = real 1-to-1 + group messaging:
replies, reactions, edit/delete, typing, read receipts, unread counts,
pagination, compact "sender name above message" layout.

**Decision pending with sir:** build conversation LIST + DETAIL together
(recommended) vs. only upgrade the detail screen. The current
`ConversationDetail.tsx` is a single conversation view; there is NO conversation
list screen yet. Recommended: build both as feature 2.

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
- `validate-secrets.yml` — was ALREADY broken (bad YAML indentation, OWNER=/REPO=
  at column 0) before I touched it; fixed it to require the Supabase pair.
- **GOTCHA:** tag pushes may not trigger workflows in this repo (GitHub-side
  issue seen on the aide project). Publish via `gh workflow run ... --ref <tag>`.
- APK artifact name: `BRO-debug` (~49MB compressed, ~169MB uncompressed debug APK).

## 9. Open items / security

1. **Rotate service-role key** — it was pasted in chat and is in local `.env`.
   Bypasses RLS. Only sir can do this in the dashboard.
2. **Realtime unproven** — WebSocket handshake returned 500 to a plain GET
   (may be meaningless); never confirmed a message arriving in a second client.
3. **One test user** (`broprobe2026@gmail.com`) + one "Smoke Test" conversation
   + one message exist in the DB (created during verification). Offer to delete.
4. **Conversation list screen** does not exist yet (feature 2).
5. **Storage buckets** not created (avatars, chat-media, voice-notes, statuses).
6. **Friendships table** not created.

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
