import {
  startCall,
  fetchCall,
  fetchCallHistory,
  acceptCall,
  declineCall,
  endCall,
  subscribeToCall,
  subscribeToIncomingCalls,
  joinSignalChannel,
} from '../calls';
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
    send: jest.fn(() => Promise.resolve()),
  };
  return channel;
}

const RESOLVED = (data: unknown, error: unknown = null) => Promise.resolve({ data, error });

const RAW_CALL = {
  id: 'call-1',
  conversation_id: 'c1',
  caller_id: 'self',
  callee_id: 'peer',
  kind: 'voice',
  status: 'ringing',
  started_at: null,
  ended_at: null,
  created_at: '2026-10-04T12:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('startCall', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await startCall('c1', 'voice')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('reports sign-out', async () => {
    const supabase = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await startCall('c1', 'voice')).toEqual({ ok: false, error: 'Not signed in' });
  });

  it('refuses non-direct conversations', async () => {
    const convChain = createChain();
    convChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'c1', type: 'group' },
        error: null,
      }),
    });
    const supabase = makeSupabase({ conversations: convChain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await startCall('c1', 'voice')).toEqual({
      ok: false,
      error: 'Calls are 1:1 for now. Group calls need an SFU.',
    });
  });

  it('refuses when the peer count is not exactly one', async () => {
    const convChain = createChain();
    convChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'c1', type: 'direct' },
        error: null,
      }),
    });

    const memberChain = createChain();
    memberChain.eq.mockReturnValue({
      neq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const supabase = makeSupabase({ conversations: convChain, conversation_members: memberChain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await startCall('c1', 'voice');
    expect(result.ok).toBe(false);
  });

  it('creates a ringing call addressed to the looked-up peer, never a supplied id', async () => {
    const convChain = createChain();
    convChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'c1', type: 'direct' },
        error: null,
      }),
    });

    const memberChain = createChain();
    memberChain.eq.mockReturnValue({
      neq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ user_id: 'peer' }], error: null }),
      }),
    });

    const callChain = createChain();
    callChain.select.mockReturnValue(callChain);
    callChain.single.mockResolvedValue({ data: RAW_CALL, error: null });

    const supabase = makeSupabase({
      conversations: convChain,
      conversation_members: memberChain,
      calls: callChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await startCall('c1', 'video');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.call).toMatchObject({
        id: 'call-1',
        callerId: 'self',
        calleeId: 'peer',
        kind: 'voice',
        status: 'ringing',
      });
    }
    expect(callChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'c1',
        caller_id: 'self',
        callee_id: 'peer',
        kind: 'video',
        status: 'ringing',
      }),
    );
  });

  it('writes the offer SDP with the initial insert so the callee cannot miss it', async () => {
    const convChain = createChain();
    convChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'c1', type: 'direct' },
        error: null,
      }),
    });

    const memberChain = createChain();
    memberChain.eq.mockReturnValue({
      neq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ user_id: 'peer' }], error: null }),
      }),
    });

    const callChain = createChain();
    callChain.select.mockReturnValue(callChain);
    callChain.single.mockResolvedValue({ data: RAW_CALL, error: null });

    const supabase = makeSupabase({
      conversations: convChain,
      conversation_members: memberChain,
      calls: callChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await startCall('c1', 'voice', 'offer-sdp-123');

    expect(callChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ offer_sdp: 'offer-sdp-123' }),
    );
  });

  it('surfaces an insert failure', async () => {
    const convChain = createChain();
    convChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'c1', type: 'direct' },
        error: null,
      }),
    });

    const memberChain = createChain();
    memberChain.eq.mockReturnValue({
      neq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ user_id: 'peer' }], error: null }),
      }),
    });

    const callChain = createChain();
    callChain.select.mockReturnValue(callChain);
    callChain.single.mockResolvedValue({ data: null, error: { message: 'insert boom' } });

    const supabase = makeSupabase({
      conversations: convChain,
      conversation_members: memberChain,
      calls: callChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await startCall('c1', 'voice')).toEqual({ ok: false, error: 'insert boom' });
  });
});

describe('fetchCall', () => {
  it('returns null without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchCall('call-1')).toBeNull();
  });

  it('maps a visible row and nulls an invisible one', async () => {
    const yes = createChain();
    yes.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: RAW_CALL, error: null }),
    });
    const supabase = makeSupabase({ calls: yes });
    mockedGetSupabase.mockReturnValue(supabase);
    expect((await fetchCall('call-1'))?.id).toBe('call-1');

    const no = createChain();
    no.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const supabase2 = makeSupabase({ calls: no });
    mockedGetSupabase.mockReturnValue(supabase2);
    expect(await fetchCall('call-1')).toBeNull();
  });
});

