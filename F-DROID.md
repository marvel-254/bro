# F-Droid Submission Guide — BRO

This guide walks through submitting **BRO** to F-Droid, the open-source Android
app repository. It covers the F-Droid scanner requirements, BRO's compliance
status, common rejection reasons, and how to respond to reviewer feedback.

---

## 1. Project Overview

**BRO** is a next-generation social communication platform built with
**React Native + Expo** for Android. It is licensed under the
**GNU General Public License v3.0 or later (GPL-3.0-or-later)**.

| Field             | Value                              |
|-------------------|------------------------------------|
| App name          | BRO                                |
| Package           | `app.bro`                          |
| License           | GPL-3.0-or-later                   |
| Source code       | https://github.com/marvel-254/bro     |
| Category          | Communication                      |
| Build command     | `cd android && ./gradlew assembleDebug` |

### Third-Party Services

BRO uses the following third-party services at runtime. These are **not**
bundled into the app binary:

| Service | Purpose                        |
|---------|--------------------------------|
| Clerk   | Authentication and user mgmt   |
| Convex  | Database, real-time sync, hosting |

These services are documented in the app's `PRIVACY.md` and
`fdroid/README.md`.

---

## 2. Prerequisites

Before beginning the submission process, ensure:

- [ ] The repository is **public** on GitHub.
- [ ] A **`LICENSE`** file containing GPL terms exists at the repository root.
- [ ] A **`PRIVACY.md`** file exists at the repository root.
- [ ] The app builds from source via `./gradlew assembleDebug`.
- [ ] No proprietary SDKs or tracking/analytics libraries are included.
- [ ] `app.json` declares a `permissions` array and `usesCleartextTraffic: false`.
- [ ] No keystore or signing config files exist in the repository.
- [ ] No hardcoded API keys exist in `src/`.
- [ ] Screenshots are available (see `fdroid/SCREENSHOTS.md`).

---

## 3. Step-by-Step Submission Process

### Step 1 — Verify compliance in CI

Run the **F-Droid Compliance Check** workflow locally or on a branch:

```bash
git checkout -b fdroid-submission-check
git push origin fdroid-submission-check
```

GitHub Actions (`.github/workflows/fdroid-check.yml`) will run
automatically and verify all F-Droid inclusion requirements.

### Step 2 — Prepare metadata

Review and confirm `fdroid/metadata.toml` contains accurate information:

- `Name` — application display name
- `Author` — author or maintainer name
- `Email` — contact email
- `Source` — public source code URL
- `License` — `GPL-3.0-or-later`
- `Category` — `Communication`
- `Description` — short description of the app
- `Disclaimer` — notes about third-party services and privacy policy URL
- `PrivacyPolicy` — stable URL to the privacy policy

### Step 3 — Capture and place screenshots

See `fdroid/SCREENSHOTS.md` for the full list of required screenshots.

Screenshots for F-Droid should be placed in the metadata `fdroid/` directory
or in the F-Droid data repository under the app's folder:

```
fdroid/
├── metadata.toml
├── SCREENSHOTS.md
└── screenshots/
    └── README.md
```

### Step 4 — Submit to F-Droid

