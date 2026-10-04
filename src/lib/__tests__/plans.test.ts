import {
  PLAN_TITLE_MAX,
  PLAN_LOCATION_MAX,
  isFutureStart,
  createPlan,
  respondToPlan,
  withdrawPlanResponse,
  fetchPlans,
} from '../plans';
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
  };
  return client as unknown as SupabaseClient;
}

const RESOLVED = (data: unknown, error: unknown = null) => Promise.resolve({ data, error });
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isFutureStart', () => {
  it('accepts a future time', () => {
    expect(isFutureStart(new Date(Date.now() + 3_600_000).toISOString())).toBe(true);
  });

  it('rejects the past', () => {
    expect(isFutureStart(new Date(Date.now() - 3_600_000).toISOString())).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isFutureStart('not a date')).toBe(false);
  });
});

describe('createPlan', () => {
  it('reports the backend is missing', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createPlan({ title: 'Tacos', startsAt: FUTURE })).toEqual({
      ok: false,
      error: 'Backend not configured',
    });
  });

  it('rejects a blank title', async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await createPlan({ title: '   ', startsAt: FUTURE })).toEqual({
      ok: false,
      error: 'Say what the plan is',
    });
  });

  it('rejects an over-long title', async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createPlan({ title: 'x'.repeat(PLAN_TITLE_MAX + 1), startsAt: FUTURE });
    expect(result.ok).toBe(false);
  });

  it('rejects an over-long location', async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createPlan({
      title: 'Tacos',
      startsAt: FUTURE,
      location: 'y'.repeat(PLAN_LOCATION_MAX + 1),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a start time in the past', async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await createPlan({
      title: 'Tacos',
      startsAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(result).toEqual({ ok: false, error: 'Pick a time in the future' });
  });

  it('reports not signed in', async () => {
    const supabase = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await createPlan({ title: 'Tacos', startsAt: FUTURE })).toEqual({
      ok: false,
      error: 'Not signed in',
    });
  });

  it('inserts with the session user as creator', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { id: 'plan-1' }, error: null });
    const supabase = makeSupabase({ plans: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createPlan({
      title: '  Tacos at 7?  ',
      kind: 'meal',
      startsAt: FUTURE,
      location: 'Kilimani',
    });

    expect(result).toEqual({ ok: true, planId: 'plan-1' });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: 'self',
        title: 'Tacos at 7?',
        kind: 'meal',
        location: 'Kilimani',
      }),
    );
  });

  it('defaults the kind and drops a blank location', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { id: 'plan-1' }, error: null });
    const supabase = makeSupabase({ plans: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await createPlan({ title: 'Run', startsAt: FUTURE, location: '   ' });
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'other', location: null }),
    );
  });

  it('surfaces an insert failure', async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: null, error: { message: 'insert boom' } });
    const supabase = makeSupabase({ plans: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await createPlan({ title: 'Tacos', startsAt: FUTURE })).toEqual({
      ok: false,
      error: 'insert boom',
    });
  });
});

describe('respondToPlan', () => {
  it('upserts keyed on plan and user, so changing your mind replaces', async () => {
    const chain = createChain();
    chain.upsert.mockResolvedValue({ data: null, error: null });
    const supabase = makeSupabase({ plan_responses: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await respondToPlan('plan-1', 'going')).toEqual({ ok: true });
    expect(chain.upsert).toHaveBeenCalledWith(
      { plan_id: 'plan-1', user_id: 'self', response: 'going' },
      { onConflict: 'plan_id,user_id' },
    );
  });

  it('reports the backend is missing and sign-out', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await respondToPlan('plan-1', 'going')).toEqual({
      ok: false,
      error: 'Backend not configured',
    });

    const supabase = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await respondToPlan('plan-1', 'going')).toEqual({
      ok: false,
      error: 'Not signed in',
    });
  });
});

describe('withdrawPlanResponse', () => {
  it('deletes only your own row', async () => {
    const chain = createChain();
    // delete().eq('plan_id').eq('user_id') — the first eq chains, the second
    // resolves, so they need different return values in call order.
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(RESOLVED(null));
    const supabase = makeSupabase({ plan_responses: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await withdrawPlanResponse('plan-1')).toEqual({ ok: true });
    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'plan-1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'self');
  });
});

describe('fetchPlans', () => {
  it('returns an empty array without a backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchPlans()).toEqual([]);
  });

  it('returns an empty array when nothing is open', async () => {
    const chain = createChain();
    chain.gt.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const supabase = makeSupabase({ plans: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchPlans()).toEqual([]);
  });

  it('tallies every answer and attaches your own', async () => {
    const planChain = createChain();
    planChain.gt.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'p1',
              creator_id: 'u1',
              title: 'Tacos',
              kind: 'meal',
              starts_at: FUTURE,
              location: null,
              expires_at: FUTURE,
            },
          ],
          error: null,
        }),
      }),
    });

    const responseChain = createChain();
    responseChain.in.mockReturnValue(
      RESOLVED([
        { plan_id: 'p1', user_id: 'self', response: 'going' },
        { plan_id: 'p1', user_id: 'u2', response: 'maybe' },
        { plan_id: 'p1', user_id: 'u3', response: 'cant' },
      ]),
    );

    const profileChain = createChain();
    profileChain.in.mockReturnValue(RESOLVED([{ id: 'u1', display_name: 'Nia' }]));

    const supabase = makeSupabase({
      plans: planChain,
      plan_responses: responseChain,
      profiles: profileChain,
    });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchPlans();

    expect(result[0]).toMatchObject({
      id: 'p1',
      creatorName: 'Nia',
      goingCount: 1,
      maybeCount: 1,
      cantCount: 1,
      myResponse: 'going',
    });
  });

  it('throws when the plans query fails', async () => {
    const chain = createChain();
    chain.gt.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'plans boom' } }),
      }),
    });
    const supabase = makeSupabase({ plans: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchPlans()).rejects.toThrow('plans boom');
  });
});