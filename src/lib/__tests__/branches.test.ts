import {
  BRANCH_SUGGEST_AT,
  BRANCH_TITLE_MAX,
  fetchReplyCounts,
  fetchBranchesByRoot,
  fetchBranches,
  fetchBranch,
  fetchBranchMessages,
  createBranch,
  postToBranch,
  renameBranch,
  deleteBranch,
  branchFromReplies,
  subscribeToBranch,
  subscribeToBranches,
} from '../branches';
import { getSupabase } from '../supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../supabase', () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

type Chain = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  is: jest.Mock;
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
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'self' } }, error: null }),
    },
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  return client as unknown as SupabaseClient;
}

function makeByTable(tables: Record<string, Chain>, selfId: string | null = 'self'): SupabaseClient {
  const supabase = makeSupabase();
  (supabase.from as jest.Mock).mockImplementation((table: string) => tables[table]);
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: selfId ? { id: selfId } : null },
    error: null,
  });
  return supabase;
}

function createChannel() {
  const channel: Record<string, jest.Mock> = {
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => channel),
  };
  return channel;
}

const RESOLVED = (data: unknown, error: unknown = null) => Promise.resolve({ data, error });

const RAW_BRANCH = {
  id: 'b1',
  conversation_id: 'c1',
  root_message_id: 'm1',
  title: null,
  created_by: 'self',
  message_count: 3,
  is_pinned: false,
  last_activity_at: '2026-10-03T12:00:00Z',
  created_at: '2026-10-03T11:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('constants', () => {
  it('suggests a branch at five replies, per the docs', () => {
    expect(BRANCH_SUGGEST_AT).toBe(5);
  });

  it('caps the branch title', () => {
    expect(BRANCH_TITLE_MAX).toBe(80);
  });
});

describe('fetchReplyCounts', () => {
  it('returns an empty map without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchReplyCounts(['m1'])).toEqual({});
  });

  it('returns an empty map for an empty id list', async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchReplyCounts([])).toEqual({});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('counts replies per parent message', async () => {
    const chain = createChain();
    chain.in.mockReturnValue({
      eq: jest.fn().mockResolvedValue({
        data: [
          { reply_to_message_id: 'm1' },
          { reply_to_message_id: 'm1' },
          { reply_to_message_id: 'm2' },
          { reply_to_message_id: null },
        ],
        error: null,
      }),
    });
    const supabase = makeByTable({ messages: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchReplyCounts(['m1', 'm2'])).toEqual({ m1: 2, m2: 1 });
  });

  it('swallows errors because a missing pill must not break the chat', async () => {
    const chain = createChain();
    chain.in.mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    });
    const supabase = makeByTable({ messages: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchReplyCounts(['m1'])).toEqual({});
  });
});

describe('fetchBranchesByRoot', () => {
  it('maps root message id to branch id', async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      RESOLVED([{ id: 'b1', root_message_id: 'm1' }, { id: 'b2', root_message_id: 'm2' }]),
    );
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchBranchesByRoot(['m1', 'm2'])).toEqual({ m1: 'b1', m2: 'b2' });
  });

  it('keeps the first branch when a message somehow has two', async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      RESOLVED([
        { id: 'b-first', root_message_id: 'm1' },
        { id: 'b-second', root_message_id: 'm1' },
      ]),
    );
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchBranchesByRoot(['m1'])).toEqual({ m1: 'b-first' });
  });
});

describe('fetchBranches', () => {
  it('returns an empty array without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchBranches('c1')).toEqual([]);
  });

  it('maps rows and attaches the root message', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [{ ...RAW_BRANCH, root: { id: 'm1', content: 'root text' } }],
        error: null,
      }),
    });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchBranches('c1');

    expect(result[0]).toMatchObject({
      id: 'b1',
      conversationId: 'c1',
      rootMessageId: 'm1',
      messageCount: 3,
    });
    expect(result[0].rootMessage).toMatchObject({ id: 'm1', content: 'root text' });
  });

  it('tolerates a deleted root message', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [{ ...RAW_BRANCH, root: null }],
        error: null,
      }),
    });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect((await fetchBranches('c1'))[0].rootMessage).toBeNull();
  });

  it('throws when the query fails', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      order: jest.fn().mockResolvedValue({ data: null, error: { message: 'branch boom' } }),
    });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchBranches('c1')).rejects.toThrow('branch boom');
  });
});

describe('fetchBranch', () => {
  it('returns null without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchBranch('b1')).toBeNull();
  });

  it('returns null when RLS hides it', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchBranch('b1')).toBeNull();
  });

  it('maps a visible branch', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { ...RAW_BRANCH, root: null },
        error: null,
      }),
    });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect((await fetchBranch('b1'))?.messageCount).toBe(3);
  });
});

describe('fetchBranchMessages', () => {
  it('returns an empty array without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchBranchMessages('b1')).toEqual([]);
  });

  it('orders oldest-first so the thread reads top to bottom', async () => {
    const chain = createChain();
    const orderSpy = jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({ data: [{ id: 'm1' }, { id: 'm2' }], error: null }),
    });
    chain.eq.mockReturnValue({ order: orderSpy });
    const supabase = makeByTable({ messages: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await fetchBranchMessages('b1');
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});

describe('createBranch', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createBranch('c1', 'm1')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('reports not signed in', async () => {
    const supabase = makeByTable({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await createBranch('c1', 'm1')).toEqual({ ok: false, error: 'Not signed in' });
  });

  it('rejects an over-long title', async () => {
    const supabase = makeByTable({});
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createBranch('c1', 'm1', 'x'.repeat(BRANCH_TITLE_MAX + 1));
    expect(result.ok).toBe(false);
  });

  it('creates with the creator taken from the session', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: RAW_BRANCH, error: null });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createBranch('c1', 'm1', '  ');

    expect(result.ok).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith({
      conversation_id: 'c1',
      root_message_id: 'm1',
      title: null,
      created_by: 'self',
    });
  });
});

