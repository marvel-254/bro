# BRO — Out-of-Box Ideas (Phase 2 foundation for next app)

Date: 2026-10-03
Builds on: `docs/research/whatsapp-grade-audit.md` (WhatsApp parity = table stakes).
Constraint: stay on Expo + Supabase. No marketplace/payments/livestreaming per AGENTS.md §48.
North star: **BRO is a living communication environment, not a list of chats.**

Existing leverage already in schema (`20261003000200_features_tranche_1.sql`):
drops + drop_responses, status_updates + status_replies, squads, plans + plan_responses,
invites, pinned_messages, blocks/mutes, `expires_at` on messages, presence cols.

---

## Design rules for all ideas

1. WhatsApp-simple to join, BRO-deep to stay. One tap to participate, no new mental model.
2. Ephemeral by default, permanent by choice. Feed is for what can still happen.
3. Conversation is primary, channels secondary. Every social object resolves to a chat.
4. Presence is signal, not surveillance. Mutual friends, coarse states, no exact location unless opted.
5. All ideas must map to Postgres RLS + Realtime broadcast/`postgres_changes` + Storage buckets. No custom backend.

## Idea 1 — Pulse: “What’s happening right now?” not a feed

**Concept:** Pulse answers one question, no doomscroll. Three strips only: Live Now (conversations with recent burst), Tap-In (drops/plans expiring soon you can still join), Around (mutuals online/afk with custom activity).
**Why different:** Threads Live Chats are event-centric and public; WhatsApp has no discovery. Pulse is friends-only, activity-sorted, expires quietly.
**Data:** reuse `conversations.last_message_at`, `drops.expires_at`, `plans`, `profiles.presence`. Add `conversation_stats [conversation_id, msg_count_15m]` as view, no new table for MVP.
**UX slice:** `PulseScreen.tsx` already exists — replace mock list with three sections, each card deep-links `bro://conversation/:id` or `bro://drop/:id`.
**MVP test:** 5 friends, post 1 drop, 1 plan, 1 live chat — can a newcomer join something in <10s?
**Risk:** becoming algorithmic feed. Guard: strict reverse-chron + expiry, no likes/followers.

## Idea 2 — Branches: the signature “12 replies → room”

**Concept:** Any message can sprout a branch that preserves root context (what started it, who’s in, where it belongs). Branch header always shows parent preview + count.
**Why different:** Discord threads/WhatsApp replies lose context or live elsewhere. BRO branches stay attached, navigable, deep-linkable.
**Data:** `conversation_branches` exists. Add `root_message_id`, `reply_count` trigger, `last_activity_at` for sorting. Reuse `messages.branch_id`.
**UX slice:** `BranchDetail.tsx` exists — add parent-context header, back = Branch → Conversation (explicit Android back map).
**MVP test:** reply 12x to one message, open from push, back returns to exact parent scroll pos.
**Risk:** branch sprawl. Guard: auto-suggest branch after 5 replies, show count inline.

## Idea 3 — Drops / Vibe checks: plans that don’t die in chat

Inspired by Anout/PLNS/up4 pattern, already schematized as `drops`.
**Concept:** “Coffee run? 2h” — one line, duration, audience (squad/circle). Friends tap In, temp group chat opens, auto-archives on expiry. No “so is this still happening?”.
**Why different:** Group-chat plans rot. Drops are first-class, expirable, with Going/Maybe/Can’t tallied on the object, not pieced from chat.
**Data:** `drops [host, text, place?, expires_at]`, `drop_responses [user, status]`. Add pg_cron purge, Storage prefix `drops/` if media allowed later.
**UX slice:** Create from `CreateScreen.tsx` in 2 fields, card in Pulse Tap-In, chat auto-created via `conversations` type=`drop`.
**MVP test:** post → 2 tap-ins → chat → expiry → archive, no manual cleanup.

## Idea 4 — Plans + squads: from loose to locked without chaos

