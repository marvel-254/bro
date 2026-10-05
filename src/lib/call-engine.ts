import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import type { CallKind } from './calls';

/**
 * WebRTC engine: one peer connection, one call.
 *
 * This file owns everything the radio does and nothing else. It has no React
 * in it, no navigation, no Supabase — the screen drives it through the narrow
 * interface below and carries SDP/ICE to the other side over the broadcast
 * channel from `calls.ts`.
 *
 * Correctness details that are easy to get wrong and are handled here:
 *
 *   * Remote ICE candidates that arrive before the remote description is set
 *     are QUEUED and flushed after setRemoteDescription. Adding them early
 *     throws, and on a fast network the first candidates routinely win the
 *     race against the answer.
 *   * Every track is stopped and the peer connection closed on end(). A leaked
 *     camera or microphone after hangup is a privacy bug, not a resource bug.
 *   * The native layer is injected (RtcDeps) so the state machine is unit
 *     tested with fakes. The real react-native-webrtc objects are only touched
 *     through that seam.
 *
 * Honest limits, stated once here instead of in five places:
 *
 *   * STUN only (Google's public server). Two phones behind symmetric NATs will
 *     not connect without a TURN relay, which needs credentials and is not
 *     configured. That failure surfaces as a timeout, not a crash.
 *   * Speaker routing goes through react-native-incall-manager.
 */

export type EngineState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'failed';

export interface RtcStream {
  toURL(): string;
}

export interface RtcTrack {
  kind: string;
  enabled: boolean;
  stop(): void;
  _switchCamera?(): void;
}

export interface RtcPeerConnectionLike {
  onicecandidate: ((event: { candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null }) => void) | null;
  ontrack: ((event: { streams: RtcStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  connectionState: string;
  createOffer(): Promise<{ sdp?: string; type: string }>;
  createAnswer(): Promise<{ sdp?: string; type: string }>;
  setLocalDescription(desc: unknown): Promise<void>;
  setRemoteDescription(desc: unknown): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  addTrack(track: RtcTrack, stream: RtcStream): unknown;
  close(): void;
}

export interface RtcDeps {
  createPeerConnection(config: { iceServers: Array<{ urls: string }> }): RtcPeerConnectionLike;
  getUserMedia(constraints: { audio: boolean; video: boolean | object }): Promise<RtcStream & { getTracks(): RtcTrack[] }>;
  makeSessionDescription(init: { type: string; sdp: string }): unknown;
  makeIceCandidate(init: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }): unknown;
  audio: {
    start(media: 'video' | 'audio'): void;
    stop(): void;
    setSpeakerphoneOn(enabled: boolean): void;
    setKeepScreenOn(enabled: boolean): void;
  };
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const realDeps: RtcDeps = {
  createPeerConnection: (config) =>
    new RTCPeerConnection(config) as unknown as RtcPeerConnectionLike,
  getUserMedia: (constraints) =>
    mediaDevices.getUserMedia(constraints) as unknown as Promise<
      RtcStream & { getTracks(): RtcTrack[] }
    >,
  makeSessionDescription: (init) => new RTCSessionDescription(init),
  makeIceCandidate: (init) => new RTCIceCandidate(init),
  audio: {
    start: (media: 'video' | 'audio') => InCallManager.start({ media }),
    stop: () => InCallManager.stop(),
    setSpeakerphoneOn: (enabled: boolean) => InCallManager.setSpeakerphoneOn(enabled),
    setKeepScreenOn: (enabled: boolean) => InCallManager.setKeepScreenOn(enabled),
  },
};

export interface EngineEvents {
  onLocalStream(stream: RtcStream): void;
  onRemoteStream(stream: RtcStream): void;
  onLocalIce(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null): void;
  onState(state: EngineState): void;
  onFailure(error: string): void;
}

export class CallEngine {
  private deps: RtcDeps;
  private events: EngineEvents;
  private pc: RtcPeerConnectionLike | null = null;
  private localStream: (RtcStream & { getTracks(): RtcTrack[] }) | null = null;
  private pendingRemoteIce: Array<{ candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }> = [];
  private remoteDescriptionSet = false;
  private ended = false;

  state: EngineState = 'idle';

  constructor(events: EngineEvents, deps: RtcDeps = realDeps) {
    this.events = events;
    this.deps = deps;
  }

  private setState(state: EngineState): void {
    this.state = state;
    this.events.onState(state);
  }

  private fail(error: string): void {
    if (this.ended) return;
    this.setState('failed');
    this.events.onFailure(error);
    this.teardown();
  }

  /**
   * Caller side: capture media, offer, wait for the answer over signaling.
   * Returns the offer SDP to send.
   */
  async startCall(kind: CallKind): Promise<string> {
    this.setState('calling');
    this.deps.audio.start(kind === 'video' ? 'video' : 'audio');
    this.deps.audio.setKeepScreenOn(true);
    // Voice calls start on speaker; video calls use the earpiece path that the
    // OS picks. The toggle in the UI flips this afterwards.
    this.deps.audio.setSpeakerphoneOn(kind === 'voice');

    try {
      this.localStream = await this.deps.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: 'user' } : false,
      });
    } catch {
      this.fail('Could not use the microphone. Check permissions.');
      throw new Error('Could not use the microphone. Check permissions.');
    }
    this.events.onLocalStream(this.localStream);

    this.buildPeerConnection();

    try {
      const offer = await this.pc!.createOffer();
      if (!offer.sdp) {
        throw new Error('Empty offer');
      }
      await this.pc!.setLocalDescription(offer);
      return offer.sdp;
    } catch {
      this.fail('Could not start the call.');
      throw new Error('Could not start the call.');
    }
  }

