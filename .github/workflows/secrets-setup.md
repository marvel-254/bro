# GitHub Secrets & CI Environment Setup — BRO

This document explains which GitHub secrets/variables must be configured for
BRO's CI/CD workflows to run correctly, how to obtain each value, and how to
add them to the repository.

> Scope: secrets apply at the **repository** level (`bro-app/bro`). If you fork
> or rename the repository, re-add them. Do not commit them to source.

---

## 1. Secrets Overview

| Name | Required | Used by | Description |
|------|----------|---------|-------------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | `ci.yml`, `android-build.yml`, `release.yml`, `gh-pages.yml` | Clerk publishable key used for authentication. Embedded in the client at build time. |
| `EXPO_PUBLIC_API_URL` | No | `android-build.yml`, `release.yml` | Backend API base URL. Optional — the app falls back to `https://api.bro.app`. |
| `NODE_AUTH_TOKEN` | Only if private packages | `npm ci` steps | npm registry token for private packages (not needed today; reserved for future). |

### Notes

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is a **publishable** (public) key by
  design — it is safe for the client. It does **not** authenticate users or
  authorize sensitive operations. Storing it as a GitHub secret keeps it out
  of build logs and avoids leaking it in forks.
- Because these are read by the bundler at build time and embedded with the
  `EXPO_PUBLIC_` prefix, they must be present in the build environment (set as
  workflow `env:`) even though they are not true secrets.
- Never store the Clerk **secret key** (`sk_...`) or any server-side credential
  in the mobile client or in this repository.

---

## 2. Getting the Clerk Publishable Key

1. Go to the Clerk dashboard: **https://dashboard.clerk.com**
2. Select your BRO application (or create one at **https://dashboard.clerk.com/create**).
3. In the left sidebar, open **Configure** → **API keys** (or **Environment** → **API keys**).
4. Locate **Publishable key** — it begins with `pk_`.
5. Copy the value. You will paste it into GitHub as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

> The same key exists for each environment (Development / Production) in Clerk.
> Use the **Production** key for release builds.

---

## 3. Adding Secrets via GitHub CLI (`gh`)

> Prerequisite: install the GitHub CLI and authenticate (`gh auth login`).
> The repo is `bro-app/bro`; adjust the owner/name if you forked it.

### 3.1 One-off manual setup

```bash
# Set the (required) Clerk publishable key
gh secret set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \
  --repo bro-app/bro \
  --body "pk_test_..."  # paste the real key, do not keep the quotes/placeholder

# Set the (optional) API URL
gh secret set EXPO_PUBLIC_API_URL \
  --repo bro-app/bro \
  --body "https://api.bro.app"
```

Verify:

```bash
gh secret list --repo bro-app/bro
```

### 3.2 Automated setup with `scripts/setup-secrets.sh`

The helper script `scripts/setup-secrets.sh` wraps the commands above with
input validation, format checks, and verification output. It is executable and
safe to run locally.

```bash
./scripts/setup-secrets.sh
```

It will:
1. Check that `gh` is installed and authenticated.
2. Prompt for the Clerk publishable key (warns if it does not start with `pk_`).
3. Prompt for the API URL (defaults to `https://api.bro.app`).
4. Set both secrets via `gh secret set`.
5. Print `gh secret list` so you can confirm they were stored.

### 3.3 Secrets MUST be configured BEFORE running CI workflows

**GitHub Actions cannot read a secret that has never been set.** If a secret
is missing, the `${{ secrets.XXX }}` expression evaluates to an empty string.
This means:

- The build will appear to "succeed" but the app will be configured with empty
  or fallback values (e.g. no Clerk key → auth is a no-op).
- F-Droid builds produced without the Clerk key are **not usable**.

Therefore, before pushing to `main`/`develop` (or opening a pull request),
verify that the required secrets exist on the repository:

```bash
gh secret list --repo bro-app/bro
```

You should see at minimum:

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY   Set at <date>
EXPO_PUBLIC_API_URL                 Set at <date>
```

The lightweight workflow `.github/workflows/validate-secrets.yml` also runs on
every pull request to `main`/`develop` and fails fast if a required secret is
missing.

### 3.4 Non-secret environment variables

`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` are used as
**environment variables** in workflows. To avoid echoing secrets in logs, the
workflows read them via `${{ secrets.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY }}` and
pass them into the `env:` context of build steps.

---

## 4. Adding Secrets via the GitHub Web UI

1. Open the repository on GitHub: **https://github.com/marvel-254/bro**
2. Navigate to **Settings** → **Secrets and variables** → **Actions** →
   **Repository secrets**.
3. Click **New repository secret**.
4. Add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` with the Clerk publishable key.
5. (Optional) Add `EXPO_PUBLIC_API_URL` with your backend URL.
6. Click **Add secret** for each.

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
| `.github/workflows/ci.yml` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `.github/workflows/android-build.yml` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` |
| `.github/workflows/release.yml` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL` |
| `.github/workflows/gh-pages.yml` | (none — static HTML only) |

If a required secret is missing, builds that call `ClerkProvider` may fail or
fall back to no-op auth, which will surface as auth errors in the emulator.

---

## 7. Troubleshooting

### 7.1 Missing secrets

| Symptom | Cause | Fix |
|---------|-------|-----|
| CI job fails with `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` empty / `undefined` | Secret was never set on the repo | Run `./scripts/setup-secrets.sh` or add via the web UI (Section 4) |
| `validate-secrets.yml` reports `MISSING` | Secret not configured | Set the secret, then re-run the workflow |
| Build succeeds but auth is a no-op / Clerk errors at runtime | Publishable key was empty at build time | Rebuild after setting the secret; Expo embeds values at build time |
| F-Droid build has no auth | Same as above — F-Droid builds from source, so the secret must be in the repo | Set the secret before the F-Droid build job runs |

### 7.2 Wrong key format

| Symptom | Cause | Fix |
|---------|-------|-----|
| `validate-secrets.yml` fails the `pk_` format check | The value does not start with `pk_` | Clerk publishable keys always begin with `pk_` (e.g. `pk_test_...` or `pk_live_...`). Double-check you copied the **Publishable** key, not the **Secret** key (`sk_...`). |
| `setup-secrets.sh` warns "does not start with 'pk_'" | User pasted the wrong key | Re-run the script and paste the correct Publishable key from the Clerk dashboard |
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
- Do **not** commit the Clerk **secret key** (`sk_...`) anywhere in this repo.
- If a secret is ever committed accidentally, rotate it immediately in the Clerk
  dashboard and delete it from the repository history.
