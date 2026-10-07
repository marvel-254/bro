# The steal list — what Telegram, WhatsApp, TikTok and Meta charge for, and what BRO should take

**Date:** 2026-10-07
**Status:** plan. Nothing implemented yet.
**Source request:** steal the best ideas from Telegram and WhatsApp, cherry-pick
what those apps (and TikTok / Facebook) put behind a subscription, and offer it
free on BRO.

Costs below were measured against this repo, not estimated: `rg` counts for
theme consumers and stray colour literals, migration contents for schema claims.

---

## First, what those apps actually charge for

The premise needs correcting before the list is usable, because "what they put
behind a subscription" is not one thing:

* **WhatsApp** sells consumers **nothing**. The paid surfaces are the Business
  API and **Meta Verified**. Wallpapers, themes, chat lock, disappearing
  messages and delete-for-everyone are all *free* — which is why they read as
  obvious steals rather than premium rescues. WhatsApp's old 99¢/year consumer
  subscription was dropped years ago.
* **Telegram Premium** is the real bundle: bigger uploads, faster downloads,
  higher media quality, chat folders, auto-archive, voice-to-text
  transcription, animated avatars, custom app icons, unique reactions.
* **TikTok** has no consumer subscription. The comparable tier is creator
  tooling: analytics, HD upload, scheduling.
* **Facebook/Meta** monetises identity — the paid badge, impersonation
  monitoring, priority support.

So the cherry-pick splits into three tiers with wildly different economics.

---

## Tier 1 — Cosmetic and identity (cheap, high perceived value)

| Item | Source | BRO today | Work | Verdict |
|---|---|---|---|---|
| Chat wallpaper from your own photos | WhatsApp (free) | Nothing | Local file + AsyncStorage is cheap. Syncing across devices needs a bucket + a path + RLS | **Take it.** Start local-only and say so. |
| App theme + accent picker | WhatsApp (free) | Static tokens | Wide: **30 files** import the theme and there are **577 `COLORS.` uses**, plus **95 stray hex literals** the tokens never covered | **Take it, as a planned refactor.** See sequencing. |
| Custom app icons | Telegram Premium | Nothing | Android `activity-alias` + packaged icon sets | Take later; cheap but needs asset work. |
| Chat folders / tags | Telegram Premium | Nothing | Client-side grouping over existing conversations; optional saved column | Take later. |
| Chat lock (fingerprint) | WhatsApp (free) | Nothing | `expo-local-authentication` is not installed | Take later; one dependency, real value. |
| Folders, auto-archive, animated avatars | Telegram Premium | Nothing | Mostly client work | Cheap picks, no urgency. |

**Tier 1 is where "premium, free" is genuinely true**, because the thing being
withheld elsewhere is a cosmetic entitlement, not a resource.

## Tier 2 — Mechanics (moderate, mostly client)

| Item | Source | BRO today | Work | Verdict |
|---|---|---|---|---|
| Delete for everyone, no trace | Telegram (free) | Tombstone rendered from `deleted_for_everyone` | Small change, one real conflict | **Take it** — see the conflict below |
| Voice-note transcription | Telegram Premium | No recorder at all yet | Needs recording before transcription | Not yet; recorder first |
| Scheduled messages | TikTok creator tools | Nothing | Client queue + a `send_at` column | Take later |
| Edit history | Telegram | Edit exists, no history | Needs a table | Later |
| Read-receipt / last-seen controls | WhatsApp (free) | Presence exists, no controls | Policy + UI | Later; touches RLS |

## Tier 3 — Limits (do NOT give away)

| Item | Source | BRO today | Why not |
|---|---|---|---|
| Bigger uploads | Telegram Premium (2–4GB) | 10MB cap | This is storage and egress. Giving it away converts a subscription line into **a permanent bill BRO pays**, and the cap is also what keeps media validation honest (`§22`) |
| Higher media quality / HD media | Telegram Premium, TikTok HD | Compressed to 1920px | Same bill, plus slower sends on the poor connections `§21` assumes |
| Faster downloads | Telegram Premium | n/a | We do not run the CDN that would make this a feature |
| Badge / verification | Meta Verified | `is_verified` was **deliberately dropped** in migration 011 because it was self-awardable | Resurrects a closed hole, and contradicts the Me tab's "no stats flex". If identity ever matters, derive it from `auth.users.email_confirmed_at` — never a writable column |
| No ads | Meta | Already promised on the Welcome screen ("no ads tbh. just talk fr.") | Nothing to steal; it is already the position |

**The trap in one line:** cherry-picking the premium *entitlements* is cheap and
makes BRO feel expensive; cherry-picking the premium *limits* makes BRO pay a
recurring bill forever. Stop at Tier 2.

---

## The one real conflict: trace-free deletes vs branches

Telegram's delete-for-everyone leaves nothing behind. BRO's messages are not
leaves: `conversation_branches.root_message_id` is a real foreign key (added in
migration 005), and activity rows point at messages. A message that vanishes
entirely can orphan a branch — the branch keeps its permanent "what started
this" header, which is the whole point of the branch feature.

**Recommended rule** (a product decision before it is SQL):

1. No replies, no branch, no activity rows → **hard delete**. Nothing left, the
   Telegram behaviour.
2. A branch root or a message with replies → keep a **minimal tombstone** so the
   thread still has an anchor, and blank the body (which
   `scrub_deleted_messages()` already does).
3. Otherwise the branches feature quietly breaks, which is worse than a trace.

This is the only place on the list where "free like Telegram" collides with a
signature BRO feature, so it needs writing down before code.

---

## Sequencing

Doing all three at once would produce one unreviewable change, so:

1. **This doc** — capture, cost, and the conflict above.
2. **Themes and wallpapers** — the frozen Me-tab spec already promised
   "Accent 1 pick" (`docs/research/welcome-bros-me.md`), so this is an existing
   commitment, not scope creep. Shape: a theme provider + `useTheme()`, with the
   current static tokens as the default theme so nothing breaks; then migrate
   consumers in reviewable batches; then fold the 95 stray hex literals into
   tokens. Wallpapers ride on top, local-only first.
3. **Trace-free deletes** — small once rule 1–3 above is agreed.

Tier 1 leftovers (custom icons, folders, chat lock) become their own small
tranches after that.

**Note for step 2:** the Welcome screen rewrite from this same session
introduced a few named literals (`CANVAS_TOP`, `#7DF4FF`, `WORDMARK`) that are
palette additions in all but name. They should move into the theme as part of
step 2 rather than be left as a second source of truth.