  /**
   * Callee side: capture media, accept the remote offer, return the answer SDP.
   */
  async answerCall(offerSdp: string, kind: CallKind): Promise<string> {
    this.setState('ringing');
    this.deps.audio.start(kind === 'video' ? 'video' : 'audio');
    this.deps.audio.setKeepScreenOn(true);
    this.deps.audio.setSpeakerphoneOn(kind === 'voice');

    try {
      this.localStream = await this.deps.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: 'user' } : false,
      });
    } catch {
      this.fail('Could not use the microphone. Check permissions.');
      throw new Error('Could not use the microphone. Check permissions.');
    }
    this.events.onLocalStream(this.localStream);

    this.buildPeerConnection();

    try {
      await this.pc!.setRemoteDescription(
        this.deps.makeSessionDescription({ type: 'offer', sdp: offerSdp }),
      );
      this.remoteDescriptionSet = true;
      this.flushPendingIce();
      const answer = await this.pc!.createAnswer();
      if (!answer.sdp) {
        throw new Error('Empty answer');
      }
      await this.pc!.setLocalDescription(answer);
      return answer.sdp;
    } catch {
      this.fail('Could not answer the call.');
      throw new Error('Could not answer the call.');
    }
  }

  /** Caller side: the answer arrived over signaling. */
  async receiveAnswer(answerSdp: string): Promise<void> {
    if (!this.pc || this.ended) return;
    try {
      await this.pc.setRemoteDescription(
        this.deps.makeSessionDescription({ type: 'answer', sdp: answerSdp }),
      );
      this.remoteDescriptionSet = true;
      this.flushPendingIce();
    } catch {
      this.fail('The call dropped while connecting.');
    }
  }

  /** Either side: a remote ICE candidate arrived over signaling. */
  async receiveIce(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null): Promise<void> {
    if (!this.pc || this.ended) return;
    if (!this.remoteDescriptionSet) {
      // Candidates routinely arrive before the answer on fast networks.
      // Adding them early throws, so they wait here.
      this.pendingRemoteIce.push({ candidate, sdpMid, sdpMLineIndex });
      return;
    }
    try {
      await this.pc.addIceCandidate(this.deps.makeIceCandidate({ candidate, sdpMid, sdpMLineIndex }));
    } catch {
      // A single bad candidate must not kill the call; ICE keeps trying.
    }
  }

  private flushPendingIce(): void {
    const queued = this.pendingRemoteIce;
    this.pendingRemoteIce = [];
    for (const init of queued) {
      if (!this.pc || this.ended) return;
      this.pc
        .addIceCandidate(this.deps.makeIceCandidate(init))
        .catch(() => {
          // Same reasoning as above: keep going.
        });
    }
  }

  private buildPeerConnection(): void {
    const pc = this.deps.createPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (this.ended) return;
      if (event.candidate) {
        this.events.onLocalIce(
          event.candidate.candidate,
          event.candidate.sdpMid,
          event.candidate.sdpMLineIndex,
        );
      }
    };

    pc.ontrack = (event) => {
      if (this.ended) return;
      const [stream] = event.streams;
      if (stream) {
        this.events.onRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.ended || !this.pc) return;
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.setState('connected');
      } else if (state === 'failed') {
        this.fail('Connection failed. A relay server may be needed for this network.');
      } else if (state === 'disconnected') {
        this.fail('The call dropped.');
      }
    };
  }

  /**
   * Mute the microphone. Only audio tracks flip — touching video tracks here
   * would blank the camera as a side effect of muting, which is never intended.
   */
  setMuted(muted: boolean): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      if (track.kind === 'audio') {
        track.enabled = !muted;
      }
    }
  }

  setSpeakerphone(enabled: boolean): void {
    this.deps.audio.setSpeakerphoneOn(enabled);
  }

  switchCamera(): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      if (track.kind === 'video') {
        track._switchCamera?.();
      }
    }
  }

  setVideoEnabled(enabled: boolean): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      if (track.kind === 'video') {
        track.enabled = enabled;
      }
    }
  }

  /** Hang up: stop every track, close the connection, release audio. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.setState('ended');
    this.teardown();
  }

  private teardown(): void {
    try {
      if (this.localStream) {
        for (const track of this.localStream.getTracks()) {
          track.stop();
        }
      }
    } catch {
      // Teardown must not throw: it runs on failure paths too.
    }
    try {
      this.pc?.close();
    } catch {
      // Same reasoning.
    }
    this.pc = null;
    this.localStream = null;
    this.pendingRemoteIce = [];
    try {
      this.deps.audio.setKeepScreenOn(false);
      this.deps.audio.stop();
    } catch {
      // Same reasoning.
    }
  }
}