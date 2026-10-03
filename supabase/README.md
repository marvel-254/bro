# Supabase backend for BRO

Supabase is the backend for conversations, messages, spaces and realtime sync.
Clerk stays the identity provider — Supabase borrows Clerk's JWT so row level
security can resolve the caller without a second login.

## 1. Create the project

Either use the Supabase CLI or the dashboard.

CLI:

```bash
supabase login
supabase projects create bro --org-id <your-org-id> --region eu-central-1 --db-password '<strong-password>'
supabase link --project-ref <project-ref>
```

Dashboard: <https://supabase.com/dashboard> -> New project.

## 2. Apply the schema

```bash
supabase db push
```

This applies `supabase/migrations/20261003000100_bro_initial_schema.sql`:
tables, row level security policies, indexes, and realtime publication entries.

## 3. Connect Clerk to Supabase

Supabase validates Clerk JWTs using its own JWT secret, so the two must agree.

### 3a. Copy the Supabase JWT secret

Dashboard -> Project Settings -> API -> JWT Secret. Keep it private.

### 3b. Add it to Clerk

Clerk Dashboard -> Configure -> API Keys -> Add a custom authentication provider:

- Name: `supabase`
- Domain: `<project-ref>.supabase.co`
- Audience: `supabase`

### 3c. Create a Clerk JWT template

Clerk Dashboard -> Customize Session Token -> Templates -> New template:

- Name: `supabase`
- Claims:

```json
{
  "sub": "{{user.id}}",
  "role": "authenticated",
  "aud": "supabase",
  "email": "{{user.primary_email_address}}"
}
```

Leave the lifetime at the default (about 60 seconds). The app fetches a fresh
token per request through `accessToken`, so a short lifetime is correct.

### 3d. Enable third-party auth on Supabase

Dashboard -> Authentication -> Sign In / Providers -> Third-Party Auth ->
Clerk -> enable, using the same values as step 3b.

## 4. Configure the app

Copy `.env.example` to `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

Both values are safe to ship in the client bundle. Access control is enforced by
row level security, not by keeping these secret.

For CI, set the same two as repository secrets:

```bash
gh secret set EXPO_PUBLIC_SUPABASE_URL --repo marvel-254/bro
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --repo marvel-254/bro
```

## 5. Verify

```bash
# schema and policies applied
supabase db push --dry-run

# app compiles and tests pass
npm run typecheck && npm run lint && npm test
```

Then run the app, sign in with Clerk, and open a conversation. A message sent from
one client should appear in the other without a refresh — that is the realtime
channel on `messages` working.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Backend not configured" | env vars missing at build time; rebuild the APK |
| Every query returns empty | RLS is denying; confirm the Clerk token has `role: authenticated` |
| Realtime never fires | table missing from `supabase_realtime` publication; re-run `supabase db push` |
| `Invalid JWT` errors | Clerk JWT secret does not match the Supabase JWT secret |

## Schema reference

| Table | Purpose |
|---|---|
| `profiles` | one row per auth user, auto-created on first sign-in |
| `spaces` | communities; `is_public` controls discoverability |
| `space_members` | membership and role (`owner`, `admin`, `member`) |
| `conversations` | direct, group, space and live conversations |
| `conversation_members` | membership, role, mute flag, read cursor |
| `messages` | the chat rows; realtime published |
| `conversation_branches` | threaded discussion off a message |
| `message_reactions` | emoji reactions, unique per user per emoji |
| `attachments` | storage paths for file and image messages |
| `activity` / `notifications` | reply, mention, join events and unread state |

Policy helpers (`is_conversation_member`, `is_space_member`,
`is_conversation_admin`) are `security definer` so member checks do not recurse.