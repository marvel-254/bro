import { getSupabase } from "./supabase";

/**
 * Plans — lightweight "tacos at 7?" proposals that Pulse's Tap-in strip reads.
 *
 * Plans are visible to every signed-in user (the `plans_select` policy), which
 * is why Pulse can show them without a membership check. Responses are one per
 * (plan, user) pair; answering twice replaces the first answer rather than
 * stacking a second row.
 */

export type PlanKind = "football" | "outing" | "meal" | "event" | "other";
export type PlanResponse = "going" | "maybe" | "cant";

export const PLAN_TITLE_MAX = 120;
export const PLAN_LOCATION_MAX = 120;

export interface PlanInput {
  title: string;
  kind?: PlanKind | null;
  startsAt: string;
  location?: string | null;
}

export interface PlanSummary {
  id: string;
  creatorId: string;
  creatorName: string | null;
  title: string;
  kind: PlanKind | null;
  startsAt: string;
  location: string | null;
  expiresAt: string | null;
  goingCount: number;
  maybeCount: number;
  cantCount: number;
  myResponse: PlanResponse | null;
}

export type CreatePlanResult =
  | { ok: true; planId: string }
  | { ok: false; error: string };

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

/** A plan must start in the future. Minutes of tolerance for clock skew. */
export function isFutureStart(iso: string, now: number = Date.now()): boolean {
  const starts = Date.parse(iso);
  return Number.isFinite(starts) && starts > now - 60_000;
}

export async function createPlan(input: PlanInput): Promise<CreatePlanResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Say what the plan is" };
  }
  if (title.length > PLAN_TITLE_MAX) {
    return { ok: false, error: `Keep it under ${PLAN_TITLE_MAX} characters` };
  }

  const location = input.location?.trim() || null;
  if (location && location.length > PLAN_LOCATION_MAX) {
    return {
      ok: false,
      error: `Keep the place under ${PLAN_LOCATION_MAX} characters`,
    };
  }

  if (!isFutureStart(input.startsAt)) {
    return { ok: false, error: "Pick a time in the future" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({
      creator_id: selfId,
      title,
      kind: input.kind ?? "other",
      starts_at: input.startsAt,
      location,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not make the plan" };
  }

  return { ok: true, planId: (data as { id: string }).id };
}

/**
 * Your answer to a plan. Upserted, so changing your mind replaces the old row
 * rather than adding a second one. RLS compares user_id to auth.uid(), so only
 * your own row is ever written.
 */
export async function respondToPlan(
  planId: string,
  response: PlanResponse,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { error } = await supabase
    .from("plan_responses")
    .upsert(
      { plan_id: planId, user_id: selfId, response },
      { onConflict: "plan_id,user_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Withdraw your answer entirely. */
export async function withdrawPlanResponse(
  planId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { error } = await supabase
    .from("plan_responses")
    .delete()
    .eq("plan_id", planId)
    .eq("user_id", selfId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Open plans with tallies and your own answer attached. Soonest start first,
 * because that is the order a human deciding what to do needs.
 */
export async function fetchPlans(limit: number = 20): Promise<PlanSummary[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();

  const { data, error } = await supabase
    .from("plans")
    .select("id, creator_id, title, kind, starts_at, location, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const plans = (data ?? []) as Array<{
    id: string;
    creator_id: string;
    title: string;
    kind: PlanKind | null;
    starts_at: string;
    location: string | null;
    expires_at: string | null;
  }>;

  if (plans.length === 0) {
    return [];
  }

  const ids = plans.map((plan) => plan.id);

  const { data: responseRows } = await supabase
    .from("plan_responses")
    .select("plan_id, user_id, response")
    .in("plan_id", ids);

  const tally = new Map<
    string,
    { going: number; maybe: number; cant: number; mine: PlanResponse | null }
  >();
  for (const row of (responseRows ?? []) as Array<{
    plan_id: string;
    user_id: string;
    response: PlanResponse;
  }>) {
    const entry = tally.get(row.plan_id) ?? {
      going: 0,
      maybe: 0,
      cant: 0,
      mine: null,
    };
    if (row.response === "going") entry.going += 1;
    else if (row.response === "maybe") entry.maybe += 1;
    else entry.cant += 1;
    if (selfId && row.user_id === selfId) {
      entry.mine = row.response;
    }
    tally.set(row.plan_id, entry);
  }

  const creatorIds = [...new Set(plans.map((plan) => plan.creator_id))];
  const { data: creatorRows } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", creatorIds);

  const nameById = new Map<string, string>();
  for (const row of (creatorRows ?? []) as Array<{
    id: string;
    display_name: string;
  }>) {
    nameById.set(row.id, row.display_name);
  }

  return plans.map((plan) => {
    const counts = tally.get(plan.id) ?? {
      going: 0,
      maybe: 0,
      cant: 0,
      mine: null,
    };
    return {
      id: plan.id,
      creatorId: plan.creator_id,
      creatorName: nameById.get(plan.creator_id) ?? null,
      title: plan.title,
      kind: plan.kind,
      startsAt: plan.starts_at,
      location: plan.location,
      expiresAt: plan.expires_at,
      goingCount: counts.going,
      maybeCount: counts.maybe,
      cantCount: counts.cant,
      myResponse: counts.mine,
    };
  });
}
