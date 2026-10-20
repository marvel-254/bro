-- BRO — view-once media & chat pinning
--
-- Adds support for WhatsApp-style view-once media and chat pinning.

-- ---------------------------------------------------------------------------
-- View-once media
-- ---------------------------------------------------------------------------
-- Add view_once flag and viewed_at timestamp to attachments
alter table public.attachments
  add column if not exists view_once boolean not null default false;

alter table public.attachments
  add column if not exists viewed_at timestamptz;

create index if not exists attachments_view_once_idx
  on public.attachments (view_once, viewed_at)
  where view_once = true;

-- RLS policy for view-once: recipient can read, but we need a way to mark as viewed
-- We'll add a function to mark as viewed that can be called via RPC
create or replace function public.mark_attachment_viewed(attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- security definer bypasses RLS, so membership is checked explicitly. Without
  -- this, any signed-in user who guessed an attachment id could burn someone
  -- else's view-once media.
  update public.attachments a
  set viewed_at = now()
  where a.id = attachment_id
    and a.view_once = true
    and a.viewed_at is null
    and exists (
      select 1
      from public.messages m
      join public.conversation_members cm
        on cm.conversation_id = m.conversation_id
      where m.id = a.message_id
        and cm.user_id = auth.uid()
    );
end;
$$;

-- Allow conversation members to mark view-once attachments as viewed
grant execute on function public.mark_attachment_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chat pinning
-- ---------------------------------------------------------------------------
-- Add function to toggle pin.
--
-- There is no conversations.last_message_at column, so the incomplete version
-- of this migration failed on a CREATE INDEX against it and was never applied.
-- Recent-activity ordering is computed by conversation_previews, so the pin
-- index is simply not needed; the partial index below only covers pinned rows.
create index if not exists conversations_is_pinned_idx
  on public.conversations (created_at desc)
  where is_pinned = true;

create or replace function public.toggle_conversation_pin(conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_state boolean;
begin
  update public.conversations
  set is_pinned = not is_pinned
  where id = conversation_id
    and exists (
      select 1 from public.conversation_members
      where conversation_id = conversations.id
        and user_id = auth.uid()
    )
  returning is_pinned into new_state;
  return new_state;
end;
$$;

grant execute on function public.toggle_conversation_pin(uuid) to authenticated;