F-Droid accepts submissions via **merge requests** to the
[F-Droid data repository](https://gitlab.com/fdroid/fdroiddata).

1. Fork or clone the F-Droid data repository:
   https://gitlab.com/fdroid/fdroiddata

2. Run the F-Droid server tools to generate a metadata merge request:

   ```bash
   cd fdroiddata
   python3 makemd.py --submit /path/to/bro
   ```

   This generates a `.yml` metadata file in
   `fdroiddata/metadata/`.

3. Alternatively, manually create a metadata file at
   `fdroiddata/metadata/bro.yml` following the F-Droid
   [metadata reference](https://f-droid.org/docs/Build_Metadata_Reference/).

4. Commit and push your merge request.

### Step 5 — Monitor the build

F-Droid will automatically attempt to build the app from source. Monitor the
merge request and the [F-Droid build server](https://build.fdroid.org/) for
build status and review feedback.

### Step 6 — Address feedback

If the F-Droid reviewer requests changes, update the metadata, source code,
or documentation as needed, then push the changes to your merge request.

### Step 7 — Publication

Once the build succeeds and the review is approved, F-Droid will publish the
app to the main repository. You can find it at:
https://f-droid.org/packages/app.bro/

---

## 4. F-Droid Scanner Requirements

The F-Droid build server runs an automated scan on every submission. The
following requirements must be met:

### 4.1 License

- A `LICENSE` file containing **GPL**, **GNU General Public License**, **MIT**,
  **Apache-2.0**, or another F-Droid-approved open-source license must exist.
- The `License` field in metadata must match the actual license.
- **BRO compliance**: `LICENSE` contains the full text of the GNU General
  Public License v3.0. ✅

### 4.2 Tracking and Analytics

F-Droid rejects apps that include anti-features such as:

- **Tracking** — Google Analytics, Firebase Analytics, Crashlytics, Mixpanel,
  Amplitude, Segment, etc.
- **NonFreeNet** — network-based services that are not open-source.
- **KnownVuln** — dependencies with known security vulnerabilities.

- **BRO compliance**: No tracking or analytics SDKs are included. ✅

### 4.3 Advertising

F-Droid rejects apps that include advertising SDKs such as:

- AdMob, Google Mobile Ads, Unity Ads, Facebook Audience Network, etc.
- Apps with the **Ads** anti-feature are listed but still accepted if ads are
  clearly optional and non-intrusive; however, BRO includes none.

- **BRO compliance**: No advertising SDKs are included. ✅

### 4.4 Proprietary SDKs

- No proprietary (closed-source) libraries may be compiled into the app binary.
- All dependencies must be open-source or have F-Droid-compatible licenses.
- **BRO compliance**: All dependencies are MIT or similarly open-source. ✅

### 4.5 Permissions

- Only declare permissions that are essential to the app's function.
- `INTERNET` is allowed for apps that communicate over the network.
- `ACCESS_FINE_LOCATION`, `READ_CONTACTS`, `CAMERA`, etc. require justification.

- **BRO compliance**: Only `INTERNET` permission is declared. ✅

### 4.6 Cleartext Traffic

- `usesCleartextTraffic` must be set to `false` to prevent unencrypted HTTP
  traffic.
- **BRO compliance**: Set in `app.json` under `android.usesCleartextTraffic`. ✅

### 4.7 Signing

- No keystore or signing configuration files (`.jks`, `.keystore`) should be
  committed to the repository.
- F-Droid handles signing during its build process.
- **BRO compliance**: No signing files in the repository. ✅

### 4.8 Hardcoded Secrets

- No API keys, tokens, or credentials should be hardcoded in source files.
- Environment variables should be used via `EXPO_PUBLIC_*` prefixed identifiers.
- **BRO compliance**: No hardcoded keys in `src/`. ✅

---

## 5. BRO-Specific Compliance Notes

### 5.1 Third-Party Authentication

BRO uses **Clerk** for authentication. Clerk provides a publishable key
(`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) that is injected at build time via
GitHub Actions secrets. The key is never committed to the repository.

If a reviewer questions Clerk as a "tracking" service, clarify that:
- Clerk is an authentication provider, not an analytics/tracking SDK.
- No user data is sent to Clerk for analytics purposes.
- Clerk's privacy policy is linked in `PRIVACY.md`.

### 5.2 Third-Party Backend

BRO uses **Convex** for its backend (database, real-time sync, hosting).
Convex is used at runtime and is not bundled into the app binary.

Convex provides the API endpoints that BRO connects to over HTTPS. No
Convex SDK or library is imported into the React Native client; the app
communicates with Convex via standard HTTPS API calls.

### 5.3 Offline-First Design

BRO is designed with mobile network conditions in mind:
- UI state is preserved locally.
- Outgoing messages are displayed with pending/sending states.
- Users are informed of network status.

This aligns with F-Droid's preference for privacy-respecting, offline-capable apps.

---

## 6. Common Rejection Reasons and Prevention

| Rejection Reason                          | Cause                                    | Prevention                                           |
|-------------------------------------------|------------------------------------------|------------------------------------------------------|
| Tracking anti-feature                     | Analytics/tracking SDK in source         | No analytics libraries; use CI check                 |
| Ads anti-feature                          | Ad network SDK in source                 | No ad libraries; use CI check                        |
| Non-free dependencies                     | Proprietary library compiled in          | Audit all dependencies in `package.json`           |
| Missing license                           | No LICENSE file                          | Commit `LICENSE` with full GPL text                |
| Missing privacy policy                    | No privacy policy URL                    | Publish `PRIVACY.md` to GitHub Pages               |
| Hardcoded secrets                         | API keys in source                       | Use environment variables; run CI check            |
| Signing config in repo                    | `.jks`/`.keystore` committed            | Never commit keystore files; use CI check           |
| Cleartext traffic enabled                 | `usesCleartextTraffic: true`             | Set to `false` in `app.json`                       |
| Build fails                               | Inable to compile from source            | Ensure `./gradlew assembleDebug` works             |
| Missing source URL                        | Repository not public or URL wrong      | Set `Source` in metadata to public GitHub URL      |

---

## 7. How to Respond to Reviewer Feedback

When the F-Droid reviewer leaves feedback on your merge request:

1. **Read the feedback carefully** and identify the specific requirement that
   needs addressing.
2. **Make the change** in your source repository (e.g., update metadata,
   remove a dependency, fix a build issue).
3. **Push the fix** and reference the commit in a reply on the merge request.
4. **Ask for clarification** if a requirement is unclear — reviewers are
   usually helpful and can explain the reasoning.
5. **Wait for the build to re-run** — F-Droid rebuilds automatically on
   metadata changes.

### Common reply templates:

**For tracking/analytics questions:**
> BRO does not include any tracking, analytics, or advertising SDKs. The app
> only uses Clerk for authentication and Convex for backend API communication.
> Both services are referenced in PRIVACY.md. No user data is collected for
> analytics purposes.

**For third-party service questions:**
> Clerk and Convex are used at runtime via HTTPS API calls. No third-party SDK
> is compiled into the app binary. The app ships with only open-source
> dependencies listed in `package.json`.

**For permission questions:**
> BRO only requests the `INTERNET` permission, which is required for network
> connectivity to send and receive messages, authenticate users, and sync data
> with the backend.

---

## 8. Post-Submission Checklist

After submitting to F-Droid:

- [ ] The merge request is assigned to a reviewer.
- [ ] The F-Droid build server starts a build and reports status.
- [ ] The app page appears at https://f-droid.org/packages/app.bro/ (may take
      a few hours to propagate).
- [ ] The app is listed under the **Communication** category.
- [ ] Screenshots display correctly on the F-Droid website.
- [ ] The privacy policy link works.
- [ ] Future updates are picked up by F-Droid's auto-update mechanism.

---

## 9. Links and References

- F-Droid main site: https://f-droid.org/
- F-Droid documentation: https://f-droid.org/docs/
- Build metadata reference: https://f-droid.org/docs/Build_Metadata_Reference/
- F-Droid data repository (submit here): https://gitlab.com/fdroid/fdroiddata
- F-Droid inclusion preferences: https://f-droid.org/docs/Inclusion_Preferences/
- F-Droid inclusion policy: https://f-droid.org/docs/Inclusion_Policy/
- F-Droid anti-features: https://f-droid.org/docs/Anti-Features/
- F-Droid build server: https://build.fdroid.org/
- BRO source: https://github.com/marvel-254/bro
- BRO privacy policy: https://marvel-254.github.io/bro/
