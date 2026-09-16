# F-Droid Compliance Report — BRO

This report verifies BRO's compliance with F-Droid inclusion requirements.

## Compliance Checklist

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Open-source license (GPL v3) | ✅ Pass | LICENSE file confirms GNU General Public License v3.0 |
| 2 | Privacy policy exists | ✅ Pass | PRIVACY.md present in repository root |
| 3 | No tracking SDKs (Google Analytics, Firebase Analytics, Crashlytics) | ✅ Pass | No tracking or analytics SDKs found in codebase |
| 4 | No advertising SDKs | ✅ Pass | No advertising SDKs found in codebase |
| 5 | No proprietary SDKs linked into the app binary | ✅ Pass | No proprietary SDKs linked into the app binary |
| 6 | Minimal permissions (INTERNET only) | ✅ Pass | app.json specifies only `INTERNET` permission |
| 7 | UsesCleartextTraffic: false | ✅ Pass | app.json specifies `usesCleartextTraffic: false` |
| 8 | No hardcoded secrets or API keys | ✅ Pass | No hardcoded secrets or API keys found |
| 9 | No signing configs in repo | ✅ Pass | No signing configurations found in repository |
| 10 | Privacy policy URL hosted at https://marvel-254.github.io/bro/ | ✅ Pass | Privacy policy deployed via GitHub Pages workflow |

## Action Items

1. **None** — Privacy policy is live at https://marvel-254.github.io/bro/ via GitHub Pages.

## Summary

- **Total checks**: 10
- **Passed**: 10
- **Action items**: 0
- **Blocked**: No

BRO is ready for F-Droid submission.