describe('postToBranch', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await postToBranch('b1', 'hi')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('rejects an empty message', async () => {
    const supabase = makeByTable({});
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await postToBranch('b1', '   ')).toEqual({
      ok: false,
      error: 'Message cannot be empty',
    });
  });

  it('reports not signed in', async () => {
    const supabase = makeByTable({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await postToBranch('b1', 'hi')).toEqual({ ok: false, error: 'Not signed in' });
  });

  it('resolves conversation_id from the branch rather than inventing it', async () => {
    const lookupChain = createChain();
    lookupChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: { conversation_id: 'c1' }, error: null }),
    });

    const insertChain = createChain();
    insertChain.select.mockReturnValue(insertChain);
    insertChain.single.mockResolvedValue({ data: { id: 'm9' }, error: null });

    const supabase = makeByTable({
      conversation_branches: lookupChain,
      messages: insertChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await postToBranch('b1', 'tsup');

    expect(result).toEqual({ ok: true, messageId: 'm9' });
    // messages.conversation_id is NOT NULL, so it must come from the branch.
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c1', branch_id: 'b1', sender_id: 'self' }),
    );
  });

  it('does not set reply_to_message_id, which would double-count the pill', async () => {
    const lookupChain = createChain();
    lookupChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: { conversation_id: 'c1' }, error: null }),
    });

    const insertChain = createChain();
    insertChain.select.mockReturnValue(insertChain);
    insertChain.single.mockResolvedValue({ data: { id: 'm9' }, error: null });

    const supabase = makeByTable({
      conversation_branches: lookupChain,
      messages: insertChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await postToBranch('b1', 'tsup');

    const inserted = insertChain.insert.mock.calls[0][0];
    expect(inserted.reply_to_message_id).toBeUndefined();
  });

  it('stops when the branch is not visible', async () => {
    const lookupChain = createChain();
    lookupChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const supabase = makeByTable({
      conversation_branches: lookupChain,
      messages: createChain(),
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await postToBranch('b1', 'tsup')).toEqual({
      ok: false,
      error: 'Branch not found',
    });
  });
});

describe('renameBranch', () => {
  it('rejects an over-long title', async () => {
    const supabase = makeByTable({});
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await renameBranch('b1', 'x'.repeat(BRANCH_TITLE_MAX + 1));
    expect(result.ok).toBe(false);
  });

  it('stores null for a blank title', async () => {
    const chain = createChain();
    chain.update.mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await renameBranch('b1', '   ')).toEqual({ ok: true });
    expect(chain.update).toHaveBeenCalledWith({ title: null });
  });
});

describe('deleteBranch', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await deleteBranch('b1')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('deletes by id', async () => {
    const chain = createChain();
    const eqSpy = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.delete.mockReturnValue({ eq: eqSpy });
    const supabase = makeByTable({ conversation_branches: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await deleteBranch('b1')).toEqual({ ok: true });
    expect(eqSpy).toHaveBeenCalledWith('id', 'b1');
  });
});

describe('branchFromReplies', () => {
  it('creates the branch then moves the existing replies into it', async () => {
    const branchChain = createChain();
    branchChain.select.mockReturnValue(branchChain);
    branchChain.single.mockResolvedValue({ data: RAW_BRANCH, error: null });

    const messageChain = createChain();
    // update().eq('reply_to_message_id').eq('conversation_id').is('branch_id', null)
    const isSpy = jest.fn().mockResolvedValue({ data: null, error: null });
    messageChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ is: isSpy }),
      }),
    });

    const supabase = makeByTable({
      conversation_branches: branchChain,
      messages: messageChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await branchFromReplies('c1', 'm1');

    expect(result.ok).toBe(true);
    // Replies are moved, not copied, so nobody retypes anything.
    expect(messageChain.update).toHaveBeenCalledWith({ branch_id: 'b1' });
    expect(isSpy).toHaveBeenCalledWith('branch_id', null);
  });

  it('rolls the branch back when moving the replies fails', async () => {
    const branchChain = createChain();
    branchChain.select.mockReturnValue(branchChain);
    branchChain.single.mockResolvedValue({ data: RAW_BRANCH, error: null });
    branchChain.delete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    const messageChain = createChain();
    messageChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({ data: null, error: { message: 'move boom' } }),
        }),
      }),
    });

    const supabase = makeByTable({
      conversation_branches: branchChain,
      messages: messageChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await branchFromReplies('c1', 'm1');

    expect(result).toEqual({ ok: false, error: 'move boom' });
    // No empty shell left behind.
    expect(branchChain.delete).toHaveBeenCalled();
  });
});

describe('subscriptions', () => {
  it('branch subscription is a no-op without a backend', () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(typeof subscribeToBranch('b1', { onChange: jest.fn() })).toBe('function');
    expect(typeof subscribeToBranches('c1', { onChange: jest.fn() })).toBe('function');
  });

  it('branch subscription watches two tables and cleans up', () => {
    const channel = createChannel();
    const supabase = makeSupabase();
    (supabase.channel as jest.Mock).mockReturnValue(channel);
    mockedGetSupabase.mockReturnValue(supabase);

    const unsub = subscribeToBranch('b1', { onChange: jest.fn() });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(2);
    unsub();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});