# HANDOFF — Statuses + Memes

_Last updated: 2026-10-07. Branch `feat/supabase-chat`. For the next session._

## Architecture decisions (from the user — binding)

| Content | Host |
|---|---|
| **Status media** (image **and** video) | **Cloudflare R2** via `wrangler` |
| **Memes** (gallery, crowd-sourced, infinite scroll) | **Cloudflare R2** via `wrangler` |
| **Profile pictures** | Supabase storage |
| **Wallpapers** | Supabase storage |
| **Chat media** | Supabase storage (unchanged) |

So Supabase storage shrinks to profile pictures + wallpapers. R2 takes status
media and memes. `wrangler` is already authenticated (AGENTS.md §54) — do not
create new credentials by hand.

**RESOLVED:** *all* status media (image **and** video) moves to R2, not just
video. The existing Supabase `statuses` bucket is legacy and should be drained
then retired.

## Done & verified this session

1. **48h status expiry — shipped and confirmed live.**
   - `src/lib/statuses.ts` → `STATUS_TTL_HOURS = 48`
   - `src/features/status/StatusComposer.tsx` interpolates the constant
     (was a hardcoded "24 hours")
   - migration `supabase/migrations/20261007000100_status_ttl_48h.sql`
     applied via `npx supabase db push --linked`; one-time backfill verified
     against real rows (`expires_at` = created + 48h).
   - **Gotcha:** the table is `public.status_updates`, **not** `public.statuses`.
     First push failed with `SQLSTATE 42P01`.

2. **StatusViewer hang — fixed in code (device-unverified).**
   - `src/features/status/StatusViewer.tsx` photo effect called
     `statusMediaUrl(...).then(...)` with **no `.catch`**. Any rejection left
     `mediaLoading === true` forever → line ~251 `mediaLoading || !mediaUrl`
     spun an `ActivityIndicator` on a pure black stage. **That was one of two
     distinct black screens.**
   - Early-return branch set `mediaUrl=null` but never cleared `mediaLoading`
     (same hang for a photo row with a missing `mediaPath`).
   - Now: `catch` + always-clear, new `mediaFailed`/`retryToken` state, render
     shows "Could not load this status" + **Try again**; empty text bodies get
     an explicit fallback instead of a blank stage.
   - `npx tsc --noEmit` = 0, `npx eslint` = 0.

3. **The other black screen — diagnosed, not a code bug.**
   `adb reverse tcp:8081 tcp:8081` drops on its own. When it does, the debug APK
   logs `Unable to load script` (logcat PID was 29954) and paints black.
   It dropped **twice** in one session and cost two false investigations.
   Fix: run `adb reverse tcp:8081 tcp:8081` (todo: `scripts/dev-device.sh`).

4. **Backend proven healthy** for image statuses — so the bug was client-side:
   - bucket `statuses` exists (private, allows jpeg/png/webp/**video/mp4**, 8MB)
   - `createSignedUrl` returns a valid token
   - object fetch returns **HTTP 200**
   - rows exist with valid `media_path`

## Root cause found (not yet fixed)

**Others' stories never appear.** `fetchStatuses()` in
`src/lib/statuses.ts:79` has **no author filter** — it selects everything and
defers to RLS, whose policy is *"people you share a conversation with."* The
user has no mutual conversations, so only their own rows return. The data layer
is ready; the **contact graph is empty**.

Status visibility is **RESOLVED: follow-based (option C).**

You see a status only if you follow its author (the BRO `People` model —
following is communication-oriented, not a vanity-follower system).

**Do not just widen the RLS policy.** `fetchStatuses()` at
`src/lib/statuses.ts:79` must select from a `follows` graph, and the RLS
policy must be rewritten in terms of it. Needs:

1. a `follows` table (follower_id, followee_id, created_at, unique pair) if it
   does not already exist — check first, `squads`/`invites` are not it
2. RLS on `status_updates`: author's own rows **OR** rows whose author the
   viewer follows
3. `fetchStatuses()` unchanged in shape (it already has no author filter) — the
   restriction moves into the policy
4. the tray's empty state: a follow-based feed will be empty on day one, so
   surface **People you might follow** rather than "No statuses yet"

Until someone follows someone, the tray is legitimately empty. That is expected
and correct, not a bug — pair it with discovery so it fills.

## Not started

- **Migrate all status media to R2** — writer in
  `src/lib/statuses.ts:197` (`postStatus`) uploads to the Supabase `statuses`
  bucket; reader is `statusMediaUrl()` at `:51` (`createSignedUrl`). Both swap
  to R2. Supabase `statuses` bucket then retired.
- **Follow-based status visibility** — see "Root cause found" below.
- **Video statuses have no code path.** DB accepts `kind='video'`, but
  `StatusViewer` only branches photo vs text. Needs `expo-video`.
- Homepage rebuild: **infinite-scroll memes**, remove **Live now / Tap in / Around**
- Share meme → chat directly from homepage
- Download meme to device
- **Crowd-sourced meme upload** → R2 (unlimited, anyone). Note `gif_library`
  intentionally has **no** client write policy — opening it up needs per-user
  ownership + moderation flag + admin-only listing + server-side size/MIME checks.
- Add meme → status
- `scripts/dev-device.sh`

## Verification loop

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/
npx jest                      # 358 tests; keep pure logic out of files that
                              # import expo-file-system / expo-image-manipulator
adb reverse tcp:8081 tcp:8081 # re-run whenever the tunnel drops
adb shell monkey -p app.bro -c android.intent.category.LAUNCHER 1
```

Metro is at `/tmp/metro.log`. Device `app.bro` (Galaxy S9).

**Do not blind-tap the device.** A guessed coordinate landed in the user's real
WhatsApp chat and sent a message. Use `adb shell uiautomator dump` and tap the
exact `bounds` of the target — and read the dump carefully, the paste-based
parsing used earlier misaligns attributes.

## Secrets / env

Local `.env` holds `SUPABASE_SECRET_KEY` + `EXPO_PUBLIC_SUPABASE_URL`
(project `kora-b2e44`). Never commit it. GitHub Actions secrets are managed
with `gh secret set`. Raw Postgres (5432/6543) is unreachable through the
proxy — use `npx supabase db push --linked` or REST with the service-role key.

GCP/Firebase Test Lab and `ramus` are both dead ends (billing disabled /
APK upload cap) — GitHub Actions is the build source of truth.
