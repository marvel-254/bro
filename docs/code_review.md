# Code Review — `feat/supabase-chat`

**Date:** 2026-10-04
**Branch:** `feat/supabase-chat` (uncommitted working tree included in scope)
**Review type:** Code review + security review. No files were modified.

## Gates

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Pass |
| ESLint | Pass (2 `no-explicit-any` warnings in `invites.test.ts`) |
| Jest | 312 tests / 15 suites pass |
| GitHub Actions | All 4 workflows green (BRO CI, Android Build, validate-secrets, F-Droid Compliance) |

The problem is not build health. It is that the suite passes green while the app has
three exploitable data-access holes and four UI features that do nothing.

## Scope note

Roughly 5,700 of the uncommitted diff's lines are a Prettier single→double-quote
reformat across `src/lib/*` and `src/theme/*`. That reformat buries the substantive
changes (profile setup wizard, invite system, `YouScreen` rewrite) and should be
split into its own commit so the real diff is reviewable.

---

## Critical

### 1. Conversation creator can grant membership to any user

`supabase/migrations/20261003000100_bro_initial_schema.sql:359-367`

`conversation_members_insert` allows `user_id = auth.uid()` **or** "I created this
conversation". The second branch takes `user_id` straight from the request body, and
the client depends on it (`src/lib/conversations.ts:548-553` inserts a `peerId` row).

*Exploit:* create a conversation, then POST a `conversation_members` row with any
victim uuid as `user_id`. That grants SELECT on `conversations`, `messages`,
`conversation_branches`, `message_reactions`, `attachments` in that conversation.
The same technique against a pre-existing conversation id leaked via a deep link or
search result. No invite, no consent, no acceptance step.

*Fix:* move peer-addition into a `security definer` RPC that hardcodes
`user_id = auth.uid()`; delete the creator-for-others branch from the policy.

### 2. Release APKs are signed with the public debug keystore

`android/app/build.gradle:109-112`

```groovy
release {
    signingConfig signingConfigs.debug
}
```

with `storePassword 'android'` / `keyAlias 'androiddebugkey'` at `:99-102`. Anyone can
produce an update that Android accepts as the same app. This matters in practice
because the project ships via F-Droid.

*Fix:* generate a private release keystore, source it from GitHub Actions secrets,
and fail the release build when it is absent.

### 3. Sixteen SECURITY DEFINER functions, one revoked

All eight migrations.

Supabase grants EXECUTE on newly created `public` functions to `anon` and
`authenticated` by default. Only `search_messages` carries a revoke
(`20261003000300_search.sql:85`). So an **unauthenticated** caller can invoke:

- `prune_old_activity` (`20261003000600_activity_producers.sql:142`) — mass DELETE
  from `activity`, cascading to `notifications`
- `scrub_deleted_messages` (`20261003000200_features_tranche_1.sql:43`) — blank the
  body of every `deleted_for_everyone` message

*Fix:* on all 16 definer functions,
`revoke execute on function ... from public, anon; grant execute ... to service_role;`

---

## High

### 4. `is_verified` is self-awardable

`20261003000100_bro_initial_schema.sql:282-284`

`with check (id = auth.uid())` constrains the row, not the columns. So
`PATCH /rest/v1/profiles?id=eq.<my uid>` with body `{"is_verified": true}` succeeds.
`presence` and `presence_text` are also client-settable for impersonation.

Related: `profiles_select` is `using (true)`, so every profile including `bio` is
world-readable, while `status_updates` is peer-scoped
(`00200:260-271`). Pick one consistent boundary.

*Fix:* column-allowlist trigger, or drop `is_verified` and derive it from
`auth.users.email_confirmed_at` (which is what the client already does at
`src/lib/auth-context.tsx:65`).

### 5. Clients can fabricate notifications for arbitrary victims

`20261003000100_bro_initial_schema.sql:494-496` + `20261003000400_activity_notifications.sql:63-132`

`activity_insert` only requires `actor_id = auth.uid()`; `target_id` is never verified
to exist or to be visible to the actor. Inserting `('follow', me, <victim>, 'user')` in
a loop produces unlimited "X followed you" notifications on the victim's device. The
tightened `activity_select` does not help — the SECURITY DEFINER trigger reads the row
with elevated rights and writes the notification regardless.

The dedup the comment at `00400:62` relies on is a no-op: it claims a
`(activity_id, user_id)` primary key, but no such constraint exists. `notifications`
has `id` as its sole PK (`00100:192`), so every `on conflict do nothing` silently
inserts.

