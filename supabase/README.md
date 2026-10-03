# Supabase backend for BRO

Supabase is the backend for everything: authentication, conversations, messages,
spaces and realtime sync. There is no separate identity provider — Supabase Auth
issues the session, and Postgres resolves the caller through `auth.uid()`, so the
row level security policies in `supabase/migrations` apply unchanged.

## 1. Create the project

```bash
supabase login
supabase projects create bro --org-id <org-id> --region eu-central-1 --db-password '<strong-password>'
supabase link --project-ref <project-ref> --password '<db-password>'
```

## 2. Apply the schema

```bash
supabase db push --password '<db-password>'
```

This applies `supabase/migrations/20261003000100_bro_initial_schema.sql`: tables,
indexes, row level security policies, the `handle_new_user` signup trigger, and
realtime publication entries.

## 3. Configure auth

Dashboard -> Authentication -> Sign In / Providers -> Email:

- **Email provider**: enabled
- **Confirm email**: enable in production so unverified accounts cannot sign in
  and `profiles.is_verified` reflects reality

`handle_new_user()` creates the `profiles` row automatically on first signup,
so there is no separate onboarding write to get right.

## 4. Configure the app

Copy `.env.example` to `.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

The anon key is safe to ship in the client bundle. It is not a secret: access is
limited by row level security, which the app cannot bypass.

For CI:

```bash
gh secret set EXPO_PUBLIC_SUPABASE_URL --repo marvel-254/bro
gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --repo marvel-254/bro
```

## 5. Verify

```bash
npm run typecheck && npm run lint && npm test
supabase inspect db table-stats --linked   # 11 tables should be listed
```

Runtime smoke test — anonymous access must be denied:

```bash
# expect [] — RLS blocks unauthenticated reads
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/messages?select=id" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"

# expect 401 — RLS blocks unauthenticated writes
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/messages" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' -d '{}'
```

Then run the app, sign up, open a conversation, and send a message from a second
client to confirm realtime delivery.

## Schema reference

| Table | Purpose |
|---|---|
| `profiles` | one row per auth user, auto-created on first sign-up |
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
They are defined after the table definitions because Postgres validates `sql`
function bodies at creation time.

## Legacy schema

`drop-legacy-church-app.sql` clears a `public` schema left behind by an abandoned
app. It is not in `migrations/`, so `db push` never runs it. Only apply it to a
project you intend to hand over entirely.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Backend not configured" | env vars missing at build time; rebuild the APK |
| Every query returns empty | no session; check `isAuthenticated` and sign-in errors |
| Sign-up succeeds but app stays on welcome | email confirmation is on; confirm before signing in |
| Realtime never fires | table missing from `supabase_realtime`; re-run `supabase db push` |
| `JWT` / `403` on writes | RLS denies; verify `conversation_members` has a row for the user |