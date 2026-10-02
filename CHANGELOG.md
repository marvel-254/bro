# BRO Changelog

All notable changes to BRO will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

- Phase 1 — Bug fixes and code quality (TypeScript 0 errors, ESLint 0 errors, 42 tests passing)
- Phase 2 — F-Droid publishing preparation (metadata, privacy hosting, CI compliance)
- Core features: Pulse, People, Conversations, Branches, Spaces, Activity, Presence
- Clerk authentication integrated
- Expo Router navigation

## [0.1.0] — 2026-10-02

Initial release.

### Added
- Android APK build (debug)
- GitHub Actions CI (lint, typecheck, tests)
- Android build pipeline
- F-Droid metadata file (`fdroid/app.bro.yml`)
- Privacy policy hosted at `https://marvel-254.github.io/bro/`
- Pulse, People, Spaces, Conversation, Profile screens
- Clerk authentication

### Fixed
- Import path errors in `PulseScreen.tsx`
- Clerk auth hook naming conflicts (`useClerkAuth` vs `useAuth`)
- Unused navigation stack files removed

### Security
- `usesCleartextTraffic: false` in `app.json`
- Only `INTERNET` permission requested
- No hardcoded API keys or signing configs in repo
