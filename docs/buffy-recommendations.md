# Buffy's recommendations — the newest tranche

**Date:** 2026-10-07
**Reviewed at:** `2de95bc` (`feat(conversations): group creation, which the app could not do at all`)
**Scope:** the most recent work — statuses (24h wall), the self-hosted GIF
library + picker, the Pulse meme card, group creation, and block enforcement.
**Type:** recommendations only. Nothing was changed.

**Tranche scope: UI only.** Findings 1–5, 10, 11, 13 and 14 are client work and
are the current tranche. Findings 6–9 and 12 are backend (constraint, policies,
triggers, sweeper, member cap) and are deferred, not dropped — they are still
true, they just cannot be fixed from the client.

Findings below were read out of the code and the migrations at the revision
above: every claim names the file and line it came from. I did not re-run
`tsc` / `eslint` / `jest` for this document — the suite says nothing about any
of these, which is itself recommendation 14.

The tranche is good work: the GIF library is a real corpus with no provider key
in the client, group creation moved membership behind a `security definer` RPC
with a relationship gate, and blocking moved from decorative to enforced at the
message read path. What follows is what is still thin.

---

## A. Things a user can see today

### 1. Text statuses never advance, and are never marked seen — **FIXED**

`src/features/status/StatusViewer.tsx:118-120`

```ts
if (!visible || !item || composerOpen) return;
if (item.kind !== "photo") return;   // <-- text statuses exit here

markSeen(item);
```

The dwell timer and the only `markSeen()` call sit behind the photo check. So a
text status sits on screen forever until the user taps the right zone, and its
author's ring in the tray stays blue ("unseen") no matter how many times it is
opened. Photos behave; text — the cheaper, more common status — does not.

*Fix:* run the dwell timer for every status kind with a duration by kind
(photos 6s, text maybe 8s), and call `markSeen` unconditionally when an item is
shown.

**Done:** `dwellMsFor(kind)` in `StatusViewer.tsx` (photo 6000ms, everything else
8000ms), the `kind !== "photo"` early return is gone, and `markSeen` runs for
every kind.

### 2. "Seen" never actually persists — **FIXED**

`src/features/status/useStatuses.ts:40,78`

```ts
const raw = globalThis.localStorage?.getItem(STORAGE_KEY);   // undefined in RN
...
globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...next]));
```

This is React Native, not a browser. `globalThis.localStorage` does not exist
(Hermes has no `window`), so both optional chains no-op: the write silently
discards and the read returns nothing. Every launch resets the tray to
"everything unseen", which makes the ring colour meaningless rather than
merely lossy. `AsyncStorage` is already a dependency and is what
`src/lib/supabase.ts` uses for session persistence.

*Fix:* use `@react-native-async-storage/async-storage` with the same
best-effort error handling, or drop the feature and say so.

**Done:** `useStatuses.ts` reads and writes `bro:seen-statuses` through
`AsyncStorage`, keeping the same best-effort semantics (a write failure is
swallowed, a corrupt cache starts unseen).

### 3. The tray shows you twice, with someone else's face — **FIXED**

`src/features/status/StatusTray.tsx:46,56-77`

```tsx
<Avatar name="You" uri={groups[0]?.authorAvatar} size={48} />
```

The compose tile is hardcoded first, then `groups.map` renders a tile per group
— including your own group, which is also labelled "Your story"
(`StatusTray.tsx:77`). So once you post, you appear twice. And before you post,
`groups[0]` is whoever is newest, because `groupStatuses` only puts the viewer
first when the viewer *has* updates (`src/lib/status-grouping.ts:74-83`) — your
avatar renders as a stranger's photo.

*Fix:* pass the viewer's own `displayName` / `avatarUrl` in as props for the
compose tile, and filter the viewer's group out of the map (or render it once).

**Done:** `StatusTray` takes `viewerName` / `viewerAvatar` (wired from
`user` in `PulseScreen.tsx`) and renders `others = groups.filter(g => g.authorId
!== viewerId)`. The empty state keys off `others` too.

### 4. The GIF grid has no defined order — **FIXED**

