import { getSupabase } from './supabase';

/**
 * Call state and signaling transport.
 *
 * Two channels carry a call, and they are deliberately different things:
 *
 *   * The `calls` ROW is durable state: who called whom, what kind, and how it
 *     ended. It outlives the call as history and as the missed-call source.
 *   * SDP offers/answers and ICE candidates travel over a Realtime BROADCAST
 *     channel `call:<callId>`. They are worthless a second after delivery, so
 *     they are never written to disk. If the other side is not listening when
 *     an offer arrives, the call cannot complete — that is correct, not a bug.
 *
 * v1 is 1:1. The callee is resolved from the direct conversation's membership,
 * never from a client-supplied id.
 */

export type CallKind = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'declined' | 'ended' | 'missed';

export interface CallRow {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  kind: CallKind;
  status: CallStatus;
  /** Durable copy of the offer. Broadcasts race channel joins; the row does not. */
  offerSdp: string | null;
  answerSdp: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

/** Broadcast payloads. `from` is always the session user, asserted on receipt. */
export interface SignalOffer {
  type: 'offer';
  sdp: string;
  from: string;
}

export interface SignalAnswer {
  type: 'answer';
  sdp: string;
  from: string;
}

export interface SignalIce {
  type: 'ice';
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  from: string;
}

export type SignalMessage = SignalOffer | SignalAnswer | SignalIce;

export type StartCallResult =
  | { ok: true; call: CallRow }
  | { ok: false; error: string };

function toCall(row: {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  kind: CallKind;
  status: CallStatus;
  offer_sdp?: string | null;
  answer_sdp?: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}): CallRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    kind: row.kind,
    status: row.status,
    offerSdp: row.offer_sdp ?? null,
    answerSdp: row.answer_sdp ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

const CALL_COLUMNS =
  'id, conversation_id, caller_id, callee_id, kind, status, offer_sdp, answer_sdp, started_at, ended_at, created_at';

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

/**
 * Start a 1:1 call. The callee is the other member of the direct conversation —
 * looked up, never supplied. Group and space conversations are rejected here
 * rather than failing mysteriously in signaling.
 *
 * The offer SDP is written WITH the initial insert, in one write: the callee
 * only ever reads the row after it exists, so the offer cannot be missed the
 * way a broadcast sent before the callee joins the channel can be.
 */
export async function startCall(
  conversationId: string,
  kind: CallKind,
  offerSdp?: string,
): Promise<StartCallResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: 'Not signed in' };
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, type')
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationError) {
    return { ok: false, error: conversationError.message };
  }
  if (!conversation) {
    return { ok: false, error: 'Conversation not found' };
  }
  if ((conversation as { type: string }).type !== 'direct') {
    return { ok: false, error: 'Calls are 1:1 for now. Group calls need an SFU.' };
  }

  const { data: members, error: memberError } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', selfId)
    .limit(2);

  if (memberError) {
    return { ok: false, error: memberError.message };
  }

  const peers = (members ?? []) as Array<{ user_id: string }>;
  if (peers.length !== 1) {
    return { ok: false, error: 'Calls are 1:1 for now. Group calls need an SFU.' };
  }

  const { data, error } = await supabase
    .from('calls')
    .insert({
      conversation_id: conversationId,
      caller_id: selfId,
      callee_id: peers[0].user_id,
      kind,
      status: 'ringing',
      offer_sdp: offerSdp ?? null,
    })
    .select(CALL_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not start the call' };
  }

  return { ok: true, call: toCall(data as Parameters<typeof toCall>[0]) };
}

export async function fetchCall(callId: string): Promise<CallRow | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('calls')
    .select(CALL_COLUMNS)
    .eq('id', callId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      throw new Error(error.message);
    }
    return null;
  }

  return toCall(data as Parameters<typeof toCall>[0]);
}

/** Calls you placed or received, newest first. */
export async function fetchCallHistory(limit: number = 30): Promise<CallRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return [];
  }

  const { data, error } = await supabase
    .from('calls')
    .select(CALL_COLUMNS)
    .or(`caller_id.eq.${selfId},callee_id.eq.${selfId}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Parameters<typeof toCall>[0]>).map(toCall);
}

/** Callee accepts: ringing -> active, clock starts. The answer SDP is stored so
 * a caller that missed the broadcast still connects. */
export async function acceptCall(callId: string, answerSdp?: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: 'Not signed in' };
  }

  const { error } = await supabase
    .from('calls')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      ...(answerSdp ? { answer_sdp: answerSdp } : {}),
    })
    .eq('id', callId)
    .eq('callee_id', selfId)
    .eq('status', 'ringing');

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Callee declines: ringing -> declined. */
export async function declineCall(callId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: 'Not signed in' };
  }

  const { error } = await supabase
    .from('calls')
    .update({ status: 'declined', ended_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('callee_id', selfId)
    .eq('status', 'ringing');

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * End a call from either side. A call that never got answered and is ended by
 * the caller reads as missed for the callee's log; anything else is ended.
 */
export async function endCall(callId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: 'Not signed in' };
  }

  const { data: row, error: readError } = await supabase
    .from('calls')
    .select('caller_id, status')
    .eq('id', callId)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: readError.message };
  }
  if (!row) {
    return { ok: false, error: 'Call not found' };
  }

  const current = row as { caller_id: string; status: CallStatus };
  const missed =
    current.status === 'ringing' && current.caller_id === selfId ? 'missed' : 'ended';

  const { error } = await supabase
    .from('calls')
    .update({ status: missed, ended_at: new Date().toISOString() })
    .eq('id', callId)
    .in('status', ['ringing', 'active']);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Watch one call row for status changes (accept/decline/end from the other
 * side). The filter is on the call id, so no user id ever enters the channel.
 */
export function subscribeToCall(callId: string, handlers: { onChange: () => void }): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`call-state:${callId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Watch for incoming calls: new `calls` rows addressed to you. The filter pins
 * the callee to the session user at subscribe time.
 */
export function subscribeToIncomingCalls(
  selfId: string,
  handlers: { onIncoming: (callId: string) => void },
): () => void {
  const supabase = getSupabase();
  if (!supabase || !selfId) {
    return () => {};
  }

  const channel = supabase
    .channel('calls:incoming')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `callee_id=eq.${selfId}`,
      },
      (payload: { new: { id: string } }) => handlers.onIncoming(payload.new.id),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Join the ephemeral signaling channel for a call. SDP and ICE are broadcast,
 * never stored. `onSignal` receives everything on the channel; the engine
 * discards echoes of its own messages by `from`.
 */
export function joinSignalChannel(
  callId: string,
  handlers: { onSignal: (message: SignalMessage) => void },
): { send: (message: SignalMessage) => void; leave: () => void } {
  const supabase = getSupabase();
  if (!supabase) {
    return { send: () => {}, leave: () => {} };
  }

  const channel = supabase.channel(`call:${callId}`, {
    config: { broadcast: { ack: true } },
  });

  channel.on('broadcast', { event: 'signal' }, (payload: { payload: SignalMessage }) => {
    handlers.onSignal(payload.payload);
  });
  void channel.subscribe();

  return {
    send: (message: SignalMessage) => {
      void channel.send({ type: 'broadcast', event: 'signal', payload: message });
    },
    leave: () => {
      void supabase.removeChannel(channel);
    },
  };
}