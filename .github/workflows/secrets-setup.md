# GitHub Secrets & CI Environment Setup — BRO

This document explains which GitHub secrets must be configured for BRO's CI/CD
workflows to run correctly, how to obtain each value, and how to add them to the
repository.

> Scope: secrets apply at the **repository** level (`marvel-254/bro`). If you fork
> or rename the repository, re-add them. Do not commit them to source.

---

## 1. Secrets Overview

| Name | Required | Used by | Description |
|------|----------|---------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | `ci.yml`, `android-build.yml`, `release.yml` | Supabase project URL used for authentication, database, realtime, and storage. Embedded in the client at build time. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | `android-build.yml`, `release.yml` | Supabase anon key used to reach Supabase. Embedded in the client at build time. |
| `EXPO_PUBLIC_API_URL` | No | `android-build.yml`, `release.yml` | Backend API base URL. Optional — the app falls back to `https://api.bro.app`. |

### Notes

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are public by
  design — the anon key is safe for the client. It does **not** authenticate users or
  authorize sensitive operations. Storing them as GitHub secrets keeps them out of
  build logs and avoids leaking them in forks.
- Because these are read by the bundler at build time and embedded with the
  `EXPO_PUBLIC_` prefix, they must be present in the build environment (set as
  workflow `env:`) even though they are not true secrets.
- Never store the Supabase **service-role key (`service_role`)** in the mobile client
  or in this repository. The service-role key bypasses RLS and must stay
  server-side only.

---

## 2. Getting the Supabase Credentials

1. Go to the Supabase dashboard: **https://supabase.com/dashboard**
2. Select the BRO project: `bro` (project ref `zchsmnelvcuexchpwfgr`).
3. Open **Project Settings** → **API**.
4. Copy:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **API keys** → **anon public** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Do **not** use the `service_role` key in the client.

---

## 3. Adding Secrets via GitHub CLI (`gh`)

> Prerequisite: install the GitHub CLI and authenticate (`gh auth login`).
> The repo is `marvel-254/bro`; adjust the owner/name if you forked it.

### 3.1 One-off manual setup

```bash
# Set the (required) Supabase project URL
gh secret set EXPO_PUBLIC_SUPABASE_URL \
  --repo marvel-254/bro \
  --body "https://zchsmnelvcuexchpwfgr.supabase.co"

# Set the (required) Supabase anon key
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --repo marvel-254/bro \
  --body "eyJ...anon...anon"

# Set the (optional) API URL
gh secret set EXPO_PUBLIC_API_URL \
  --repo marvel-254/bro \
  --body "https://api.bro.app"
```

Verify:

```bash
gh secret list --repo marvel-254/bro
```

### 3.2 Automated setup with `scripts/setup-secrets.sh`

The helper script `scripts/setup-secrets.sh` wraps the commands above with
input validation, format checks, and verification output. It is executable and
safe to run locally.

```bash
./scripts/setup-secrets.sh
```

### 3.3 Secrets MUST be configured BEFORE running CI workflows

**GitHub Actions cannot read a secret that has never been set.** If a secret
is missing, the `${{ secrets.XXX }}` expression evaluates to an empty string.
This means:

- The build will appear to "succeed" but the app will be configured with empty
  or fallback values (e.g. no anon key → backend is a no-op).
- F-Droid builds produced without the anon key are **not usable**.

The lightweight workflow `.github/workflows/validate-secrets.yml` runs on
every pull request to `main`/`develop` and fails fast if a required secret is
missing.

### `.env` for local development

Copy `.env.example` to `.env` and fill in the Supabase values.

Never commit `.env`.

---

## 4. Adding Secrets via the GitHub Web UI

1. Open the repository on GitHub: **https://github.com/marvel-254/bro**
2. Navigate to **Settings** → **Secrets and variables** → **Actions** →
   **Repository secrets**.
3. Click **New repository secret**.
4. Add `EXPO_PUBLIC_SUPABASE_URL` with the Supabase project URL.
5. Add `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the Supabase anon public key.
6. (Optional) Add `EXPO_PUBLIC_API_URL` with your backend URL.
7. Click **Add secret** for each.

---

## 5. Local Development

For local development, create a `.env` file (ignored by git) from the template:

```bash
cp .env.example .env
# then edit .env and fill in values
```

You do **not** need GitHub secrets to develop locally — the `.env` file is read
by Expo/Node automatically. Never commit `.env`.

---

## 6. Workflow Reference

The following workflows consume these values:

| Workflow | Secrets consumed |
|----------|------------------|
| `.github/workflows/ci.yml` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `.github/workflows/android-build.yml` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` |
| `.github/workflows/release.yml` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` |
| `.github/workflows/gh-pages.yml` | (none — static HTML only) |
| `.github/workflows/validate-secrets.yml` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

If a required secret is missing, builds that call Supabase may fail or fall back to
no-op backend, which will surface as auth errors at runtime.

---

## 7. Troubleshooting

### 7.1 Missing secrets

| Symptom | Cause | Fix |
|---------|-------|-----|
| CI job fails with `EXPO_PUBLIC_SUPABASE_URL` empty / `undefined` | Secret was never set on the repo | Run `./scripts/setup-secrets.sh` or add via the web UI (Section 4) |
| `validate-secrets.yml` reports `MISSING` | Secret not configured | Set the secret, then re-run the workflow |
| Build succeeds but backend is a no-op at runtime | Anon key was empty at build time | Rebuild after setting the secret; Expo embeds values at build time |
| F-Droid build has no backend | Same as above — F-Droid builds from source, so the secret must be in the repo | Set the secret before the F-Droid build job runs |

### 7.2 Wrong key format

| Symptom | Cause | Fix |
|---------|-------|-----|
| `validate-secrets.yml` fails the URL check | The value is empty or not a URL | Copy the Project URL exactly from Supabase Settings → API |
| `setup-secrets.sh` aborts on empty anon key | User pasted the wrong field | Re-run the script and paste the **anon public** key, not the service_role key |
| Key contains leading/trailing spaces | Copy/paste artifact | `setup-secrets.sh` trims whitespace automatically. For manual `gh secret set`, wrap the value in quotes and avoid trailing spaces. |

### 7.3 `gh` CLI issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `gh: command not found` | GitHub CLI not installed | Install from https://cli.github.com/ |
| `gh auth status` fails / "not logged in" | Not authenticated | Run `gh auth login` and follow the prompts |
| `gh repo view marvel-254/bro` fails | No read access, or wrong repo name | Verify the repo exists and you have access; adjust `REPO` in the script if you forked |
| `gh secret set` returns a non-zero exit code | Insufficient permissions (e.g. collaborator without write access) | Ask a repository owner/admin to set the secret, or request write access |

### 7.4 Secrets are not picked up by a workflow run

Secrets are evaluated **at the time a workflow run starts**. If you set a secret
and a workflow is already queued/running, that run will use the old value.
Start a fresh run after setting the secret.

### 7.5 Never commit secrets

- `.env` is git-ignored. Never commit it.
- Do **not** commit the Supabase **service-role key** (`sb_secret_...`) anywhere
  in this repo. If a secret is ever committed accidentally, rotate it immediately
  in the Supabase dashboard and delete it from the repository history.
