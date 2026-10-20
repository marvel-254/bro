-- Client-generated identity for a message, so a retried send cannot create a
-- duplicate row.
--
-- The outbox replays a message after a network failure. If the original insert
-- actually committed but the response was lost, a naive retry inserts a second
-- copy. Clients now attach the same `client_id` to every attempt; the unique
-- index below makes the second insert fail with 23505, and sendMessage() treats
-- that as success by returning the row that already exists.
--
-- Nullable on purpose: messages sent before this migration, and any send path
-- that does not supply an id, must keep working unchanged.
alter table public.messages
  add column if not exists client_id text;

-- Scoped to the sender rather than globally unique: ids are generated per
-- device, and two devices must not be able to collide across accounts.
create unique index if not exists messages_sender_client_id_key
  on public.messages (sender_id, client_id)
  where client_id is not null;

comment on column public.messages.client_id is
  'Client-generated idempotency key; unique per sender. Not a public identifier.';