*Fix:* drop the client INSERT policy on `activity` entirely (trigger-only writers) and
add `alter table public.notifications add constraint notifications_activity_user_key
unique (activity_id, user_id);`

### 6. Sign-up deadlocks when email confirmation is required

`src/features/auth/SignUpScreen.tsx:38`

`signUp` (`auth-context.tsx:141-154`) correctly returns no session and sets
`awaitingEmailConfirmation` when Supabase email confirmation is on. The screen
unconditionally does `router.replace("/(auth)/profile-setup")`. The wizard then calls
`updateUser` against a session-less user, which fails, and the catch at
`ProfileSetupWizard.tsx:164` shows "Calibration Error" with no path forward. The
`awaitingEmailConfirmation` flag the context maintains is never read.

*Fix:* branch on `awaitingEmailConfirmation` — route to the verification screen when
true, to profile-setup only when a session came back.

### 7. Realtime is dead on four features

`supabase_realtime` publication contents, verified across all migrations:

- `00100:517-546` adds `messages`, `conversation_members`, `message_reactions`,
  `profiles`, `conversation_branches`
- `00200:507-512` adds `profiles`, `drops`, `drop_responses`, `status_updates`,
  `status_replies`, `pinned_messages`, `invites`, `message_reactions`,
  `plan_responses`, `squads`
- `00400:141-153` adds `notifications`

**Missing:** `spaces`, `space_members`, `plans`, `friendships` — yet all four are bound
by client subscriptions (`spaces.ts:550-562`, `pulse.ts:322-330`,
`friends.ts:377-397`). The Activity tab never updates live, Pulse never reorders on a
plan response, and Space membership changes do not stream.

*Fix:* add the four tables to the publication in a new migration.

### 8. Message order can break permanently

`src/features/conversations/ConversationDetail.tsx:235-247`, `src/lib/conversations.ts:55-56`

Sorting is `created_at` only, with no `id` tiebreaker. Postgres `now()` is
per-transaction, so a batched or multi-row insert ties. Realtime `onInsert` appends
without re-sorting. If the client clock is behind the server, a message you send gets
an earlier `created_at` than the last already-loaded message, arrives via realtime, and
appends *after* newer messages — wrong until reload. Separately, the keyset
`.lt("created_at", before)` at `conversations.ts` can re-fetch the same page forever
when timestamps tie.

*Fix:* order by `(created_at, id)`, use a `(created_at, id)` keyset cursor, and
insert-then-sort on the client.

### 9. "Load older" is unreachable

`src/features/conversations/ConversationDetail.tsx:664-691`

The FlatList runs oldest→newest but wires `onEndReached={() => void loadOlder()}` —
and `onEndReached` fires at the bottom, which is the *newest* end. On top of that,
`onContentSizeChange` calls `scrollToEnd()` after each prepend, yanking the view back
down. The user physically cannot scroll up past the first page.

*Fix:* use `inverted`, or reverse the list so `onEndReached` maps to the older edge.

### 10. `loadOlder` drops all enrichment

`src/features/conversations/ConversationDetail.tsx:168-223`

Page 1 fetches reply counts, branch pills, and attachment previews. Older pages fetch
reactions only. Paginate back three pages and every older message renders as a bare
bubble — no reply count, no branch indicator, no image.

*Fix:* run the same enrichment per page.

---

## Medium

- **Typing indicators never send.** `src/lib/presence.ts:154-170` builds a fresh
  channel per keystroke and calls `send` without subscribing. Sends on an unsubscribed
  channel are dropped, and each channel object leaks. `announcePresence`
  (`presence.ts:114-125`) has the same shape.
- **Presence never goes offline.** Sign-out sets local state to `"offline"` without
  calling `persistPresence` (`src/lib/presence-context.tsx:108-114`); unmount cleanup
  only clears timers (`:181-189`). `PRESENCE_TIMEOUT_MS = 60_000` is declared at
  `presence.ts:58` and never used. A force-quit leaves the user shown as online
  indefinitely.
- **Branch reply counts double-count.** `src/lib/branches.ts:92-120` filters
  `deleted_for_everyone` but not `branch_id is null`, while `branchFromReplies`
  (`:414-445`) sets `branch_id`. After converting replies into a branch the parent
  still shows the old count and the pill reappears. Add `.is("branch_id", null)`.
