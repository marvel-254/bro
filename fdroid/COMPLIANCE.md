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
| 10 | Privacy policy URL hosted at https://bro-app.github.io/bro/privacy/ | ⚠️ Action Item | Privacy policy exists as PRIVACY.md in repo but is not yet hosted at https://bro-app.github.io/bro/privacy/ |

## Action Items

1. **Host privacy policy at https://bro-app.github.io/bro/privacy/** — The privacy policy exists in the repository as `PRIVACY.md` but must be published at the URL referenced in metadata before F-Droid submission.

## Summary

- **Total checks**: 10
- **Passed**: 9
- **Action items**: 1
- **Blocked**: No

BRO is ready for F-Droid submission once the privacy policy URL is live.
