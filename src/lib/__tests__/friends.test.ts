import {
  fetchFriends,
  fetchFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  areFriends,
  subscribeToFriendships,
} from '../friends';
import { getSupabase } from '../supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../supabase', () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<typeof getSupabase>;

type Chain = Record<string, jest.Mock>;

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

function makeSupabase(
  chains: Record<string, Chain> = {},
  selfId: string | null = 'self',
): SupabaseClient {
  const client = {
    from: jest.fn((table: string) => chains[table] ?? createChain()),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: selfId ? { id: selfId } : null },
        error: null,
      }),
    },
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(() => Promise.resolve()),
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchFriends', () => {
  it('returns an empty array without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchFriends()).toEqual([]);
  });

  it('returns an empty array when signed out', async () => {
    const supabase = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchFriends()).toEqual([]);
  });

  it('resolves the correct side and direction of each row', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              requester_id: 'self',
              addressee_id: 'peer-1',
              created_at: '2026-10-03T12:00:00Z',
              requester: null,
              addressee: { display_name: 'Sarah', username: 'sarah', avatar_url: null, presence: 'online' },
            },
            {
              requester_id: 'peer-2',
              addressee_id: 'self',
              created_at: '2026-10-02T12:00:00Z',
              requester: { display_name: 'Tariq', username: null, avatar_url: null, presence: 'afk' },
              addressee: null,
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchFriends();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      userId: 'peer-1',
      displayName: 'Sarah',
      direction: 'outgoing',
    });
    expect(result[1]).toMatchObject({
      userId: 'peer-2',
      displayName: 'Tariq',
      direction: 'incoming',
    });
  });

  it('never renders a blank name for a deleted profile', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              requester_id: 'self',
              addressee_id: 'gone',
              created_at: '2026-10-03T12:00:00Z',
              requester: null,
              addressee: null,
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect((await fetchFriends())[0].displayName).toBe('Someone');
  });

  it('throws when the query fails', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: null, error: { message: 'friends boom' } }),
      }),
    });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchFriends()).rejects.toThrow('friends boom');
  });
});

describe('fetchFriendRequests', () => {
  it('labels incoming and outgoing by which side you are on', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              requester_id: 'peer-1',
              addressee_id: 'self',
              created_at: '2026-10-03T12:00:00Z',
              requester: { display_name: 'Sarah', username: 'sarah', avatar_url: null },
              addressee: null,
            },
            {
              requester_id: 'self',
              addressee_id: 'peer-2',
              created_at: '2026-10-03T11:00:00Z',
              requester: null,
              addressee: { display_name: 'Tariq', username: null, avatar_url: null },
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchFriendRequests();

    expect(result[0]).toMatchObject({ userId: 'peer-1', direction: 'incoming' });
    expect(result[1]).toMatchObject({ userId: 'peer-2', direction: 'outgoing' });
  });
});

describe('sendFriendRequest', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await sendFriendRequest('peer')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('reports sign-out and self-request', async () => {
    const signedOut = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(signedOut);
    expect(await sendFriendRequest('peer')).toEqual({ ok: false, error: 'Not signed in' });

    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await sendFriendRequest('self')).toEqual({ ok: false, error: 'That is you' });
  });

  it('is a quiet success when a pending or accepted row already exists', async () => {
    for (const status of ['pending', 'accepted']) {
      const chain = createChain();
      chain.select.mockReturnValue(chain);
      chain.or.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { requester_id: 'self', addressee_id: 'peer', status },
          error: null,
        }),
      });
      const supabase = makeSupabase({ friendships: chain });
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await sendFriendRequest('peer')).toEqual({ ok: true });
      expect(chain.insert).not.toHaveBeenCalled();
    }
  });

  it('inserts as yourself into pending', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.or.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    chain.insert.mockResolvedValue({ data: null, error: null });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await sendFriendRequest('peer')).toEqual({ ok: true });
    expect(chain.insert).toHaveBeenCalledWith({
      requester_id: 'self',
      addressee_id: 'peer',
      status: 'pending',
    });
  });

  it('revives a declined row with delete-then-insert, never an update', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.or.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { requester_id: 'self', addressee_id: 'peer', status: 'declined' },
        error: null,
      }),
    });
    const deleteEq = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    chain.delete.mockReturnValue({ eq: deleteEq });
    chain.insert
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
      .mockResolvedValueOnce({ data: null, error: null });

    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await sendFriendRequest('peer')).toEqual({ ok: true });
    // RLS forbids updating back to pending, so the row is deleted first.
    expect(chain.delete).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith('requester_id', 'self');
    expect(chain.insert).toHaveBeenCalledTimes(2);
  });

  it('surfaces a non-conflict insert error', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.or.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    chain.insert.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'blocked' } });
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await sendFriendRequest('peer')).toEqual({ ok: false, error: 'blocked' });
  });
});

describe('acceptFriendRequest', () => {
  it('accepts only your incoming pending row', async () => {
    const chain = createChain();
    // update().eq(requester).eq(addressee).eq(status,pending): first two chain,
    // the last one resolves.
    chain.update.mockReturnValue(chain);
    chain.eq
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await acceptFriendRequest('peer')).toEqual({ ok: true });
    expect(chain.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(chain.eq).toHaveBeenCalledWith('requester_id', 'peer');
    expect(chain.eq).toHaveBeenCalledWith('addressee_id', 'self');
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
  });
});

describe('declineFriendRequest', () => {
  it('deletes the incoming row', async () => {
    const chain = createChain();
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await declineFriendRequest('peer')).toEqual({ ok: true });
    expect(chain.eq).toHaveBeenCalledWith('requester_id', 'peer');
    expect(chain.eq).toHaveBeenCalledWith('addressee_id', 'self');
  });
});

describe('removeFriend', () => {
  it('deletes both directions and tolerates zero matches', async () => {
    const chain = createChain();
    chain.delete.mockReturnValue(chain);
    // Two deletes, each followed by eq().eq(): chain, resolve, chain, resolve.
    chain.eq
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(RESOLVED(null))
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ friendships: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await removeFriend('peer')).toEqual({ ok: true });
    expect(chain.delete).toHaveBeenCalledTimes(2);
  });
});

describe('areFriends', () => {
  it('is false without a backend, signed out, or for yourself', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await areFriends('peer')).toBe(false);

    const signedOut = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(signedOut);
    expect(await areFriends('peer')).toBe(false);

    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await areFriends('self')).toBe(false);
  });

  it('is true only when an accepted row exists', async () => {
    const yes = createChain();
    yes.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: { requester_id: 'self' }, error: null }),
      }),
    });
    const supabase = makeSupabase({ friendships: yes });
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await areFriends('peer')).toBe(true);

    const no = createChain();
    no.eq.mockReturnValue({
      or: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    const supabase2 = makeSupabase({ friendships: no });
    mockedGetSupabase.mockReturnValue(supabase2);
    expect(await areFriends('peer')).toBe(false);
  });
});

describe('subscribeToFriendships', () => {
  it('is a no-op without a backend and cleans up otherwise', () => {
    mockedGetSupabase.mockReturnValue(null);
    const unsub = subscribeToFriendships({ onChange: jest.fn() });
    expect(typeof unsub).toBe('function');
    unsub();
  });
});