describe('fetchCallHistory', () => {
  it('scopes to rows where you are either party', async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [RAW_CALL], error: null }),
      }),
    });
    const supabase = makeSupabase({ calls: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchCallHistory();
    expect(result).toHaveLength(1);
    expect(chain.or).toHaveBeenCalledWith('caller_id.eq.self,callee_id.eq.self');
  });
});

describe('acceptCall', () => {
  it('accepts only your incoming ringing row', async () => {
    const chain = createChain();
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(chain).mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ calls: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await acceptCall('call-1')).toEqual({ ok: true });
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', started_at: expect.any(String) }),
    );
    expect(chain.eq).toHaveBeenCalledWith('callee_id', 'self');
    expect(chain.eq).toHaveBeenCalledWith('status', 'ringing');
  });

  it('stores the answer SDP so a caller that missed the broadcast still connects', async () => {
    const chain = createChain();
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    const supabase = makeSupabase({ calls: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await acceptCall('call-1', 'answer-sdp-456');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ answer_sdp: 'answer-sdp-456' }),
    );
  });
});

describe('declineCall', () => {
  it('declines only your incoming ringing row', async () => {
    const chain = createChain();
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(chain).mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ calls: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await declineCall('call-1')).toEqual({ ok: true });
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'declined', ended_at: expect.any(String) }),
    );
  });
});

describe('endCall', () => {
  it('marks a caller-cancelled ringing call as missed', async () => {
    const readChain = createChain();
    readChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { caller_id: 'self', status: 'ringing' },
        error: null,
      }),
    });

    const writeChain = createChain();
    writeChain.update.mockReturnValue(writeChain);
    writeChain.eq.mockReturnValue(writeChain);
    // update().eq('id').in('status', [...]) — in() is the terminal here.
    writeChain.in.mockReturnValue(RESOLVED(null));

    const supabase = makeSupabase({ calls: readChain });
    mockedGetSupabase.mockReturnValue(supabase);

    // Deterministic wiring: read first, then write.
    let call = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      call += 1;
      return call === 1 ? readChain : writeChain;
    });

    const result = await endCall('call-1');
    expect(result).toEqual({ ok: true });
    expect(writeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'missed' }),
    );
  });

  it('marks an answered call as ended no matter who hangs up', async () => {
    const readChain = createChain();
    readChain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: { caller_id: 'peer', status: 'active' },
        error: null,
      }),
    });

    const writeChain = createChain();
    writeChain.update.mockReturnValue(writeChain);
    writeChain.eq.mockReturnValue(writeChain);
    writeChain.in.mockReturnValue(RESOLVED(null));

    const supabase = makeSupabase();
    let call = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      call += 1;
      return call === 1 ? readChain : writeChain;
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await endCall('call-1')).toEqual({ ok: true });
    expect(writeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ended' }),
    );
  });

  it('reports a missing call', async () => {
    const chain = createChain();
    chain.eq.mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const supabase = makeSupabase({ calls: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await endCall('nope')).toEqual({ ok: false, error: 'Call not found' });
  });
});

describe('subscriptions', () => {
  it('are no-ops without a backend', () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(typeof subscribeToCall('c', { onChange: jest.fn() })).toBe('function');
    expect(typeof subscribeToIncomingCalls('self', { onIncoming: jest.fn() })).toBe('function');
  });

  it('incoming-call filter pins the callee', () => {
    const channel = createChannel();
    const supabase = makeSupabase();
    (supabase.channel as jest.Mock).mockReturnValue(channel);
    mockedGetSupabase.mockReturnValue(supabase);

    const unsub = subscribeToIncomingCalls('self', { onIncoming: jest.fn() });

    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ filter: 'callee_id=eq.self' }),
      expect.any(Function),
    );
    unsub();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('signal channel sends broadcasts and leaves cleanly', () => {
    const channel = createChannel();
    const supabase = makeSupabase();
    (supabase.channel as jest.Mock).mockReturnValue(channel);
    mockedGetSupabase.mockReturnValue(supabase);

    const seen: unknown[] = [];
    const handle = joinSignalChannel('call-1', {
      onSignal: (message) => {
        seen.push(message);
      },
    });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    handle.send({ type: 'offer', sdp: 'sdp', from: 'self' });
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'signal',
      payload: { type: 'offer', sdp: 'sdp', from: 'self' },
    });
    handle.leave();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);

    // The receive path dispatches through the registered broadcast handler.
    const onCall = channel.on.mock.calls.find((call) => call[0] === 'broadcast');
    expect(onCall).toBeDefined();
    expect(seen).toEqual([]);
  });
});