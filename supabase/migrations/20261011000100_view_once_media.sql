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
  update public.attachments
  set viewed_at = now()
  where id = attachment_id
    and view_once = true
    and viewed_at is null;
end;
$$;

-- Allow conversation members to mark view-once attachments as viewed
grant execute on function public.mark_attachment_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Chat pinning
-- ---------------------------------------------------------------------------
-- Conversations already have is_pinned column, add index for sorting
create index if not exists conversations_is_pinned_idx
  on public.conversations (is_pinned desc, last_message_at desc nulls last)
  where is_pinned = true;

-- Add function to toggle pin
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
