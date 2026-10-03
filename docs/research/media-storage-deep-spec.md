# Media/Storage Deep Spec — to buckets + RLS

Date: 2026-10-03. Supabase Storage only, private by default.

## Buckets

`avatars` (public read, owner write, 2MB, jpg/png/webp), `chat-media` (private, 10MB), `voice-notes` (private, 5MB m4a/opus 60s), `statuses` (private, 8MB, 24h signed URLs).
No buckets exist yet — create via SQL + dashboard, then Storage RLS.

## Policies

- avatars SELECT public, INSERT/UPDATE owner path `uid/*`.
- chat-media SELECT: `is_conversation_member`. INSERT: member, MIME image/*, bytes<=10MB. DELETE: sender or admin.
- voice-notes same as chat-media, audio/*.
- statuses SELECT: mutuals/friends only (reuse peers), signed URL 24h.

Server never trusts client MIME — check magic bytes in Edge validator or Postgres trigger on `attachments`.

## Table

attachments [id, message_id null, uploader, bucket, storage_path, mime, bytes, thumb_path null, created_at]
RLS mirrors bucket: SELECT if can see message/conversation, INSERT member.

## Pipeline

pick (`expo-image-picker`) → compress 1920px JPEG 0.8 + 400px thumb parallel → upload both → insert row → send message with `type=image/voice/file` + `attachment_id`.
Voice: `expo-av` record → same. Show thumb/player instantly, upload bg, retry via outbox.

Verify: airplane upload queues, reconnect sends once, outsider signed URL denied, oversize/MIME-spoof rejected.
