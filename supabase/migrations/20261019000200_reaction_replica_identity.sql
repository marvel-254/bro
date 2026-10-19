-- message_reactions: give realtime DELETE payloads the full old row.
--
-- The conversation subscription reacts to `message_reactions` changes and
-- dispatches on the affected message id (src/lib/conversations.ts,
-- subscribeToConversation -> onReactionChange). With the default replica
-- identity, a DELETE only carries the primary key, so removing a reaction
-- delivered `old.message_id = null`, the handler ignored it, and the reaction
-- stayed on screen for everyone until the next reload.
--
-- The messages table already sets `replica identity full` for the same reason.

alter table public.message_reactions replica identity full;