- **Unbounded nested message embeds.** `src/lib/conversations.ts:150-270` embeds
  `messages (id, content, sender_id, created_at)` with no limit inside a 50-row
  select; `src/lib/spaces.ts:212-219` repeats it. A 10k-message group returns its
  entire history on every list render. Use a lateral join for the latest message only.
- **Branch root not tied to its conversation.**
  `20261003000500_branches.sql:31-32` adds only
  `foreign key (root_message_id) references public.messages(id)`. The delete at
  `:20-25` is orphan cleanup, not validation. A member of conversation A can create a
  branch in A rooted at a message from conversation B. Add a composite FK
  `(conversation_id, root_message_id) -> messages(conversation_id, id)`.
- **`space_members_update` has no `WITH CHECK`.**
  `00100:318-325` gates on `USING` (space owner) only, so `role` is unconstrained and
  an owner can self-promote. Same missing-`WITH CHECK` pattern on `branches_update`
  (`00100:398-400`) — any member can repoint `conversation_id` at a conversation they
  do not belong to — and on `invites_update` (`00200:102-104`), where `uses` /
  `max_uses` are client-writable.
- **`space_members_insert` is an open join.**
  `00100:308-316` allows `user_id = auth.uid()` with no gate on `spaces.is_public`, so
  anyone who learns a space id can join a private Space. There is no space invite table.
- **`search_messages` returns expired messages.**
  `00300:65-74` filters `deleted_for_everyone` but not `expires_at`, so disappearing
  messages stay fully searchable after they visually vanish.
- **`containsPattern` under-escapes PostgREST filters.**
  `src/lib/search.ts:73-77` escapes `\ % _` only, then interpolates into `.or(...)` at
  `:89` and `:131`. A comma in the query splits into two `or` branches.
- **Supabase session in AsyncStorage, and backups enabled.**
  `src/lib/supabase.ts:29` uses `storage: AsyncStorage` with `persistSession: true`,
  which stores the full session including the refresh token in a plain SQLite file.
  `AndroidManifest.xml:14` sets `android:allowBackup="true"`, so it is captured by
  `adb backup` and cloud backup. `expo-secure-store` is already a configured plugin in
  `app.json:49` — supply a SecureStore-backed adapter, and/or set `allowBackup=false`.
- **Deep links accept arbitrary hosts and render attacker-chosen content.**
  `AndroidManifest.xml:27-35` registers `bro://` with `android:host="*"`.
  `src/lib/invites.ts:31-32` rewrites the scheme into an arbitrary `https://` URL, and
  `invite-context.tsx:100-106` turns the attacker-supplied `spaceId` / `targetId`
  directly into a router path. `WelcomeScreen.tsx:146-156` renders
  `inviterName` / `spaceName` / `inviterAvatar`. Not XSS — RN `Text` is not HTML — but
  it is untrusted display content and an untrusted navigation target. Validate
  `spaceId` as a UUID and confirm the Space exists server-side before rendering.
- **`updateProfile` swallows both errors.** `src/lib/auth-context.tsx:204-225`
  destructures nothing from `supabase.auth.updateUser(...)`, nor from the `profiles`
  update at `:224`. An RLS rejection therefore affects 0 rows invisibly, and
  `handleComplete` navigates on as if it saved. `interests` is also written only to
  auth metadata, never to `profiles`, so it is lost on any read from `profiles`.
- **Half-features shipped behind full UI.**
  - `consumeInvite` is exported from `src/lib/invite-context.tsx:89-112` and has
    **zero callers**. The flow is `WelcomeScreen:100` → `SignUpScreen:38` →
    `ProfileSetupWizard:163` → `/(tabs)`; the invite is never redeemed and the user is
    never routed to the Space.
  - The voice-signature card toggles `isRecording`
    (`ProfileSetupWizard.tsx:375`) with no `expo-av` import and no recording
    anywhere in the file. It renders a waveform animation and stores nothing.
  - The sign-up password eye toggle (`SignUpScreen.tsx:95-101`) is a
    `TouchableOpacity` with no `onPress` and no accessibility role.

---

## Low

- `parseInviteUrl("bro://invite")` falls through to a hardcoded `"MESH-TOKEN"` literal
  (`src/lib/invites.ts:44`) — a fabricated token that looks real.
- A blank username collapses to the shared literal `"operator"`
  (`ProfileSetupWizard.tsx:158`), so every user who skips it collides.
- `src/lib/activity-badge-context.tsx:66` returns a new object every render, so all
  consumers re-render on every provider update. Wrap in `useMemo`.
