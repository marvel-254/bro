import {
  MESSAGES_PAGE_SIZE,
  fetchMessages,
  sendMessage,
  markConversationRead,
  fetchConversationSummaries,
  subscribeToConversation,
  subscribeToConversationList,
  fetchReactions,
  toggleReaction,
  editMessage,
  deleteMessage,
  fetchReadCursor,
  fetchReadCursors,
  createDirectConversation,
} from '../conversations';
import { getSupabase } from '../supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../supabase', () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

/**
 * Chainable Supabase query-builder mock. Every method returns the chain by
 * default so `.select().eq().order().limit()` all chain. Tests override the
 * terminal method (limit / single / maybeSingle / lt / eq / in / neq) to resolve.
 */
type Chain = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  lt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
};

function createChain(): Chain {
  const target: Record<string, jest.Mock> = {};
  const chain = new Proxy(target, {
    get(t, prop) {
      const key = String(prop);
      if (key === 'then') return undefined;
      if (!(key in t)) t[key] = jest.fn(() => chain);
      return t[key];
    },
  });
  return chain as unknown as Chain;
}

function makeSupabase(overrides: Record<string, unknown> = {}): SupabaseClient {
  const client = {
    from: jest.fn((_table: string) => createChain()),
    auth: { getUser: jest.fn() },
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  return client as unknown as SupabaseClient;
}

function createChannel() {
  const channel: Record<string, jest.Mock> = {
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => channel),
  };
  return channel;
}

const RESOLVED = (data: unknown, error: unknown = null) => Promise.resolve({ data, error });

