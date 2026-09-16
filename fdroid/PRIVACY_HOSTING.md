# Privacy Policy Hosting — BRO (F-Droid)

F-Droid metadata (`fdroid/metadata.toml`) references the BRO privacy policy.
This document evaluates hosting options, selects the recommended approach, and
documents implementation steps.

The privacy policy source of truth is the repository file **`PRIVACY.md`** at
the repo root. It must be reachable at a stable URL so F-Droid (and users) can
read it without installing the app.

---

## Evaluation Criteria

1. **Stability** — URL must not change between releases; F-Droid re-reads it.
2. **Availability** — must be served reliably for the app's lifetime.
3. **No external tracking** — must not load analytics/tracking pixels.
4. **Open-source friendly** — ideally versioned with the repo so the policy
   matches the exact shipped build.
5. **Low maintenance** — automatic, no manual upload step per release.
6. **Readability** — rendered HTML is friendlier than raw markdown for users.

---

## Option A — GitHub Pages (Recommended)

Render `PRIVACY.md` to a styled HTML page and publish it to **GitHub Pages**.
This is automated via the `gh-pages.yml` workflow (`.github/workflows/gh-pages.yml`),
which runs on every push to `main`.

**Canonical URL:**

```
https://bro-app.github.io/bro/privacy/
```

> Adjust `bro-app` if the repository is forked/renamed.

### Pros
- Free, versioned with the repository (the page updates automatically on push).
- No third-party tracking; no external account required.
- Renders markdown as readable HTML with styling + table of contents.
- Stable path that F-Droid can reference.

### Cons
- A few minutes of delay after `PRIVACY.md` changes before the live page updates.

---

## Option B — Raw GitHub URL (Acceptable fallback)

Serve the raw `PRIVACY.md` directly from GitHub:

```
https://raw.githubusercontent.com/bro-app/bro/main/PRIVACY.md
```

GitHub serves raw files with `Content-Type: text/plain`, so browsers display
plain text. It is acceptable to F-Droid because the raw URL is stable for a
given branch/commit, but it is less user-friendly than rendered HTML.

### Pros
- No build step; always in sync with the committed file.
- Trivially stable (the `main` ref is permanent).

### Cons
- Displayed as plain text, not rendered markdown.
- No styling, table of contents, or print-friendly layout.
- GitHub may rate-limit aggressive automated fetches.

---

## Option C — External Site (`bro.app`)

Host the rendered policy at **https://bro.app/privacy** (the marketing/website
host, which currently points at the Vercel-hosted `website/` directory).

### Pros
- Clean vanity URL matching the metadata `Website` field.
- Full control over design and headers.

### Cons
- **Not versioned with the repo** — requires a manual deploy whenever
  `PRIVACY.md` changes, so the live policy can drift from the source.
- An additional moving part (Vercel account / DNS / project).
- F-Droid will reject a non-HTTPS URL; must ensure HTTPS + no redirects
  through trackers.

---

## Recommendation

**Use Option A (GitHub Pages) as the primary hosting** for the privacy policy,
with Option B (raw GitHub URL) as a built-in fallback. Both are free,
versioned, tracker-free, and require no external accounts.

Update `fdroid/metadata.toml` `Disclaimer` / add a `PrivacyPolicy` reference so
F-Droid points to the rendered page:

```toml
Website: https://bro.app
Source: https://github.com/bro-app/bro
# ... existing fields ...
Disclaimer: ... Privacy policy: https://bro-app.github.io/bro/privacy/
```

### Implementation steps (already provided by this change set)

1. Ensure `PRIVACY.md` exists at the repo root. (Done.)
2. The workflow `.github/workflows/gh-pages.yml` renders `PRIVACY.md` to
   `https://bro-app.github.io/bro/privacy/` on every push to `main`.
3. Enable GitHub Pages in the repository settings (Settings → Pages →
   "Deploy from a branch" → source: `gh-pages` branch / `/ (root)`).
   The `peaceiris/actions-gh-pages` action in the workflow commits the built
   site to the `gh-pages` branch automatically, so no manual upload is needed.
4. (Optional) Pin an exact version of the policy by using a commit-specific
   raw URL if rendered HTML is unavailable in a restricted environment:
   `https://raw.githubusercontent.com/bro-app/bro/<commit>/PRIVACY.md`.

---

## F-Droid metadata compatibility

F-Droid's metadata parser accepts a `PrivacyPolicy` field (and tolerates the URL
in `Disclaimer`). Pointing either at the GitHub Pages URL satisfies the
inclusion requirement that a human-readable privacy policy be available at a
stable HTTP(S) URL.
