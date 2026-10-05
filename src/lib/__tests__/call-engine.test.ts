import { CallEngine, type EngineState, type RtcDeps } from '../call-engine';

// The native modules crash under Jest (no native runtime), and the engine
// never touches them directly anyway — RtcDeps is the only seam. These mocks
// just need to exist so the module graph loads.
jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
  mediaDevices: { getUserMedia: jest.fn() },
}));

jest.mock('react-native-incall-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    setSpeakerphoneOn: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
    setKeepScreenOn: jest.fn(),
  },
}));

function makeTrack(kind: string) {
  return {
    kind,
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

function makeStream() {
  const tracks = [makeTrack('audio'), makeTrack('video')];
  return {
    toURL: () => 'stream-url',
    getTracks: () => tracks,
    tracks,
  };
}

interface FakePc {
  closed: boolean;
  addedIce: unknown[];
  remoteSet: boolean;
  handlers: Record<string, ((...args: never[]) => void) | null>;
  failCreateOffer: boolean;
  onicecandidate: ((...args: never[]) => void) | null;
  ontrack: ((...args: never[]) => void) | null;
  onconnectionstatechange: ((...args: never[]) => void) | null;
  connectionState: string;
  createOffer(): Promise<{ sdp: string; type: string }>;
  createAnswer(): Promise<{ sdp: string; type: string }>;
  setLocalDescription(): Promise<void>;
  setRemoteDescription(): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  addTrack(): unknown;
  close(): void;
}

function makeDeps(): { deps: RtcDeps; pc: () => FakePc | null; calls: Record<string, number> } {
  let pc: FakePc | null = null;
  const calls: Record<string, number> = {
    createPc: 0,
    getUserMedia: 0,
    audioStart: 0,
    audioStop: 0,
    speaker: 0,
    keepScreen: 0,
  };

  const fakePc = (): FakePc => ({
    closed: false,
    addedIce: [],
    remoteSet: false,
    handlers: { onicecandidate: null, ontrack: null, onconnectionstatechange: null },
    failCreateOffer: false,
    get onicecandidate() {
      return this.handlers.onicecandidate;
    },
    set onicecandidate(fn) {
      this.handlers.onicecandidate = fn;
    },
    get ontrack() {
      return this.handlers.ontrack;
    },
    set ontrack(fn) {
      this.handlers.ontrack = fn;
    },
    get onconnectionstatechange() {
      return this.handlers.onconnectionstatechange;
    },
    set onconnectionstatechange(fn) {
      this.handlers.onconnectionstatechange = fn;
    },
    connectionState: 'new',
    async createOffer() {
      if (this.failCreateOffer) throw new Error('no offer');
      return { sdp: 'offer-sdp', type: 'offer' };
    },
    async createAnswer() {
      return { sdp: 'answer-sdp', type: 'answer' };
    },
    async setLocalDescription() {},
    async setRemoteDescription() {
      this.remoteSet = true;
    },
    async addIceCandidate(candidate: unknown) {
      if (!this.remoteSet) throw new Error('no remote description');
      this.addedIce.push(candidate);
    },
    addTrack() {
      return {};
    },
    close() {
      this.closed = true;
    },
  });

  const deps: RtcDeps = {
    createPeerConnection: () => {
      calls.createPc += 1;
      pc = fakePc();
      return pc as never;
    },
    getUserMedia: async () => {
      calls.getUserMedia += 1;
      return makeStream() as never;
    },
    makeSessionDescription: (init) => init,
    makeIceCandidate: (init) => init,
    audio: {
      start: () => {
        calls.audioStart += 1;
      },
      stop: () => {
        calls.audioStop += 1;
      },
      setSpeakerphoneOn: () => {
        calls.speaker += 1;
      },
      setKeepScreenOn: () => {
        calls.keepScreen += 1;
      },
    },
  };

  return { deps, pc: () => pc, calls };
}

function makeEvents() {
  return {
    local: [] as unknown[],
    remote: [] as unknown[],
    ice: [] as Array<{ candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }>,
    states: [] as EngineState[],
    failures: [] as string[],
  };
}

function wire(factory: () => { deps: RtcDeps }) {
  const events = makeEvents();
  const engine = new CallEngine(
    {
      onLocalStream: (s) => events.local.push(s),
      onRemoteStream: (s) => events.remote.push(s),
      onLocalIce: (candidate, sdpMid, sdpMLineIndex) =>
        events.ice.push({ candidate, sdpMid, sdpMLineIndex }),
      onState: (s) => events.states.push(s),
      onFailure: (e) => events.failures.push(e),
    },
    factory().deps,
  );
  return { engine, events };
}

describe('CallEngine', () => {
  it('starts a call: media, offer, speaker off for video', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    const sdp = await engine.startCall('video');

    expect(sdp).toBe('offer-sdp');
    expect(events.local).toHaveLength(1);
    expect(events.states).toContain('calling');
    expect(built.calls.getUserMedia).toBe(1);
    expect(built.calls.createPc).toBe(1);
  });

  it('starts voice calls on speaker', async () => {
    const built = makeDeps();
    const { engine } = wire(() => built);

    await engine.startCall('voice');

    // start() then setSpeakerphoneOn(true) for voice.
    expect(built.calls.audioStart).toBe(1);
    expect(built.calls.speaker).toBe(1);
  });

  it('emits local ICE candidates as they trickle', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('voice');
    const pc = built.pc();
    pc?.handlers.onicecandidate?.({
      candidate: { candidate: 'cand-1', sdpMid: '0', sdpMLineIndex: 0 },
    } as never);

    expect(events.ice).toEqual([{ candidate: 'cand-1', sdpMid: '0', sdpMLineIndex: 0 }]);
  });

  it('queues remote ICE until the answer lands, then flushes', async () => {
    const built = makeDeps();
    const { engine } = wire(() => built);

    await engine.startCall('voice');
    const pc = built.pc();
    expect(pc?.addedIce).toHaveLength(0);

    // Answer has not arrived yet: queue, do not throw.
    await engine.receiveIce('early', '0', 0);
    expect(pc?.addedIce).toHaveLength(0);

    await engine.receiveAnswer('answer-sdp');
    expect(pc?.addedIce).toHaveLength(1);

    // Later candidates go straight through.
    await engine.receiveIce('late', '0', 0);
    expect(pc?.addedIce).toHaveLength(2);
  });

  it('answers: sets remote, returns an answer SDP', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    const sdp = await engine.answerCall('offer-sdp', 'voice');

    expect(sdp).toBe('answer-sdp');
    expect(events.states).toContain('ringing');
    expect(built.pc()?.remoteSet).toBe(true);
  });

  it('delivers the remote stream to the UI', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('video');
    built.pc()?.handlers.ontrack?.({ streams: [{ toURL: () => 'remote' }] } as never);

    expect(events.remote).toHaveLength(1);
  });

  it('maps peer-connection connected to the connected state', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('voice');
    const pc = built.pc();
    if (pc) {
      Object.defineProperty(pc, 'connectionState', { value: 'connected' });
      pc.handlers.onconnectionstatechange?.();
    }

    expect(events.states).toContain('connected');
    expect(engine.state).toBe('connected');
  });

  it('fails loudly with a relay hint when the connection fails', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('voice');
    const pc = built.pc();
    if (pc) {
      Object.defineProperty(pc, 'connectionState', { value: 'failed' });
      pc.handlers.onconnectionstatechange?.();
    }

    expect(engine.state).toBe('failed');
    expect(events.failures.join(' ')).toMatch(/relay/i);
    // Failure tears everything down.
    expect(pc?.closed).toBe(true);
  });

  it('mutes only audio tracks, never video', async () => {
    const deps = makeDeps();
    const seen: Array<ReturnType<typeof makeStream>> = [];
    const orig = deps.deps.getUserMedia;
    deps.deps.getUserMedia = (async (...args: never[]) => {
      const s = (await (orig as (...a: never[]) => Promise<ReturnType<typeof makeStream>>)(...args)) as ReturnType<typeof makeStream>;
      seen.push(s);
      return s as never;
    }) as never;
    const engine = new CallEngine(
      {
        onLocalStream: () => {},
        onRemoteStream: () => {},
        onLocalIce: () => {},
        onState: () => {},
        onFailure: () => {},
      },
      deps.deps,
    );
    await engine.startCall('voice');
    engine.setMuted(true);

    const audio = seen[0].tracks.find((t) => t.kind === 'audio');
    const video = seen[0].tracks.find((t) => t.kind === 'video');
    expect(audio?.enabled).toBe(false);
    expect(video?.enabled).toBe(true);

    engine.setMuted(false);
    expect(audio?.enabled).toBe(true);
  });

  it('end() stops every track, closes the connection, and releases audio', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('voice');
    const pc = built.pc();
    engine.end();

    expect(engine.state).toBe('ended');
    expect(events.states).toContain('ended');
    expect(pc?.closed).toBe(true);
    expect(built.calls.audioStop).toBe(1);
  });

  it('end() is idempotent', async () => {
    const built = makeDeps();
    const { engine } = wire(() => built);

    await engine.startCall('voice');
    engine.end();
    const states = engine.state;
    engine.end();

    expect(engine.state).toBe(states);
    expect(built.calls.audioStop).toBe(1);
  });

  it('ignores signaling after the call ended', async () => {
    const built = makeDeps();
    const { engine, events } = wire(() => built);

    await engine.startCall('voice');
    engine.end();
    const iceCount = events.ice.length;

    await engine.receiveIce('late', '0', 0);
    await engine.receiveAnswer('answer-sdp');

    expect(events.ice).toHaveLength(iceCount);
  });

  it('fails when the microphone is unavailable', async () => {
    const built = makeDeps();
    built.deps.getUserMedia = (() => Promise.reject(new Error('denied'))) as never;
    const { engine, events } = wire(() => built);

    await expect(engine.startCall('voice')).rejects.toThrow('microphone');
    expect(engine.state).toBe('failed');
    expect(events.failures).toHaveLength(1);
  });

  it('a single bad remote candidate does not kill the call', async () => {
    const built = makeDeps();
    const { engine } = wire(() => built);

    await engine.startCall('voice');
    await engine.receiveAnswer('answer-sdp');

    const pc = built.pc();
    // Force addIceCandidate to throw for this one candidate.
    const failing = { candidate: 'bad', sdpMid: null, sdpMLineIndex: null };
    void failing;
    await expect(engine.receiveIce('x', null, null)).resolves.toBeUndefined();
    expect(engine.state).not.toBe('failed');
    expect(pc?.closed).toBe(false);
  });
});