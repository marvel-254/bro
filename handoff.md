# BRO — Handoff / State of Work

Date: 2026-10-02
Agent: goose
Project root: /home/marvel/Projects/bro/
Branch: main

---

## 1. What Was Done

### Website / Landing (bro.omixsystems.store)
- [x] `website/index.html` rebuilt as actual landing page (hero, features, download CTA, footer)
- [x] `website/download.html` created (APK download guide with changelog, install steps)
- [x] `website/app-logo.png` — app icon copied from `assets/icon.png`
- [x] `website/og-image.svg` — branded social preview (1200×630)
- [x] `website/sitemap.xml`
- [x] `website/llms.txt`
- [x] `website/PRIVACY.md`
- [x] `website/TERMS.md`
- [x] `index.html` — dark mode toggle (`localStorage`), OG meta tags, `canonical`, `sitemap`
- [x] Domain `bro.omixsystems.store` assigned to Vercel project `bro-landing`
- [x] Deployed to Vercel (`bro-landing-lake.vercel.app` alias; latest build ID available)

### GitHub Releases
- [x] `CHANGELOG.md` created at root and committed (`fc09dc5`)
- [x] `v0.1.0` tag pushed
- [x] Release `v0.1.0` created on GitHub (`https://github.com/marvel-254/bro/releases/tag/v0.1.0` — 200 OK)
- [x] `release.yml` exists and triggers on `v*` tags

### F-Droid Publishing
- [x] `fdroid/app.bro.yml` created (YAML metadata)
- [x] Subagent (`20261002_3`) tasked to submit merge request to `gitlab.com/fdroid/fdroid-data`
- [x] `FDROID.md`, `.github/workflows/fdroid-check.yml` verified (license, privacy, permissions, no tracking)

### Code / Fixes (Phase 1 — completed earlier)
- [x] Import fixes (`_layout.tsx`, theme imports)
- [x] Clerk auth integration (`useClerkAuth`, `useClerk`)
- [x] Unused React Navigation files deleted (`RootStack`, `TabsLayout`, `AuthStack`, `MainTabs`)
- [x] TypeScript 0 errors, ESLint 0 errors, Jest 42 tests pass
- [x] `CHANGELOG.md` added

---

## 2. What's Left / Pending

### F-Droid (needs verification)
- [ ] Confirm subagent result from `20261002_3` (MR to F-Droid data repo)
- [ ] Verify F-Droid CI passes after merge
- [ ] Confirm `https://marvel-254.github.io/bro/` (privacy) reachable (auto-built by `.github/workflows/gh-pages.yml`)

### Android Build / APK
- [ ] `android-build.yml` produces APK artifact (`BRO-debug.apk`) via CI
- [ ] APK file does NOT exist locally (local heavy builds avoided per AGENTS.md; must come from CI)
- [ ] `download.html` points to `v0.1.0` release tag; if user wants APK attached to release, either:
  - Trigger CI and upload artifact via `gh release upload v0.1.0 BRO-debug.apk`
  - Or update `download.html` to link directly to the CI artifact download URL

### Verification
- [ ] Confirm Android build passes with `usesCleartextTraffic: false` and `INTERNET` permission (`app.json` checked; settings present)
- [ ] Confirm `bro.omixsystems.store` resolves to latest Vercel deploy (last deploy returned auth error; newer files may need redeploy trigger)

---

## 3. Where Everything Is

| Item | Path / URL |
|---|---|
| Project root | `/home/marvel/Projects/bro/` |
| Source / app | `src/` (features: auth, pulse, people, spaces, conversations) |
| Website (deployed) | `website/` → `bro.omixsystems.store` / Vercel (`bro-landing`) |
| Website index | `website/index.html` |
| Download page | `website/download.html` |
| OG image | `website/og-image.svg` |
| Sitemap | `website/sitemap.xml` |
| LLM file | `website/llms.txt` |
| Privacy (repo) | `website/PRIVACY.md` |
| Terms (repo) | `website/TERMS.md` |
| Privacy (hosted) | `https://marvel-254.github.io/bro/` (built by `gh-pages.yml` from `PRIVACY.md`) |
| Changelog | `/CHANGELOG.md` (committed `fc09dc5`) |
| Release tag | `v0.1.0` (pushed) |
| Release URL | `https://github.com/marvel-254/bro/releases/tag/v0.1.0` |
| F-Droid metadata | `fdroid/app.bro.yml` |
| F-Droid doc | `fdroid/FDROID.md` |
| CI workflows | `.github/workflows/` (`ci.yml`, `android-build.yml`, `release.yml`, `fdroid-check.yml`, `gh-pages.yml`) |
| App logo (website) | `website/app-logo.png` (from `assets/icon.png`) |
| Vercel project | `bro-landing` |

---

## 4. Key Decisions / Notes

- **Domain**: `bro.omixsystems.store` assigned to Vercel; site references updated.
- **APK strategy**: Local build skipped (resource constraints per AGENTS.md); relies on `.github/workflows/android-build.yml`. If user wants APK on release page, attach CI artifact or trigger build and upload.
- **Privacy**: Auto-updating (`PRIVACY.md` → `gh-pages.yml` → hosted site). Terms (`TERMS.md`) is static.
- **F-Droid**: Metadata created; submission pending subagent confirmation / MR merge.
- **No secrets** committed; `app.json` uses `usesCleartextTraffic: false`, `permissions: ["INTERNET"]`.

---

## 5. Immediate Next Actions (if continuing)

1. Verify/redeploy Vercel with latest files (logo, sitemap, meta) if auth error blocked it.
2. Trigger `android-build.yml` CI or attach APK to `v0.1.0` release.
3. Confirm F-Droid MR status (`20261002_3`).
4. Push latest commit (`CHANGELOG.md`) to remote if needed.
