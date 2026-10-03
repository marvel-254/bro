import {
  SPACE_NAME_MAX,
  slugify,
  fetchMySpaces,
  fetchDiscoverableSpaces,
  joinSpace,
  leaveSpace,
  createSpace,
  subscribeToSpaces,
} from '../spaces';
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
  not: jest.Mock;
  in: jest.Mock;
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

function createChannel() {
  const channel: Record<string, jest.Mock> = {
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => channel),
  };
  return channel;
}

const RESOLVED = (data: unknown, error: unknown = null) => Promise.resolve({ data, error });

/** A chain whose single terminal `eq` resolves with the given payload. */
function createChainWithEq(data: unknown, error: unknown = null): Chain {
  const chain = createChain();
  chain.eq.mockReturnValue(RESOLVED(data, error));
  return chain;
}

/** Supabase whose from() dispatches on table name rather than call order. */
function makeByTable(tables: Record<string, Chain>, selfId: string | null = 'self'): SupabaseClient {
  const supabase = makeSupabase();
  (supabase.from as jest.Mock).mockImplementation((table: string) => tables[table]);
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: selfId ? { id: selfId } : null },
    error: null,
  });
  return supabase;
}

/** Supabase whose from() hands back the given chains in order. */
function makeSequenced(chains: Chain[], selfId: string | null = 'self'): SupabaseClient {
  const supabase = makeSupabase();
  let call = 0;
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain = chains[Math.min(call, chains.length - 1)];
    call += 1;
    return chain;
  });
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: selfId ? { id: selfId } : null },
    error: null,
  });
  return supabase;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('The Crew')).toBe('the-crew');
  });

  it('strips punctuation', () => {
    expect(slugify("Tariq's AI Lab!")).toBe('tariqs-ai-lab');
  });

  it('collapses runs of separators', () => {
    expect(slugify('a   b__c')).toBe('a-b-c');
  });

  it('falls back to "space" for input with nothing usable', () => {
    expect(slugify('!!!')).toBe('space');
  });
});

describe('fetchMySpaces', () => {
  it('returns an empty array when Supabase is not configured', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchMySpaces()).toEqual([]);
  });

  it('returns an empty array when not signed in', async () => {
    const supabase = makeSequenced([], null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchMySpaces()).toEqual([]);
  });

  it('returns an empty array when the caller has joined nothing', async () => {
    const membershipChain = createChain();
    membershipChain.eq.mockReturnValue(RESOLVED([]));
    const supabase = makeSequenced([membershipChain]);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchMySpaces()).toEqual([]);
  });

  it('throws when the membership query fails', async () => {
    const membershipChain = createChain();
    membershipChain.eq.mockReturnValue(RESOLVED(null, { message: 'membership boom' }));
    const supabase = makeSequenced([membershipChain]);
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchMySpaces()).rejects.toThrow('membership boom');
  });

  it('maps membership role and count from the embedded rows', async () => {
    const membershipChain = createChain();
    membershipChain.eq.mockReturnValue(
      RESOLVED([{ space_id: 'space-1', joined_at: '2026-10-01T00:00:00Z' }]),
    );

    const spaceChain = createChain();
    spaceChain.in.mockReturnValue({
      order: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'space-1',
            name: 'The Crew',
            slug: 'the-crew',
            description: 'bravos',
            avatar_url: null,
            is_public: false,
            owner_id: 'self',
            space_members: [{ user_id: 'self', role: 'owner', joined_at: '2026-10-01T00:00:00Z' }],
          },
        ],
        error: null,
      }),
    });

    const supabase = makeSequenced([membershipChain, spaceChain]);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchMySpaces();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'space-1',
      name: 'The Crew',
      myRole: 'owner',
      memberCount: 1,
      isPublic: false,
    });
  });
});