describe('conversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MESSAGES_PAGE_SIZE', () => {
    it('is 50', () => {
      expect(MESSAGES_PAGE_SIZE).toBe(50);
    });
  });

  describe('fetchMessages', () => {
    it('returns an empty array when Supabase is not configured', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchMessages('conv-1')).toEqual([]);
    });

    it('returns messages reversed (newest-last)', async () => {
      const raw = [
        { id: 'm3', created_at: '2026-10-03T12:00:00Z', content: 'third' },
        { id: 'm2', created_at: '2026-10-03T11:00:00Z', content: 'second' },
        { id: 'm1', created_at: '2026-10-03T10:00:00Z', content: 'first' },
      ];
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(raw));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchMessages('conv-1');
      expect(result.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('throws when the query returns an error', async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(null, { message: 'boom' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchMessages('conv-1')).rejects.toThrow('boom');
    });

    it('adds a before filter when provided', async () => {
      const chain = createChain();
      chain.lt.mockReturnValue(RESOLVED([]));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await fetchMessages('conv-1', 20, '2026-10-03T12:00:00Z');
      expect(chain.lt).toHaveBeenCalledWith('created_at', '2026-10-03T12:00:00Z');
      expect(chain.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('sendMessage', () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await sendMessage('conv-1', 'hello');
      expect(result).toEqual({ ok: false, error: 'Backend not configured' });
    });

    it('returns "Message cannot be empty" for blank content', async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await sendMessage('conv-1', '   ');
      expect(result).toEqual({ ok: false, error: 'Message cannot be empty' });
    });

    it('returns "Not signed in" when getUser fails', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await sendMessage('conv-1', 'hello');
      expect(result).toEqual({ ok: false, error: 'Not signed in' });
    });

    it('returns ok with message on success', async () => {
      const saved = {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_id: 'user-1',
        content: 'hello',
        type: 'text',
        status: 'sent',
        reply_to_message_id: null,
        branch_id: null,
        created_at: '2026-10-03T12:00:00Z',
        updated_at: '2026-10-03T12:00:00Z',
      };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(saved));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await sendMessage('conv-1', 'hello');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message.id).toBe('msg-1');
        expect(result.message.content).toBe('hello');
      }
    });

    it('sets expires_at when expiresInSeconds is provided', async () => {
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED({ id: 'msg-1' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await sendMessage('conv-1', 'hello', { expiresInSeconds: 60 });
      const insertArg = chain.insert.mock.calls[0][0];
      expect(insertArg.expires_at).toBeTruthy();
    });

    it('passes replyToMessageId and branchId to insert', async () => {
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED({ id: 'msg-1' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await sendMessage('conv-1', 'reply', { replyToMessageId: 'parent-1', branchId: 'br-1' });
      const insertArg = chain.insert.mock.calls[0][0];
      expect(insertArg.reply_to_message_id).toBe('parent-1');
      expect(insertArg.branch_id).toBe('br-1');
    });
  });

  describe('markConversationRead', () => {
    it('does nothing when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(markConversationRead('conv-1')).resolves.toBeUndefined();
    });

    it('does nothing when not signed in', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);
      await expect(markConversationRead('conv-1')).resolves.toBeUndefined();
    });

    it('updates last_read_at when signed in', async () => {
      const chain = createChain();
      chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(RESOLVED(null));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await markConversationRead('conv-1');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ last_read_at: expect.any(String) }),
      );
      expect(chain.eq).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchConversationSummaries', () => {
    it('returns an empty array when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchConversationSummaries()).toEqual([]);
    });

    it('computes unread count and attaches peers', async () => {
      const convRows = [
        {
          id: 'conv-1',
          type: 'direct',
          name: null,
          avatar_url: null,
          created_at: '2026-10-03T10:00:00Z',
          conversation_members: [
            { user_id: 'self', last_read_at: '2026-10-03T11:00:00Z' },
            { user_id: 'peer-1', last_read_at: null },
          ],
          messages: [
            { id: 'm1', content: 'hi', sender_id: 'peer-1', created_at: '2026-10-03T11:30:00Z' },
            { id: 'm2', content: 'yo', sender_id: 'peer-1', created_at: '2026-10-03T12:00:00Z' },
          ],
        },
      ];
      const peerRows = [
        {
          conversation_id: 'conv-1',
          user_id: 'peer-1',
          profile: { id: 'peer-1', display_name: 'Peer', avatar_url: null, presence: 'online', presence_text: null, presence_emoji: null },
        },
      ];

      const convChain = createChain();
      convChain.limit.mockReturnValue(RESOLVED(convRows));

      const peerChain = createChain();
      peerChain.neq.mockReturnValue(RESOLVED(peerRows));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? convChain : peerChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'self' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchConversationSummaries();
      expect(result).toHaveLength(1);
      expect(result[0].unread_count).toBe(2);
      expect(result[0].last_message_preview).toBe('yo');
      expect(result[0].last_message_sender).toBe('peer-1');
      expect(result[0].peers).toHaveLength(1);
      expect(result[0].peers[0].user_id).toBe('peer-1');
    });

    it('throws when the query errors', async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(null, { message: 'db error' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'self' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchConversationSummaries()).rejects.toThrow('db error');
    });
  });

  describe('subscribeToConversation', () => {
    it('returns a no-op when Supabase is null', () => {
      mockedGetSupabase.mockReturnValue(null);
      const unsub = subscribeToConversation('conv-1', {
        onInsert: jest.fn(),
        onUpdate: jest.fn(),
        onReactionChange: jest.fn(),
      });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('subscribes and removes the channel on cleanup', () => {
      const channel = createChannel();
      const supabase = makeSupabase();
      (supabase.channel as jest.Mock).mockReturnValue(channel);
      mockedGetSupabase.mockReturnValue(supabase);

      const unsub = subscribeToConversation('conv-1', {
        onInsert: jest.fn(),
        onUpdate: jest.fn(),
        onReactionChange: jest.fn(),
      });

      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      expect(channel.on).toHaveBeenCalledTimes(3);
      unsub();
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });

  describe('subscribeToConversationList', () => {
    it('returns a no-op when Supabase is null', () => {
      mockedGetSupabase.mockReturnValue(null);
      const unsub = subscribeToConversationList({ onChange: jest.fn() });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('subscribes to INSERT and UPDATE on messages', () => {
      const channel = createChannel();
      const supabase = makeSupabase();
      (supabase.channel as jest.Mock).mockReturnValue(channel);
      mockedGetSupabase.mockReturnValue(supabase);

      subscribeToConversationList({ onChange: jest.fn() });
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      expect(channel.on).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchReactions', () => {
    it('returns an empty object for an empty message id list', async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      expect(await fetchReactions([])).toEqual({});
    });

    it('returns an empty object when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReactions(['msg-1'])).toEqual({});
    });

    it('groups reactions by message_id', async () => {
      const reactions = [
        { id: 'r1', message_id: 'msg-1', user_id: 'u1', emoji: '❤️', created_at: '2026-10-03T12:00:00Z' },
        { id: 'r2', message_id: 'msg-1', user_id: 'u2', emoji: '❤️', created_at: '2026-10-03T12:01:00Z' },
        { id: 'r3', message_id: 'msg-2', user_id: 'u1', emoji: '👍', created_at: '2026-10-03T12:02:00Z' },
      ];
      const chain = createChain();
      chain.in.mockReturnValue(RESOLVED(reactions));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchReactions(['msg-1', 'msg-2']);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['msg-1']).toHaveLength(2);
      expect(result['msg-2']).toHaveLength(1);
    });

    it('throws on query error', async () => {
      const chain = createChain();
      chain.in.mockReturnValue(RESOLVED(null, { message: 'query failed' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchReactions(['msg-1'])).rejects.toThrow('query failed');
    });
  });

  describe('toggleReaction', () => {
    it('does nothing when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(toggleReaction('msg-1', '❤️')).resolves.toBeUndefined();
    });

    it('does nothing when not signed in', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);
      await expect(toggleReaction('msg-1', '❤️')).resolves.toBeUndefined();
    });

    it('inserts a new reaction when none exists', async () => {
      const selectChain = createChain();
      selectChain.maybeSingle.mockReturnValue(RESOLVED(null));
      const insertChain = createChain();
      insertChain.insert.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await toggleReaction('msg-1', '❤️');
      expect(insertChain.insert).toHaveBeenCalledWith({
        message_id: 'msg-1',
        user_id: 'user-1',
        emoji: '❤️',
      });
    });

    it('removes the reaction when it already exists', async () => {
      const selectChain = createChain();
      selectChain.maybeSingle.mockReturnValue(RESOLVED({ id: 'react-1' }));
      const deleteChain = createChain();
      deleteChain.eq.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : deleteChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      await toggleReaction('msg-1', '❤️');
      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.eq).toHaveBeenCalledWith('id', 'react-1');
    });
  });

  describe('editMessage', () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await editMessage('msg-1', 'edited');
      expect(result).toEqual({ ok: false, error: 'Backend not configured' });
    });

    it('returns "Message cannot be empty" for blank content', async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await editMessage('msg-1', '  ');
      expect(result).toEqual({ ok: false, error: 'Message cannot be empty' });
    });

    it('returns ok with updated message on success', async () => {
      const updated = { id: 'msg-1', content: 'edited', edited_at: '2026-10-03T12:00:00Z' };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(updated));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await editMessage('msg-1', 'edited');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message.id).toBe('msg-1');
      }
    });
  });

  describe('deleteMessage', () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await deleteMessage('msg-1');
      expect(result).toEqual({ ok: false, error: 'Backend not configured' });
    });

    it('returns ok on successful soft delete', async () => {
      const deleted = { id: 'msg-1', deleted_for_everyone: true, content: '' };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(deleted));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await deleteMessage('msg-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('fetchReadCursor', () => {
    it('returns null when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReadCursor('conv-1')).toBeNull();
    });

    it('returns null when not signed in', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);
      expect(await fetchReadCursor('conv-1')).toBeNull();
    });

    it('returns last_read_at when present', async () => {
      const chain = createChain();
      chain.maybeSingle.mockReturnValue(RESOLVED({ last_read_at: '2026-10-03T12:00:00Z' }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchReadCursor('conv-1')).toBe('2026-10-03T12:00:00Z');
    });

    it('returns null when last_read_at is null', async () => {
      const chain = createChain();
      chain.maybeSingle.mockReturnValue(RESOLVED({ last_read_at: null }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchReadCursor('conv-1')).toBeNull();
    });
  });

  describe('fetchReadCursors', () => {
    it('returns an empty object when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReadCursors('conv-1')).toEqual({});
    });

    it('returns a map of user_id to last_read_at', async () => {
      const rows = [
        { user_id: 'user-1', last_read_at: '2026-10-03T12:00:00Z' },
        { user_id: 'user-2', last_read_at: null },
      ];
      const chain = createChain();
      chain.eq.mockReturnValue(RESOLVED(rows));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchReadCursors('conv-1');
      expect(result).toEqual({ 'user-1': '2026-10-03T12:00:00Z', 'user-2': null });
    });
  });

  describe('createDirectConversation', () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await createDirectConversation('peer-1');
      expect(result).toEqual({ ok: false, error: 'Backend not configured' });
    });

    it('returns "Not signed in" when getUser fails', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await createDirectConversation('peer-1');
      expect(result).toEqual({ ok: false, error: 'Not signed in' });
    });

    it('returns existing conversation id when one is shared', async () => {
      const memberChain = createChain();
      memberChain.eq
        .mockReturnValueOnce(RESOLVED([{ conversation_id: 'conv-a' }]))
        .mockReturnValueOnce(RESOLVED([{ conversation_id: 'existing-conv' }]));

      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(memberChain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await createDirectConversation('peer-1');
      expect(result).toEqual({ ok: true, conversationId: 'existing-conv' });
    });

    it('creates a new conversation and membership rows when none exists', async () => {
      const memberChain = createChain();
      memberChain.eq
        .mockReturnValueOnce(RESOLVED([{ conversation_id: 'conv-a' }]))
        .mockReturnValueOnce(RESOLVED([]));

      const convInsertChain = createChain();
      convInsertChain.single.mockReturnValue(RESOLVED({ id: 'new-conv' }));

      const memberInsertChain = createChain();
      memberInsertChain.insert.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 2) return memberChain;
        if (callCount === 3) return convInsertChain;
        return memberInsertChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await createDirectConversation('peer-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.conversationId).toBe('new-conv');
      }
    });

    it('returns error when conversation creation fails', async () => {
      const memberChain = createChain();
      memberChain.eq
        .mockReturnValueOnce(RESOLVED([{ conversation_id: 'conv-a' }]))
        .mockReturnValueOnce(RESOLVED([]));

      const convInsertChain = createChain();
      convInsertChain.single.mockReturnValue(RESOLVED(null, { message: 'create failed' }));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? memberChain : convInsertChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await createDirectConversation('peer-1');
      expect(result).toEqual({ ok: false, error: 'create failed' });
    });
  });
});