`src/lib/gifs.ts:76-82`

```ts
let builder = supabase.from("gif_library").select(...).eq("is_listed", true).limit(limit);
```

No `.order(...)`. An unordered `LIMIT` in Postgres has no guaranteed ordering,
and `gif_library_listed_idx` is on `(is_listed, created_at desc)` — so the fast
path and the intended order both exist and neither is being used. The default
"browse" view can reshuffle between queries and will silently drift from the
index as the corpus grows.

*Fix:* `.order("created_at", { ascending: false })`, which the existing index
already covers. Add `.range()` paging when the corpus outgrows 30 tiles.

**Done:** `.order("created_at", { ascending: false })` added to the `gif_library`
select. Paging is still open.

### 5. A network failure is reported as an empty library — **FIXED**

`src/features/gifs/GifPicker.tsx:37-46`

```ts
try { setGifs(await searchGifs(q, { limit: PAGE_SIZE })); }
catch { setGifs([]); }   // indistinguishable from "no results"
```

The empty state then says *"The library is empty. GIFs have to be curated into
it first."* — which tells the user the library is empty when the real problem
was a dropped request. The file already distinguishes "nothing matched" from
"no GIFs yet"; it needs a third, honest branch (and a retry) for "could not
reach the library".

**Done:** `searchGifs` now throws on a query error instead of returning `[]`
(a missing backend still returns `[]`, which really is empty). `GifPicker` keeps
an `error` state, renders "Could not load GIFs" + the message + a **Try again**
button, and clears the error on each new load and on close.

### 6. A GIF that has been sent cannot be deleted from the catalogue

`supabase/migrations/20261003001600_selfhosted_gifs.sql:83,90-96`

```sql
add column if not exists gif_id uuid references public.gif_library (id) on delete set null;
...
check ((type = 'gif' and gif_id is not null) or (type <> 'gif' and gif_id is null))
```

`on delete set null` and that CHECK are in direct conflict: deleting a listed
GIF that any message references tries to null `gif_id` on a row whose `type` is
still `'gif'`, so the CHECK fails and the delete errors out. Curating a mistake
out of the library becomes impossible the moment someone sends it.

*Fix:* keep the row and flip `is_listed = false` (which the picker already
filters on, and which `messages_insert` already validates against), then add a
`restrict`-style guard or a deliberate two-step delete for genuinely unwanted
rows.

---

## B. Enforcement gaps

### 7. Blocking is only enforced in messages

`supabase/migrations/20261003001500_block_enforcement.sql:44-67`,
`20261003001600_selfhosted_gifs.sql:103`

`blocks_between()` is called from exactly three places: the `messages` select
policy, the `messages` insert policy, and `create_direct_conversation`. Nothing
else consults it. So a blocked user who still shares a group conversation with
you can:

- read and reply to your **statuses** — `statuses_select`
  (`20261003000200_features_tranche_1.sql:261-271`) checks conversation
  membership only, and `status_replies_insert` (`:295-302`) checks nothing about
  the author at all;
- keep **reacting** to your messages, since `message_reactions` policies were
  never touched by 015;
- be **added to a group with you** — `create_group_conversation`
  (`20261003001700_group_creation.sql:62-99`) gates on a shared friendship, Space
  or conversation, and a block does not delete conversation membership, so the
  gate passes.

The messages policy then hides that pair's messages from each other in the new
group — so both parties see a group with holes in it and no explanation.

*Fix:* make `blocks_between` the single veto everywhere a person is either
shown to or can reach another: statuses select/insert, status replies,
reactions, attachments, and the group member gate. This is the same reasoning
that produced `blocks_between` in the first place — a block that holds on one
path is a block that leaks on the others.

### 8. Nobody learns that someone replied to their status

`20261003000200_features_tranche_1.sql:244-302`

`status_replies` has RLS and a `reply_count` embed, but there is no trigger
anywhere in the migrations that turns a reply into an `activity` row or a
`notification`. The author has to open their own status and read the pills to
find out. The product docs are explicit that a status reply should resolve to a
DM; today it resolves to nothing.