describe('fetchDiscoverableSpaces', () => {
  it('returns an empty array when Supabase is not configured', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchDiscoverableSpaces()).toEqual([]);
  });

  it('reports memberCount as null for spaces you have not joined', async () => {
    const spaceChain = createChain();
    spaceChain.eq.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'space-9',
              name: 'Public Lab',
              slug: 'public-lab',
              description: null,
              avatar_url: null,
              is_public: true,
              owner_id: 'someone',
              space_members: [],
            },
          ],
          error: null,
        }),
      }),
    });

    const supabase = makeByTable({
      space_members: createChainWithEq([]),
      spaces: spaceChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchDiscoverableSpaces();

    // RLS hides space_members here, so the count is unknown, not zero.
    expect(result[0].memberCount).toBeNull();
    expect(result[0].myRole).toBeNull();
  });

  it('excludes spaces the caller already joined', async () => {
    const notSpy = jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const spaceChain = createChain();
    spaceChain.eq.mockReturnValue({ not: notSpy });

    const supabase = makeByTable({
      space_members: createChainWithEq([{ space_id: 'space-1' }]),
      spaces: spaceChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await fetchDiscoverableSpaces();
    expect(notSpy).toHaveBeenCalledWith('id', 'in', '(space-1)');
  });

  it('skips the not-in filter when the caller has joined nothing', async () => {
    const spaceChain = createChain();
    spaceChain.eq.mockReturnValue({
      not: jest.fn(),
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const supabase = makeByTable({
      space_members: createChainWithEq([]),
      spaces: spaceChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await fetchDiscoverableSpaces();
    expect(spaceChain.eq.mock.results[0].value.not).not.toHaveBeenCalled();
  });
});

describe('joinSpace', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await joinSpace('space-1')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('reports not signed in', async () => {
    const supabase = makeSequenced([], null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await joinSpace('space-1')).toEqual({ ok: false, error: 'Not signed in' });
  });

  it('succeeds quietly when already a member', async () => {
    const existingChain = createChain();
    existingChain.eq.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: { space_id: 'space-1' }, error: null }),
      }),
    });

    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(existingChain);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'self' } },
      error: null,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await joinSpace('space-1')).toEqual({ ok: true });
    expect(existingChain.insert).not.toHaveBeenCalled();
  });

  it('inserts only your own membership row', async () => {
    const existingChain = createChain();
    existingChain.eq.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const insertChain = createChain();
    insertChain.insert.mockReturnValue(RESOLVED(null));

    const supabase = makeSequenced([existingChain, insertChain]);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await joinSpace('space-1');
    expect(result.ok).toBe(true);
    expect(insertChain.insert).toHaveBeenCalledWith({
      space_id: 'space-1',
      user_id: 'self',
      role: 'member',
    });
  });

  it('surfaces an insert failure', async () => {
    const existingChain = createChain();
    existingChain.eq.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const insertChain = createChain();
    insertChain.insert.mockReturnValue(RESOLVED(null, { message: 'insert boom' }));

    const supabase = makeSequenced([existingChain, insertChain]);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await joinSpace('space-1')).toEqual({ ok: false, error: 'insert boom' });
  });
});