- Branch list caps at 50 with no cursor (`branches.ts:220-243`) while `BranchDetail`
  renders the true `branch.messageCount` and the FlatList has no `onEndReached` — a
  120-message branch shows "120" and stops at 50.
- `createDirectConversation` returns `shared[0]` unchecked
  (`conversations.ts:494-560`) — if you and the peer share a group, you open the group.
- `signedUrlCache` never evicts (`media.ts:308`) — unbounded memory in long sessions.
- Client clock trusted for time: `createSpace` returns
  `joinedAt: new Date().toISOString()` (`spaces.ts:533`), `sendImage` fabricates
  `created_at` (`ConversationDetail.tsx:375-422`), and `relativeTime` uses
  `Date.now()` (`activity.ts:74-88`) — skew misorders lists and renders past events as
  future ones.
- Eleven hardcoded colors in `ProfileSetupWizard.tsx` (`:239, 387, 550, 605, 646, 720,
  760, 785, 802, 828, 850`) bypass `src/theme`; `"#ff3b30"` is off-palette entirely.
- No `accessibilityRole` / `accessibilityLabel` on any of the ten `Pressable`s in
  `ProfileSetupWizard.tsx`. The avatar presets (`:258-265`) are image-only.
- Bio counter warns at `>= 150` but labels `/ 160` (`ProfileSetupWizard.tsx:349`).
- `PRESET_AVATARS.map` uses the array index as `key` (`ProfileSetupWizard.tsx:258`).

---

## Verified clean

- **No secrets in the bundle.** `.env` is gitignored (`.gitignore:9-12`) and untracked.
  `.env.example` declares only three `EXPO_PUBLIC_*` variables, all intentionally
  public. No `service_role` key, private key, JWT, or signing secret anywhere.
- **Anon key is never used as an authorization boundary.** All access goes through
  RLS-respecting calls; `currentUserId()` re-derives the caller from
  `supabase.auth.getUser()` (`media.ts:226-231`, `spaces.ts:385-388`) rather than
  trusting a client-supplied id.
- **`search_messages` has no injection.** Positional binding, `websearch_to_tsquery`,
  `result_limit` clamped to 1..100, execute revoked from anon.
- **Membership helpers are sound.** `is_conversation_member`, `is_space_member`,
  `is_conversation_admin` (`00100:211-255`) are SECURITY DEFINER with
  `set search_path = public` and resolve identity from `auth.uid()` only — never from a
  parameter.
- **Activity-producer triggers are sound.** Actor identity is read from
  `new.sender_id` / `new.user_id`, not from a spoofable `set_config` value.
- **`friendships` authorization holds** — the requester cannot self-accept; the
  block-clearing trigger is correct.
- **`notifications` correctly has no client INSERT policy** — writes are definer-only
  via the fan-out. `blocks`, `user_mutes` are strictly self-scoped.
- **`reactions_select` / `attachments_select` subquery correctly** through `messages`
  and then `is_conversation_member`, rather than a client-supplied `conversation_id`.
- **No `bypassrls` role anywhere**, and no `auth.users` write path from any client role.
- No WebView, `dangerouslySetInnerHTML`, `eval`, `new Function`, `Linking.openURL`, or
  third-party analytics / crash SDKs. No `fetch`/`axios` outside the Supabase SDK, so
  no PII reaches a third party.
- Sign-in and OTP verification fail closed when unconfigured
  (`auth-context.tsx:80-84`); `isAuthenticated` requires both a session and config.
- Media pipeline: 10 MB cap, re-encoded to JPEG with `contentType` hardcoded
  (`media.ts:201-218`) so the client-declared MIME is never forwarded; object keys are
  built from ids and `Date.now()` only (`media.ts:176-182`), so there is no path
  traversal.
- The deleted `src/features/you/components/` are fully migrated — zero dangling
  imports; the only remaining mention is prose in `handoff.md:227`.
- Reanimated worklets throughout, so no animation assumes a fixed frame rate.

---

## Repo hygiene

- `bro/node_modules` contains a stray nested copy of the project, including its own
  `AndroidManifest.xml` files. It is gitignored (`.gitignore:4`) but inflates greps and
  will cause future security scans to read third-party manifests as first-party.
  Delete it.
- `.openclaude/` is untracked; confirm `.gitignore` covers it before the next commit.

## Suggested order

1. Findings 1–3 — exploitable today.
2. Findings 4–5 — RLS integrity, self-awardable badges and notification spam.
3. Finding 6 — user-blocking signup bug.
4. Findings 8–10 — the chat is visibly broken, not insecure.