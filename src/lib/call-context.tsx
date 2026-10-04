import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CallEngine, type EngineState, type RtcStream } from './call-engine';
import {
  startCall as startCallRow,
  fetchCall,
  acceptCall as acceptCallRow,
  declineCall as declineCallRow,
  endCall as endCallRow,
  subscribeToCall,
  subscribeToIncomingCalls,
  joinSignalChannel,
  type CallKind,
  type CallRow,
  type SignalMessage,
} from './calls';
import { isSupabaseConfigured } from './supabase';

/**
 * Owns the active call for the whole session.
 *
 * One provider, one call at a time. A second incoming call while busy is
 * declined automatically with a "busy" semantic — the row records declined so
 * the caller sees a clean rejection, not a timeout.
 *
 * The orchestration order matters and is documented once here:
 *
 *   OUTGOING:  engine.startCall -> offer SDP -> row created WITH the offer ->
 *              signal channel joined -> ICE trickles -> row watch for
 *              accept/decline -> 45s unanswered auto-ends as missed.
 *   INCOMING:  row INSERT arrives -> row re-read (offer is already in it, by
 *              construction) -> signal channel joined immediately to catch ICE
 *              -> ringing UI -> on accept, engine.answerCall(offer) -> answer
 *              written to the row AND broadcast.
 *
 * The row is the source of truth for state; broadcasts carry only SDP/ICE.
 * Either side hanging up ends the row, which both sides watch.
 */

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'active';

interface ActiveCall {
  call: CallRow;
  kind: CallKind;
  direction: 'outgoing' | 'incoming';
  peerName: string | null;
}

interface CallContextValue {
  phase: CallPhase;
  activeCall: ActiveCall | null;
  engineState: EngineState;
  localStream: RtcStream | null;
  remoteStream: RtcStream | null;
  muted: boolean;
  speakerOn: boolean;
  callError: string | null;
  start: (conversationId: string, kind: CallKind, peerName?: string | null) => Promise<string | null>;
  accept: () => Promise<string | null>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  flipCamera: () => void;
  dismissError: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCall must be used within CallProvider');
  }
  return ctx;
}

const RING_TIMEOUT_MS = 45_000;

