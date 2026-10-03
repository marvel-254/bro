-- BRO — search schema
--
-- Adds full-text search over messages behind a security-definer RPC so the
-- client can never be trusted for authorization.
--
-- Design notes:
--
--   * Message search MUST be scoped to conversations the caller belongs to.
--     A plain `select ... from messages where content like '%x%'` cannot express
--     that safely from the client, so it goes through search_messages(), which
--     filters with is_conversation_member() inside the database.
--   * The RPC is SECURITY DEFINER with a pinned search_path so it can read the
--     tables regardless of the caller's own grants. It never trusts an id passed
--     in from the client for authorization — membership is resolved from
--     auth.uid() on every row.
--   * People and Spaces search needs no RPC: plain RLS'd selects already scope
--     those correctly, so they are left to the client.

-- ---------------------------------------------------------------------------
-- messages: full-text index
-- ---------------------------------------------------------------------------

-- 'simple' rather than 'english' on purpose: stemming mangles the slang that is
-- most of what people type here ("tsup", "bruv", "msee"), and an exact-ish match
-- on those is more useful than a fuzzy match on everything else.
alter table public.messages
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

comment on column public.messages.search_vector is
  'Generated tsvector over the message body, using the simple config so slang is
   not stemmed away.';

create index if not exists messages_search_vector_idx
  on public.messages using gin (search_vector);

-- ---------------------------------------------------------------------------
-- search RPC
-- ---------------------------------------------------------------------------

drop function if exists public.search_messages(text, int);

create function public.search_messages(query text, result_limit int default 25)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    ts_rank(m.search_vector, websearch_to_tsquery('simple', query)) as rank
  from public.messages m
  where m.deleted_for_everyone = false
    and public.is_conversation_member(m.conversation_id)
    and (
      -- Whole-word / prefix match, which is what the GIN index serves.
      m.search_vector @@ websearch_to_tsquery('simple', query)
      -- Substring fallback for half-typed words: "tsu" should still find "tsup".
      -- This is an OR, not an AND, otherwise the index match would gate the
      -- fallback and make it unreachable.
      or m.content ilike '%' || query || '%'
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(result_limit, 25), 100));
$$;

comment on function public.search_messages(text, int) is
  'Full-text plus substring search over message bodies, restricted to
   conversations the caller is a member of.';

-- Only signed-in callers may search, and only execute — never table reads.
grant execute on function public.search_messages(text, int) to authenticated;
revoke execute on function public.search_messages(text, int) from anon;