describe('leaveSpace', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await leaveSpace('space-1')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('deletes only your own row', async () => {
    const chain = createChain();
    // delete().eq('space_id').eq('user_id') — the user_id filter is the point,
    // so assert on it directly instead of on which object eq returns.
    chain.delete.mockReturnValue(chain);
    chain.eq.mockImplementation((column: string) =>
      column === 'user_id' ? RESOLVED(null) : chain,
    );

    const supabase = makeByTable({ space_members: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await leaveSpace('space-1')).toEqual({ ok: true });
    expect(chain.eq).toHaveBeenCalledWith('space_id', 'space-1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'self');
  });
});

describe('createSpace', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createSpace({ name: 'Crew' })).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('rejects a blank name', async () => {
    const supabase = makeSequenced([]);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await createSpace({ name: '   ' })).toEqual({
      ok: false,
      error: 'Space needs a name',
    });
  });

  it('rejects a name over the limit', async () => {
    const supabase = makeSequenced([]);
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createSpace({ name: 'x'.repeat(SPACE_NAME_MAX + 1) });
    expect(result.ok).toBe(false);
  });

  it('rejects a description over the limit', async () => {
    const supabase = makeSequenced([]);
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createSpace({ name: 'Crew', description: 'y'.repeat(500) });
    expect(result.ok).toBe(false);
  });

  it('creates the space and an owner membership row', async () => {
    const spaceChain = createChain();
    spaceChain.select.mockReturnValue(spaceChain);
    spaceChain.single.mockResolvedValue({
      data: {
        id: 'space-1',
        name: 'The Crew',
        slug: 'the-crew',
        description: null,
        avatar_url: null,
        is_public: true,
        owner_id: 'self',
      },
      error: null,
    });

    const memberChain = createChain();
    memberChain.insert.mockResolvedValue({ data: null, error: null });

    const supabase = makeByTable({ spaces: spaceChain, space_members: memberChain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createSpace({ name: 'The Crew' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.space.myRole).toBe('owner');
      expect(result.space.memberCount).toBe(1);
      expect(result.space.slug).toBe('the-crew');
    }
    expect(memberChain.insert).toHaveBeenCalledWith({
      space_id: 'space-1',
      user_id: 'self',
      role: 'owner',
    });
  });

  it('retries with a suffixed slug on a unique collision', async () => {
    const spaceChain = createChain();
    spaceChain.select.mockReturnValue(spaceChain);
    spaceChain.single
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'space-2',
          name: 'The Crew',
          slug: 'the-crew-2',
          description: null,
          avatar_url: null,
          is_public: true,
          owner_id: 'self',
        },
        error: null,
      });

    const memberChain = createChain();
    memberChain.insert.mockResolvedValue({ data: null, error: null });

    const supabase = makeByTable({ spaces: spaceChain, space_members: memberChain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createSpace({ name: 'The Crew' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.space.slug).toBe('the-crew-2');
    }
    expect(spaceChain.single).toHaveBeenCalledTimes(2);
  });

  it('surfaces a non-collision insert error immediately', async () => {
    const spaceChain = createChain();
    spaceChain.select.mockReturnValue(spaceChain);
    spaceChain.single.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    const supabase = makeByTable({ spaces: spaceChain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createSpace({ name: 'The Crew' });
    expect(result).toEqual({ ok: false, error: 'permission denied' });
    expect(spaceChain.single).toHaveBeenCalledTimes(1);
  });

  it('rolls back the space when the owner membership insert fails', async () => {
    const spaceChain = createChain();
    spaceChain.select.mockReturnValue(spaceChain);
    spaceChain.single.mockResolvedValue({
      data: {
        id: 'space-1',
        name: 'The Crew',
        slug: 'the-crew',
        description: null,
        avatar_url: null,
        is_public: true,
        owner_id: 'self',
      },
      error: null,
    });

    const memberChain = createChain();
    memberChain.insert.mockResolvedValue({ data: null, error: { message: 'member boom' } });

    // The rollback also targets `spaces`, so the delete lives on the same chain
    // createSpace returned rather than a separate one.
    const rollbackDelete = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    spaceChain.delete = rollbackDelete;

    const supabase = makeByTable({ spaces: spaceChain, space_members: memberChain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createSpace({ name: 'The Crew' });

    expect(result).toEqual({ ok: false, error: 'member boom' });
    // The orphan space must be cleaned up.
    expect(rollbackDelete).toHaveBeenCalled();
    expect(rollbackDelete.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'space-1');
  });
});

describe('subscribeToSpaces', () => {
  it('returns a no-op when Supabase is not configured', () => {
    mockedGetSupabase.mockReturnValue(null);
    const unsub = subscribeToSpaces({ onChange: jest.fn() });
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('watches spaces and space_members', () => {
    const channel = createChannel();
    const supabase = makeSupabase();
    (supabase.channel as jest.Mock).mockReturnValue(channel);
    mockedGetSupabase.mockReturnValue(supabase);

    const unsub = subscribeToSpaces({ onChange: jest.fn() });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(2);
    unsub();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});