*Fix:* extend the migration-006 producer pattern (actor read from the row,
`activity` → `activity_fan_out` → `notifications`) to `status_replies`, with a
deep link straight into the status. That pattern exists and is verified; this is
one more trigger on it, not new machinery.

### 9. Status photos are never deleted

`src/lib/statuses.ts:220-227`

`deleteStatus` deletes the row; nothing deletes the object in the private
`statuses` bucket. The 24-hour expiry is a row filter, not a lifecycle — every
photo a user has ever posted stays in Storage forever, and expired statuses are
invisible to their author too, so nobody can clean them up. `prune_old_activity()`
exists as precedent.

*Fix:* a `prune_expired_statuses()` that deletes expired rows and their
`media_path` objects, called from the same scheduled path as
`prune_old_activity()`.

---

## C. Correctness and robustness

10. **The client overrides the schema's own TTL.** `postStatus` writes
    `expires_at: new Date(Date.now() + 24h)` (`src/lib/statuses.ts:212-214`)
    while the column already has `default (now() + interval '24 hours')`
    (`20261003000200:237`). A device clock that is behind shortens or lengthens
    the status's life, and there are now two places that decide what "24 hours"
    means. Omit the column and let the database own it.

11. **A failed status delete closes the viewer anyway.**
    `src/features/status/StatusViewer.tsx:281`:
    `void deleteStatus(item.id).then(onClose)` — no `catch`, no busy state. On a
    dropped request the overlay closes as if it worked and the status is still
    there on the next open. This is the same class of bug the chat send path
    already handles properly.

12. **`create_group_conversation` has no upper bound.** The loop is gated by
    relationships, which is the important half, but there is no cap on
    `member_ids`, and every row it inserts is a membership that can never be
    removed by anyone but the creator. A cap (say 256) plus a documented
    leave/remove path is cheap insurance.

13. **The meme card reaches a third party from every client.**
    `src/lib/memes.ts:24,68` fetches `https://api.imgflip.com/get_memes` on
    render. `docs/code-review` previously verified "no `fetch` outside the
    Supabase SDK, so no PII reaches a third party" — this card is the first
    exception, and it also hands Pulse's reliability and the app's image
    sourcing to a keyless endpoint with no SLA. If the card stays, cache it
    where we already pay for storage (a table + a bucket, exactly like the GIF
    library) rather than at request time, and check the provider's terms for
    redistributing their templates.

    Separately, and more important than the mechanics: "Meme of the moment" is
    content, not communication. It is the first thing on Pulse that a user
    passively consumes, which is precisely the feed behaviour `AGENTS.md §15`
    and `§50` set out to avoid. Worth a deliberate decision rather than drift.

---

## D. Testing

14. **Both status bugs live in the only part of statuses that has no tests.**
    `src/lib/__tests__/statuses.test.ts` covers `groupStatuses` thoroughly, and
    the two real defects (advance-on-every-kind, persist-seen) sit in
    `StatusViewer`'s effects, which no test can reach. The repo already knows
    the answer: `status-grouping.ts` and `gif-queries.ts` were split out of
    native-dependent modules precisely so the logic could be tested.

    Extract the stepping logic — `nextIndex(groups, authorIndex, itemIndex)`,
    `previousIndex(...)`, `dwellFor(kind)` — into a pure module and test it. The
    same move would let `GifPicker`'s empty-vs-error state be tested without a
    renderer.

---

## Suggested order

Within the UI-only tranche:

1. **1, 2, 3** — the status wall is visibly wrong today, and all three are
   small.
2. **7** — a block that leaks on statuses and reactions is a trust problem, not
   a polish item. Do it in one migration with tests.
3. **4, 5, 6** — the GIF library's edges; 6 before the corpus has real traffic.
4. **8, 9** — notifications and lifecycle, which make statuses worth using.
5. **10–13** — correctness and the third-party decision.
6. **14** — do it alongside 1, so the fix is locked in.

Deferred to a backend tranche: **6, 7, 8, 9, 12**. None of them can be fixed from
the client — hiding messages client-side is not enforcement, and faking it would
be worse than today's honest gap.