export function CallProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [localStream, setLocalStream] = useState<RtcStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<RtcStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const engineRef = useRef<CallEngine | null>(null);
  const signalRef = useRef<{ send: (message: SignalMessage) => void; leave: () => void } | null>(null);
  const rowUnsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<CallPhase>('idle');
  const callIdRef = useRef<string | null>(null);
  // ICE candidates gathered before the signal channel exists (the caller has
  // no call id until the row is created). Flushed on join, in order.
  const iceOutboxRef = useRef<Array<{ candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }>>([]);

  const setPhaseBoth = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearTimer();
    rowUnsubRef.current?.();
    rowUnsubRef.current = null;
    signalRef.current?.leave();
    signalRef.current = null;
    engineRef.current?.end();
    engineRef.current = null;
    callIdRef.current = null;
    iceOutboxRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setActiveCall(null);
    setEngineState('idle');
    setPhaseBoth('idle');
  }, [clearTimer, setPhaseBoth]);

  const buildEngine = useCallback(() => {
    const engine = new CallEngine({
      onLocalStream: (stream) => setLocalStream(stream),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onLocalIce: (candidate, sdpMid, sdpMLineIndex) => {
        const queued = iceOutboxRef.current;
        const signal = signalRef.current;
        if (signal) {
          signal.send({
            type: 'ice',
            candidate,
            sdpMid,
            sdpMLineIndex,
            from: userId ?? '',
          });
        } else {
          queued.push({ candidate, sdpMid, sdpMLineIndex });
        }
      },
      onState: (state) => setEngineState(state),
      onFailure: (error) => setCallError(error),
    });
    engineRef.current = engine;
    return engine;
  }, [userId]);

  const joinChannel = useCallback(
    (callId: string) => {
      signalRef.current?.leave();
      const signal = joinSignalChannel(callId, {
        onSignal: (message) => {
          if (message.from === userId) return;
          if (message.type === 'answer') {
            void engineRef.current?.receiveAnswer(message.sdp);
          } else if (message.type === 'ice') {
            void engineRef.current?.receiveIce(message.candidate, message.sdpMid, message.sdpMLineIndex);
          }
          // Offers arrive via the row, never the channel — see the header note.
        },
      });
      signalRef.current = signal;

      // Flush candidates gathered before the channel existed, in order.
      const queued = iceOutboxRef.current;
      iceOutboxRef.current = [];
      for (const init of queued) {
        signal.send({ type: 'ice', ...init, from: userId ?? '' });
      }
    },
    [userId],
  );

  const watchRow = useCallback(
    (callId: string, role: 'caller' | 'callee') => {
      rowUnsubRef.current?.();
      rowUnsubRef.current = subscribeToCall(callId, {
        onChange: () => {
          void (async () => {
            const row = await fetchCall(callId).catch(() => null);
            if (!row) return;
            if (phaseRef.current === 'idle') return;

            if (row.status === 'declined' || row.status === 'ended' || row.status === 'missed') {
              teardown();
              return;
            }

            if (row.status === 'active') {
              clearTimer();
              setPhaseBoth('active');
              // Belt and suspenders: the answer normally arrives over broadcast,
              // but if that packet was lost the row copy still connects us.
              if (role === 'caller' && row.answerSdp) {
                await engineRef.current?.receiveAnswer(row.answerSdp);
              }
            }
          })();
        },
      });
    },
    [clearTimer, setPhaseBoth, teardown],
  );

  const start = useCallback(
    async (conversationId: string, kind: CallKind, peerName: string | null = null): Promise<string | null> => {
      if (phaseRef.current !== 'idle') {
        setCallError('Already in a call.');
        return null;
      }
      setCallError(null);

      // One engine per call. The offer is generated first so it can be written
      // WITH the row insert — the callee then always reads a complete row.
      const engine = buildEngine();
      let offer: string;
      try {
        offer = await engine.startCall(kind);
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'Could not start the call.');
        teardown();
        return null;
      }

      const created = await startCallRow(conversationId, kind, offer);
      if (!created.ok) {
        setCallError(created.error);
        teardown();
        return null;
      }

      joinChannel(created.call.id);
      watchRow(created.call.id, 'caller');

      callIdRef.current = created.call.id;
      setActiveCall({ call: created.call, kind, direction: 'outgoing', peerName });
      setSpeakerOn(kind === 'voice');
      setPhaseBoth('outgoing');

      timeoutRef.current = setTimeout(() => {
        void (async () => {
          await endCallRow(created.call.id);
          teardown();
        })();
      }, RING_TIMEOUT_MS);

      return created.call.id;
    },
    [buildEngine, joinChannel, setPhaseBoth, teardown, watchRow],
  );

  const accept = useCallback(async (): Promise<string | null> => {
    const current = activeCall;
    if (!current || phaseRef.current !== 'incoming') return null;

    const offer = current.call.offerSdp;
    if (!offer) {
      setCallError('The call setup did not arrive. Ask them to call again.');
      await declineCallRow(current.call.id);
      teardown();
      return null;
    }

    const engine = buildEngine();
    let answer: string;
    try {
      answer = await engine.answerCall(offer, current.kind);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Could not answer the call.');
      await declineCallRow(current.call.id);
      teardown();
      return null;
    }

    const accepted = await acceptCallRow(current.call.id, answer);
    if (!accepted.ok) {
      setCallError(accepted.error ?? 'Could not answer the call.');
      teardown();
      return null;
    }

    joinChannel(current.call.id);
    watchRow(current.call.id, 'callee');
    setSpeakerOn(current.kind === 'voice');
    setPhaseBoth('active');
    return current.call.id;
  }, [activeCall, buildEngine, joinChannel, setPhaseBoth, teardown, watchRow]);

  const decline = useCallback(async () => {
    const current = activeCall;
    if (!current) {
      teardown();
      return;
    }
    await declineCallRow(current.call.id);
    teardown();
  }, [activeCall, teardown]);

  const hangUp = useCallback(async () => {
    const id = callIdRef.current ?? activeCall?.call.id;
    if (id) {
      await endCallRow(id);
    }
    teardown();
  }, [activeCall, teardown]);

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      engineRef.current?.setMuted(!was);
      return !was;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((was) => {
      engineRef.current?.setSpeakerphone(!was);
      return !was;
    });
  }, []);

  const flipCamera = useCallback(() => {
    engineRef.current?.switchCamera();
  }, []);

  const dismissError = useCallback(() => setCallError(null), []);

  // Incoming calls: a ringing row addressed to us.
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;

    return subscribeToIncomingCalls(userId, {
      onIncoming: (callId) => {
        void (async () => {
          // Busy: decline cleanly so the caller sees a rejection, not silence.
          if (phaseRef.current !== 'idle') {
            await declineCallRow(callId);
            return;
          }

          const row = await fetchCall(callId).catch(() => null);
          if (!row || row.status !== 'ringing') return;

          // Join signaling now so ICE that arrives while the phone rings is
          // not lost. The offer itself comes from the row on accept.
          buildEngine();
          joinChannel(callId);
          watchRow(callId, 'callee');

          callIdRef.current = callId;
          setActiveCall({ call: row, kind: row.kind, direction: 'incoming', peerName: null });
          setPhaseBoth('incoming');
        })();
      },
    });
  }, [userId, buildEngine, joinChannel, setPhaseBoth, watchRow]);

  const value = useMemo<CallContextValue>(
    () => ({
      phase,
      activeCall,
      engineState,
      localStream,
      remoteStream,
      muted,
      speakerOn,
      callError,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleSpeaker,
      flipCamera,
      dismissError,
    }),
    [
      phase,
      activeCall,
      engineState,
      localStream,
      remoteStream,
      muted,
      speakerOn,
      callError,
      start,
      accept,
      decline,
      hangUp,
      toggleMute,
      toggleSpeaker,
      flipCamera,
      dismissError,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}