**Concept:** Squad = persistent crew (roommates, run club). Plan = lightweight (“tacos 7?”) → promote to Event (time/place/RSVP) when real. Host updates pin to plan.
**Why different:** SquadZ/PLNS prove the loop, but they’re separate apps. BRO keeps plan + chat + memories in one place.
**Data:** `squads`, `squad_members` (check name in migration), `plans`, `plan_responses`. Add `plan -> conversation_id` link.
**UX slice:** `SpacesScreen.tsx` hosts squads; plan card shows live tally + Nudge (notify specific friends, not broadcast).
**MVP test:** loose plan → 3 Going → promote → chat persists, photos land in one album later (Phase 3).

## Idea 5 — Presence moods + whispers: lightweight aliveness

Inspired by Glint bubbles/whispers, BTWEEN lockscreen drops.
**Concept:** Presence is `online|chilling|gaming|listening|afk|offline` + emoji + 24h custom text (already in `profiles`). Typing dots over avatar, @ poke highlights, `/w` style whisper = ephemeral DM never saved (maps to `expires_at = now()+60s` + no history fetch).
**Why different:** WhatsApp presence is binary. BRO presence is social permission (“chilling — joinable”, “gaming — don’t ping”).
**Data:** no new tables. `profiles.presence_text/emoji`, broadcast only for typing/whisper-typing.
**UX slice:** `PeopleScreen.tsx` “Who’s Around” + presence picker already done — add Joinable toggle.
**Risk:** surveillance feel. Guard: mutuals only, coarse, off by default for new users.

## Idea 6 — Statuses that resolve to conversation

**Concept:** 24h photo/text status (`status_updates` exists), but every reply is a DM or branch, not a like. Reaction keeps it alive (YOLLO-style: reactions extend visibility within 24h cap).
**Why different:** WhatsApp Status is broadcast-only. BRO status is an invitation to talk.
**Data:** `status_updates [author, media_path, expires_at]`, `status_replies`. Storage bucket `statuses/` private + signed URLs.
**MVP test:** post status → 2 replies → each becomes DM, status expires, DMs persist.

## Idea 7 — “I’m Free / Around” strip

**Concept:** 4h availability window with nothing attached (“Free till 4”). Friends with mutual watch get notified once. No location unless opted, then coarse.
**Why different:** Solves “who’s actually around?” without read-receipt guessing (PLNS “I’m Free”, up4 live map, but friends-only).
**Data:** reuse `status_updates` type=`availability` or tiny `availability [user, until, note]` — prefer reuse to avoid table sprawl.
**Risk:** notification spam. Guard: watch-only, one ping per window, quiet hours.

## What NOT to build (protect the foundation)

Marketplace, payments/split, AI companions, livestreaming, video conferencing beyond 1:1 test, bots platform, creator monetization — per AGENTS.md §48-49. Keep extension points (e.g., `activity` table for future bots) but don’t implement.

## Foundation deltas to schedule (all Supabase-native)

1. `client_msg_id uuid` on messages + outbox (from audit P1) — required before Drops/Plans chats feel instant.
2. `push_tokens` + Edge fanout — required for Tap-In to work when app killed.
3. Storage buckets `avatars, chat-media, voice-notes, statuses` + RLS — required for Drops/Status media.
4. `reports` table + Space roles reuse — required before any public/discoverable surface.
5. pg_cron for `expires_at` (messages, drops, statuses, plans) + `reply_count` triggers.
6. FTS `tsvector` on messages scoped to member conversations — search must work before scale.

## Suggested build order for next app

1. Audit P0 (keys, README, 2-client proof) → 2. Outbox + push + buckets → 3. Drops + Plans + Pulse Tap-In → 4. Branches polish + Statuses → 5. Squads + “I’m Free” → 6. E2EE pilot + calls spike.

Each step demoable in <2 min with 3 test accounts. If a demo needs a slide to explain, cut it.

---
Next step options: pick one idea to spec to RLS + Realtime + UX states, or map all to `src/features/` file deltas without editing code.
