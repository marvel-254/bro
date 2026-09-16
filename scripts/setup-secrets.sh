#!/usr/bin/env bash
#
# setup-secrets.sh — Helper script to configure BRO GitHub secrets via the
# GitHub CLI (`gh`).
#
# This script prompts for the two values BRO's CI/CD workflows need and stores
# them as repository secrets on `bro-app/bro` (adjust REPO if you forked it).
#
# Usage:
#   ./scripts/setup-secrets.sh
#
# Requirements:
#   - `gh` CLI installed and authenticated (`gh auth status` must succeed).
#   - Sufficient permissions to manage Actions secrets on the target repo.
#
# Exit codes:
#   0  success
#   1  missing prerequisites or user cancelled
#   2  secret set failed

set -euo pipefail

REPO="bro-app/bro"

info()    { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
warn()    { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*" >&2; }
err()     { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }
die()     { err "$*"; exit "${2:-1}"; }

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
    die "GitHub CLI ('gh') is not installed. Install it from https://cli.github.com/ and retry."
fi

if ! gh auth status >/dev/null 2>&1; then
    die "You are not authenticated with the GitHub CLI. Run 'gh auth login' first."
fi

info "Using repository: ${REPO}"
info "Verifying access to ${REPO} ..."
if ! gh repo view "${REPO}" >/dev/null 2>&1; then
    die "Cannot access repository '${REPO}'. Check the name and your permissions."
fi

# ---------------------------------------------------------------------------
# 2. Gather inputs
# ---------------------------------------------------------------------------
info ""
info "=== EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (required) ==="
info "Obtain this from the Clerk dashboard:"
info "  https://dashboard.clerk.com -> select the BRO application ->"
info "  'API keys' -> 'Publishable key' (starts with 'pk_')."
printf "Paste the Clerk publishable key: "
read -r CLERK_KEY
CLERK_KEY="$(printf '%s' "$CLERK_KEY" | tr -d '[:space:]')"

if [ -z "$CLERK_KEY" ]; then
    die "No key provided — aborting."
fi

case "$CLERK_KEY" in
    pk_*) : ;;
    *) warn "Key does not start with 'pk_'. Clerk publishable keys always begin with 'pk_'. Continuing anyway." ;;
esac

info ""
info "=== EXPO_PUBLIC_API_URL (optional) ==="
info "Backend API base URL. The app falls back to https://api.bro.app if unset."
printf "API URL [https://api.bro.app]: "
read -r API_URL
API_URL="${API_URL:-https://api.bro.app}"
API_URL="$(printf '%s' "$API_URL" | tr -d '[:space:]')"

# ---------------------------------------------------------------------------
# 3. Set secrets
# ---------------------------------------------------------------------------
info ""
info "Setting secrets on ${REPO} ..."

# gh secret set will fail loudly if the value is empty, so guard explicitly.
if [ -z "$CLERK_KEY" ]; then
    die "Refusing to set an empty EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY."
fi

if gh secret set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \
    --repo "${REPO}" \
    --body "$CLERK_KEY"; then
    info "Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
else
    die "Failed to set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" 2
fi

if gh secret set EXPO_PUBLIC_API_URL \
    --repo "${REPO}" \
    --body "$API_URL"; then
    info "Set EXPO_PUBLIC_API_URL"
else
    die "Failed to set EXPO_PUBLIC_API_URL" 2
fi

# ---------------------------------------------------------------------------
# 4. Verify
# ---------------------------------------------------------------------------
info ""
info "Verifying secrets on ${REPO} ..."
if ! gh secret list --repo "${REPO}"; then
    die "Could not list secrets to verify." 2
fi

info ""
info "Done. Secrets are configured. CI workflows will pick them up on the next run."
info "Reminder: secrets must be re-added if you fork or rename the repository."