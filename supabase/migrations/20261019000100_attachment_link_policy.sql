-- attachments: allow the uploader to link an attachment to a message.
--
-- The upload flow is: upload object -> insert an attachments row with
-- message_id null -> send the message -> update the row with the new
-- message_id (src/lib/media.ts, insertAttachment + the `.update({ message_id })`
-- calls). The table had select/insert/delete policies but never an UPDATE
-- policy, so that final update matched zero rows. PostgREST reports success for
-- a zero-row update, so the client saw no error: every image and voice note
-- stayed unlinked, and fetchMessageAttachments never returned it -- photos
-- rendered "Photo unavailable" and voice bubbles blank, permanently.
--
-- The uploader may only link to a message they sent, so a malicious client
-- cannot attach its file to someone else's message.

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments
  for update
  using (uploader = auth.uid())
  with check (
    uploader = auth.uid()
    and (
      message_id is null
      or exists (
        select 1 from public.messages m
        where m.id = attachments.message_id
          and m.sender_id = auth.uid()
      )
    )
  );
