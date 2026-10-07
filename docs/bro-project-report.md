# BRO — Project Report & Blank-Screen Incident

**Date:** 2026-10-06
**Author:** Agent (on behalf of sir)
**Repo:** `marvel-254/bro` · **Branch:** `feat/supabase-chat` (PR #3 open → main)
**App:** BRO — Expo / React Native chat app for a private group of friends ("the bros")

---

## 1. Executive summary

BRO is a dark-first, near-black chat app built with **Expo SDK 53** (RN 0.79.6,
React 19, expo-router 5.1.11) and **Supabase** (Auth, Postgres, Realtime,
Storage). The backend, schema (13 migrations), CI, and a Vercel-hosted landing
page are all live.

**Incident:** the APK published on the download page (`/download.html`) opens to
a **blank black screen** on a phone and nothing else.

**Root cause (corrected 2026-10-07):** there were **three** independent faults,
not one. The first was diagnosed here originally; the other two only surfaced
once the release build was actually launched on a device.

1. **The published artifact was a debug build.** Debug builds do **not** embed
   the JS bundle — they load it at runtime from the Metro dev server. On a
   phone with no Metro running, the native shell starts, cannot find the
   bundle, and renders a blank black screen. CI never caught this because it
   only builds and uploads the APK; it never launches it.
2. **The release build could not bundle at all.** Four latent defects, each
   invisible to a debug build because debug never bundles:
   `package.json` `main` pointed at a missing `App.js` (should be
   `expo-router/entry`); 15 route files imported `../../../src/...` from
   two-deep routes, escaping the project root; three route files used a `@/`
   alias with no resolver configured; and `expo-linking`,
   `react-native-screens`, `query-string` and `use-latest-callback` were never
   installed (`npm install --legacy-peer-deps` skipped them).
3. **The app rendered an empty tree even once bundled.** This was the real
   cause of the black screen and it was silent:
   - `app/_layout.tsx` rendered `{children}`. expo-router v5 does not hand the
     root layout a `children` prop, so it arrived `undefined` and nothing
     mounted — no crash, no error. The root layout must render `<Slot />`.
   - `query-string` had resolved to 9.x, which is **ESM-only**
   (`"type": "module"`) and exposes only a default export. expo-router's fork
     does `__importStar(require("query-string")).stringify`, which threw
     `queryString.stringify is not a function` while building the bottom tab
     bar. Pinned to 7.1.1, the last CommonJS line with named exports.

**Lesson:** every one of these was invisible until the app was *run*. The
release build is now gated by a fast `expo export` bundling check, and the root
layout is wrapped in an error boundary that renders failures on screen instead
of a silent blank.

---

## 2. Project overview

| Item | Value |
|---|---|
| App name | **bro** (not "BROS" — sir confirmed) |
| Package / scheme | `app.bro` / `bro://` |
| Stack | Expo SDK 53, RN 0.79.6, React 19, expo-router 5.1.11, TypeScript |
| Backend | Supabase project `bro` (ref `zchsmnelvcuexchpwfgr`, Central EU) |
| Auth | Supabase Auth (Clerk fully removed) |
| Repo | `github.com/marvel-254/bro` |
| Working branch | `feat/supabase-chat` (PR #3 → `main`) |
| Landing page | `bro.omixsystems.store` (Vercel, project `bro-landing`) |
| Download page | `/download.html` → Vercel Blob APK |
| License | GPL-3.0-or-later |

### 2.1 Repository layout

- `app/` — expo-router routes: `index` (auth redirect), `(tabs)` (Home/Chats/Bros/Me),
  `(auth)` (welcome/sign-in/sign-up), `chat/`, `spaces/`, `new-chat`, `search`, `activity`, `call`.
- `src/` — features (`auth`, `conversations`, `people`, `pulse`, `spaces`, `activity`,
  `calls`, `profile`, `search`, `you`) and lib (`supabase.ts`, `auth-context.tsx`,
  `presence-context.tsx`, `people-context.tsx`, `conversations.ts`, `calls.ts`, …).
- `supabase/migrations/` — 001 initial schema → 013 conversation previews (all applied to live DB).
- `scripts/` — `verify-activity-triggers.sh`, `verify-media-storage.sh`,
  `verify-friendships.sh`, `upload-apk-blob.mjs`, `setup-secrets.sh`.
- `.github/workflows/` — `android-build.yml`, `release.yml`, `ci.yml`,
  `validate-secrets.yml`, `fdroid-check.yml`.
- `website/` — static Vercel landing (index, download, vapor.css, PWA bits).
- `docs/` — this report, `AGENT_START_HERE.md`, `code_review.md`, `research/`.

### 2.2 Live infrastructure

- **Supabase project `bro`** — 13 migrations applied; RLS on all tables; realtime
  publication; storage buckets (avatars, chat-media, voice-notes, statuses) created
  and RLS-verified.
- **Repo secrets set:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  `BLOB_READ_WRITE_TOKEN`.
- **Local `.env`** (gitignored) — anon key, DB password, service-role key.
- **Test user** `broprobe2026@gmail.com` + "Smoke Test" conversation exist in the DB.

### 2.3 Feature status (on `feat/supabase-chat`)

Landed and verified: presence (online/afk/offline, Who's Around), conversation
list + detail, branches, spaces, activity feed + notifications (DB triggers),
search, friendships (request/accept/decline), media storage + RLS, 1:1 voice and
video calls (WebRTC), invites + deep links, profile setup wizard, animated
welcome.

Quality: typecheck clean, lint 0 errors, tests passing (17 suites).

---

## 3. The blank black screen — symptom

- User installs the APK from the download page.
- App icon launches, then shows a **blank black screen** and nothing else
  (no logo, no welcome screen, no error text).
- No crash dialog; the process stays alive but renders nothing.

This is the classic behaviour of a React Native **debug** APK installed on a
device with no Metro dev server available.

---

## 4. Investigation & evidence

### 4.1 What is being served

The download page (`website/download.html`) links to:

```
https://x3zj3ht2vzg6otli.public.blob.vercel-storage.com/apk/app-debug.apk
```

- Filename: `app-debug.apk`
- Size: **213,248,757 bytes (~203 MB)** — consistent with a debug build
  (4 ABIs of `.so` files + dev tooling; a release APK is far smaller).
- Served by Vercel Blob, updated on every merge to `main` via
  `scripts/upload-apk-blob.mjs` (stable `/apk/app-debug.apk` path).

### 4.2 How it is built (CI)

Both build workflows run the **debug** Gradle task:

- `android-build.yml` → `./gradlew assembleDebug` → uploads `app-debug.apk`.
- `release.yml` (tag `v*`) → `./gradlew assembleDebug` → "Build Test APK (Debug)".

### 4.3 APK contents (inspected directly)

The APK's ZIP central directory was read (range fetch of the tail). Result:
**no JS bundle and no Hermes bytecode file** are present. The only asset is
`assets/app.config` (585 bytes). There is **no** `index.android.bundle` and no
`index.android.hbc` (Hermes bytecode) entry. The APK contains only native code
(`lib/*.so`), DEX, resources, and the manifest.

### 4.4 Why debug builds skip the bundle

`android/app/build.gradle` (generated by `expo prebuild`) states:

> *"The list of variants that are debuggable. For those we're going to skip the
> bundling of the JS bundle and the assets. By default is just 'debug'."*

So a debug build intentionally omits the JS bundle. At runtime the native shell
asks Metro (`localhost:8081`) for the bundle; on a phone with no Metro the
request fails and the app shows a black screen.

### 4.5 Why CI didn't catch it

CI only:
1. runs `expo prebuild`,
2. runs `./gradlew assembleDebug`,
3. verifies the APK file exists,
4. uploads it to Vercel Blob.

It never installs the APK on a device and never launches it without Metro, so a
missing bundle is invisible to the pipeline.

---

## 5. Diagnosis

**Primary cause:** the published APK is a **debug** build with **no embedded JS
bundle**, so it cannot run standalone on a phone.

**Secondary factors / notes:**
- The `release` build type in `build.gradle` currently signs with the **debug
  keystore** (`signingConfig signingConfigs.debug`) — acceptable for a test
  build, but a real keystore is needed for production distribution.
- The `release` build type **does** embed the JS bundle (it is not in the
  `debuggableVariants` list), so switching to `assembleRelease` fixes the blank
  screen.
- The download page advertises "~200 MB" and "Continuous — rebuilt on every
  merge to main", which is accurate for the debug artifact but not what end
  users should be installing.

---

## 6. Recommended fix

1. **Build a release APK** locally to verify:
   ```bash
   cd android && ./gradlew assembleRelease
   # output: android/app/build/outputs/apk/release/app-release.apk
   ```
   Install it on a phone — it should boot to the welcome screen (no Metro).

2. **Update the CI workflows** to produce the release artifact:
   - `android-build.yml`: change `assembleDebug` → `assembleRelease` and upload
     `app-release.apk` (or keep both and upload the release one).
   - `release.yml`: same change (it is currently mislabeled "Build Test APK (Debug)").
   - Update `scripts/upload-apk-blob.mjs` default path and the download page link
     to the release artifact.

3. **Sign properly for distribution** (production):
   - Generate a real keystore, store it as a repo secret, and reference it in
     `build.gradle` release signing (or use EAS Build / a signing CI job).
   - The current debug-key signing works for internal testing only.

4. **Update the download page** to reflect the release build (size, "signed
   release build" wording) and keep the stable Blob URL.

5. **Regression check:** after publishing, install the new APK on a clean phone
   and confirm the welcome screen appears and sign-up works against the live
   Supabase project.

---

## 7. Open items (unrelated to this incident)

1. **Rotate the Supabase service-role key** — it was pasted in chat and lives in
   local `.env`; it bypasses RLS. Only sir can rotate it in the dashboard.
2. **Realtime still unproven** — needs two devices/accounts to confirm messages
   arriving in a second client.
3. **Tag-push workflow trigger** — GitHub-side issue seen on the aide project;
   publish tags via `gh workflow run ... --ref <tag>` if needed.
4. **F-Droid** — metadata and compliance checks exist; publishing is a separate
   step.

---

## 8. References

- Download page: `website/download.html`
- Blob uploader: `scripts/upload-apk-blob.mjs`
- Build workflows: `.github/workflows/android-build.yml`, `.github/workflows/release.yml`
- Gradle config: `android/app/build.gradle`
- Handoff / state of work: `handoff.md`
- Builder start here: `docs/AGENT_START_HERE.md`
