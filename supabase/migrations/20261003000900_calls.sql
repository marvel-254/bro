-- BRO — voice and video calls (1:1)
--
-- Call *state* lives here. Call *signaling* (SDP offers/answers and ICE
-- candidates) does NOT: those messages are worthless a second after delivery,
-- so they travel over a Realtime broadcast channel `call:<callId>` and are
-- never written to disk. This migration only stores what must outlive the
-- call itself: who called whom, when, what kind, and how it ended.
--
-- v1 is 1:1 only. Group calls need an SFU (LiveKit per the research docs) and
-- are explicitly out of scope here; nothing in this schema prevents adding a
-- call_members table later.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'declined', 'ended', 'missed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);

create index if not exists calls_conversation_idx
  on public.calls (conversation_id, created_at desc);

create index if not exists calls_participant_idx
  on public.calls (callee_id, status, created_at desc);

create index if not exists calls_caller_idx
  on public.calls (caller_id, created_at desc);

alter table public.calls enable row level security;

-- Both parties read through conversation membership, which they both have.
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select using (public.is_conversation_member(conversation_id));

-- You can only ever place a call as yourself, from a conversation you are in.
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls
  for insert with check (
    caller_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Either party moves the state machine (ringing -> active/declined, any ->
-- ended/missed). The allowed transitions are enforced client-side; RLS only
-- guarantees that a stranger to the conversation cannot touch the row.
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls
  for update using (
    caller_id = auth.uid()
    or callee_id = auth.uid()
  );

-- No delete policy: calls are a log. History survives both parties.

-- ---------------------------------------------------------------------------
-- Activity type
-- ---------------------------------------------------------------------------

-- The activity check constraint predates calls. A missed call is exactly the
-- kind of thing Activity exists for, so extend the enum rather than smuggling
-- it in as another type.
alter table public.activity
  drop constraint if exists activity_type_check;

alter table public.activity
  add constraint activity_type_check
  check (type in ('reply', 'mention', 'reaction', 'join', 'invite', 'follow', 'missed_call'));
-- ---------------------------------------------------------------------------
-- Missed-call activity
-- ---------------------------------------------------------------------------

-- A call that rings without being answered should surface in Activity. The
-- client marks it missed on cancel; this trigger turns that into the event.
create or replace function public.record_missed_call_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'missed' and (old.status is distinct from 'missed') then
    insert into public.activity (type, actor_id, target_id, target_type)
    values ('missed_call', new.caller_id, new.id, 'call');
  end if;
  return new;
end;
$$;

drop trigger if exists calls_record_missed on public.calls;
create trigger calls_record_missed
  after update of status on public.calls
  for each row
  execute function public.record_missed_call_activity();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- The callee's phone must wake on INSERT (incoming call) and both sides must
-- see status changes (accept/decline/end).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;