import {
  LIVE_MIN_MESSAGES,
  LIVE_WINDOW_MINUTES,
  fetchLiveConversations,
  fetchUpcomingPlans,
  subscribeToPulse,
} from '../pulse';
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
  gte: jest.Mock;
  gt: jest.Mock;
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

/** Signed-in supabase whose `from` returns the given chains in call order. */
function makeSequencedSupabase(chains: Chain[], selfId = 'self'): SupabaseClient {
  const supabase = makeSupabase();
  let call = 0;
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain = chains[Math.min(call, chains.length - 1)];
    call += 1;
    return chain;
  });
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: selfId } },
    error: null,
  });
  return supabase;
}

describe('pulse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constants', () => {
    it('uses a 15 minute live window by default', () => {
      expect(LIVE_WINDOW_MINUTES).toBe(15);
    });

    it('requires at least 2 messages to call a conversation live', () => {
      expect(LIVE_MIN_MESSAGES).toBe(2);
    });
  });

  describe('fetchLiveConversations', () => {
    it('returns an empty array when Supabase is not configured', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchLiveConversations()).toEqual([]);
    });

    it('returns an empty array when not signed in', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      expect(await fetchLiveConversations()).toEqual([]);
    });

    it('returns an empty array when the caller is in no conversations', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([]));
      const supabase = makeSequencedSupabase([membershipChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchLiveConversations()).toEqual([]);
    });

    it('throws when the membership query fails', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED(null, { message: 'rls denied' }));
      const supabase = makeSequencedSupabase([membershipChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchLiveConversations()).rejects.toThrow('rls denied');
    });

    it('ignores conversations below the live message threshold', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([{ conversation_id: 'conv-1' }]));

      const messageChain = createChain();
      messageChain.in.mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [{ id: 'm1', conversation_id: 'conv-1', content: 'yo', sender_id: 'peer', created_at: '2026-10-03T12:00:00Z' }],
              error: null,
            }),
          }),
        }),
      });

      const supabase = makeSequencedSupabase([membershipChain, messageChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchLiveConversations()).toEqual([]);
    });

    it("excludes the caller's own messages from the burst count", async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([{ conversation_id: 'conv-1' }]));

      const messageChain = createChain();
      messageChain.in.mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                { id: 'm1', conversation_id: 'conv-1', content: 'mine', sender_id: 'self', created_at: '2026-10-03T12:00:00Z' },
                { id: 'm2', conversation_id: 'conv-1', content: 'mine too', sender_id: 'self', created_at: '2026-10-03T11:59:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      });

      const supabase = makeSequencedSupabase([membershipChain, messageChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchLiveConversations()).toEqual([]);
    });

    it('returns live conversations with peers and the newest preview', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([{ conversation_id: 'conv-1' }]));

      const messageChain = createChain();
      messageChain.in.mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                { id: 'm2', conversation_id: 'conv-1', content: 'newest', sender_id: 'peer', created_at: '2026-10-03T12:00:00Z' },
                { id: 'm1', conversation_id: 'conv-1', content: 'older', sender_id: 'peer', created_at: '2026-10-03T11:59:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      });

      const conversationChain = createChain();
      conversationChain.in.mockReturnValue(
        RESOLVED([{ id: 'conv-1', type: 'group', name: 'The Crew' }]),
      );

      const peerChain = createChain();
      peerChain.in.mockReturnValue({
        neq: jest.fn().mockResolvedValue({
          data: [
            {
              conversation_id: 'conv-1',
              profile: { id: 'peer', display_name: 'Sarah', avatar_url: null },
            },
          ],
          error: null,
        }),
      });

      const supabase = makeSequencedSupabase([
        membershipChain,
        messageChain,
        conversationChain,
        peerChain,
      ]);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchLiveConversations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        conversationId: 'conv-1',
        type: 'group',
        name: 'The Crew',
        messageCount: 2,
        lastMessagePreview: 'newest',
        lastMessageAt: '2026-10-03T12:00:00Z',
      });
      expect(result[0].peers).toHaveLength(1);
      expect(result[0].peers[0].displayName).toBe('Sarah');
    });

    it('still returns live conversations when the peer lookup fails', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([{ conversation_id: 'conv-1' }]));

      const messageChain = createChain();
      messageChain.in.mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                { id: 'm2', conversation_id: 'conv-1', content: 'a', sender_id: 'peer', created_at: '2026-10-03T12:00:00Z' },
                { id: 'm1', conversation_id: 'conv-1', content: 'b', sender_id: 'peer', created_at: '2026-10-03T11:59:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      });

      const conversationChain = createChain();
      conversationChain.in.mockReturnValue(
        RESOLVED([{ id: 'conv-1', type: 'direct', name: null }]),
      );

      const peerChain = createChain();
      peerChain.in.mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: { message: 'peer boom' } }),
      });

      const supabase = makeSequencedSupabase([
        membershipChain,
        messageChain,
        conversationChain,
        peerChain,
      ]);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchLiveConversations();
      expect(result).toHaveLength(1);
      expect(result[0].peers).toEqual([]);
    });

    it('throws when the message query fails', async () => {
      const membershipChain = createChain();
      membershipChain.eq.mockReturnValue(RESOLVED([{ conversation_id: 'conv-1' }]));

      const messageChain = createChain();
      messageChain.in.mockReturnValue({
        gte: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'msg boom' } }),
          }),
        }),
      });

      const supabase = makeSequencedSupabase([membershipChain, messageChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchLiveConversations()).rejects.toThrow('msg boom');
    });
  });

  describe('fetchUpcomingPlans', () => {
    it('returns an empty array when Supabase is not configured', async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchUpcomingPlans()).toEqual([]);
    });

    it('returns an empty array when nobody has posted a plan', async () => {
      const planChain = createChain();
      planChain.gt.mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });
      const supabase = makeSequencedSupabase([planChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchUpcomingPlans()).toEqual([]);
    });

    it('throws when the plans query fails', async () => {
      const planChain = createChain();
      planChain.gt.mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'plan boom' } }),
        }),
      });
      const supabase = makeSequencedSupabase([planChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchUpcomingPlans()).rejects.toThrow('plan boom');
    });

    it('tallies going responses and sorts by start time', async () => {
      const planChain = createChain();
      planChain.gt.mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'plan-late',
                creator_id: 'user-1',
                title: 'Late thing',
                kind: 'event',
                starts_at: '2026-10-04T18:00:00Z',
                location: null,
                expires_at: '2026-10-05T00:00:00Z',
                created_at: '2026-10-03T10:00:00Z',
              },
              {
                id: 'plan-soon',
                creator_id: 'user-2',
                title: 'Tacos at 7',
                kind: 'meal',
                starts_at: '2026-10-03T19:00:00Z',
                location: 'Kilimani',
                expires_at: '2026-10-03T23:00:00Z',
                created_at: '2026-10-03T11:00:00Z',
              },
            ],
            error: null,
          }),
        }),
      });

      const responseChain = createChain();
      responseChain.in.mockReturnValue(
        RESOLVED([
          { plan_id: 'plan-soon', response: 'going' },
          { plan_id: 'plan-soon', response: 'going' },
          { plan_id: 'plan-soon', response: 'maybe' },
          { plan_id: 'plan-late', response: 'cant' },
        ]),
      );

      const creatorChain = createChain();
      creatorChain.in.mockReturnValue(
        RESOLVED([
          { id: 'user-1', display_name: 'Nia' },
          { id: 'user-2', display_name: 'Tariq' },
        ]),
      );

      const supabase = makeSequencedSupabase([planChain, responseChain, creatorChain]);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchUpcomingPlans();

      // Sorted soonest-first, so the 19:00 meal leads even though it was posted later.
      expect(result.map((plan) => plan.id)).toEqual(['plan-soon', 'plan-late']);
      expect(result[0]).toMatchObject({
        title: 'Tacos at 7',
        creatorName: 'Tariq',
        location: 'Kilimani',
        responseCount: 3,
        goingCount: 2,
      });
      expect(result[1]).toMatchObject({ responseCount: 1, goingCount: 0 });
    });
  });

  describe('subscribeToPulse', () => {
    it('returns a no-op when Supabase is not configured', () => {
      mockedGetSupabase.mockReturnValue(null);
      const unsub = subscribeToPulse({ onChange: jest.fn() });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('watches messages, plans, and plan responses', () => {
      const channel = createChannel();
      const supabase = makeSupabase();
      (supabase.channel as jest.Mock).mockReturnValue(channel);
      mockedGetSupabase.mockReturnValue(supabase);

      const onChange = jest.fn();
      const unsub = subscribeToPulse({ onChange });

      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      expect(channel.on).toHaveBeenCalledTimes(3);

      unsub();
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });
});