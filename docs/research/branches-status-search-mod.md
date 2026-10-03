# Branches + Status + Search/Activity/Moderation — to columns

Date: 2026-10-03. Supabase-only.

## Branches (signature)

conversation_branches add `root_message_id refs messages, reply_count int default 0, last_activity_at`.
Trigger on messages insert where branch_id set: bump count + time.
RLS: SELECT if can see parent conversation, INSERT member, UPDATE host/admin.
UX: parent always on top + `↳ N replies`, pill `12 replies — tap`, back Branch→Chat. Auto-suggest after 5 replies. Verify deep link `bro://...?branch=:bid&message=:mid` lands + back correct.

## Statuses (24h, resolves to DM)

status_updates [author, media_path (statuses bucket), text null, expires_at 24h], status_replies [status_id, user, message].
RLS author + mutuals. pg_cron purges. Reaction extends visibility within 24h cap (YOLLO rule) via `last_bump`.
Reply always creates/forks DM, never public comment.

## Search

Postgres FTS: messages add `search tsvector` + GIN, scoped `WHERE is_conversation_member`. People/spaces prefix `ilike` + trigram. No global message search across non-member convos.

## Activity/Moderation

activity/notifications exist — wire reply/mention/join/invite events with deep links + unread.
Add reports [reporter, target_type, target_id, reason, created_at] RLS reporter-only. Reuse blocks/mutes. Throttles via RPC. `I’m Free` reuses status_updates type=availability, watch-only one ping/window.

Verify: branch count live, status reply → DM, outsider search returns nothing, report blocks without leaking.
