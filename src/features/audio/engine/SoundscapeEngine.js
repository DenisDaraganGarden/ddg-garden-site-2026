import { TankerSound } from '../../../tanker/audio.js';
import { SOUNDSCAPE_ASSETS, SOUNDSCAPE_TRACK_IDS } from '../data/soundscapeManifest.js';
import { normalizeSoundscapeSettings } from '../data/soundscapeSettings.js';

const LOOP_CURVE_POINTS = 48;
const MIN_SCHEDULE_AHEAD_SECONDS = 1.5;
const LISTENER_SMOOTH_SECONDS = 0.075;
const POSITION_EPSILON = 0.0005;

const equalPowerFadeIn = new Float32Array(
  Array.from({ length: LOOP_CURVE_POINTS }, (_, index) => (
    Math.sin((index / (LOOP_CURVE_POINTS - 1)) * Math.PI * 0.5)
  )),
);
const equalPowerFadeOut = new Float32Array(
  Array.from({ length: LOOP_CURVE_POINTS }, (_, index) => (
    Math.cos((index / (LOOP_CURVE_POINTS - 1)) * Math.PI * 0.5)
  )),
);

const getAudioContextConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.AudioContext ?? window.webkitAudioContext ?? null;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const randomBetween = (range, random = Math.random) => {
  const [minimum, maximum] = range;
  return minimum + ((maximum - minimum) * random());
};

const audioModeHasMusic = (mode) => mode === 'music' || mode === 'hybrid';
const audioModeHasSoundscape = (mode) => mode === 'soundscape' || mode === 'hybrid';

function holdAndRamp(param, target, duration, now) {
  if (!param) {
    return;
  }

  const safeTarget = Number.isFinite(target) ? target : 0;
  const safeDuration = Math.max(0, Number(duration) || 0);
  const currentValue = Number.isFinite(param.value) ? param.value : safeTarget;

  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
  } else {
    param.cancelScheduledValues?.(now);
    param.setValueAtTime?.(currentValue, now);
  }

  if (safeDuration <= 0.005) {
    param.setValueAtTime?.(safeTarget, now);
    return;
  }

  param.linearRampToValueAtTime?.(safeTarget, now + safeDuration);
}

function setSmoothedParam(param, target, now, timeConstant = LISTENER_SMOOTH_SECONDS) {
  if (!param || !Number.isFinite(target)) {
    return;
  }

  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(target, now, timeConstant);
    return;
  }

  param.setValueAtTime?.(target, now);
}

function setCurve(param, curve, startTime, duration, fallbackStart, fallbackEnd) {
  if (duration <= 0.005) {
    param.setValueAtTime?.(fallbackEnd, startTime);
    return;
  }

  if (typeof param.setValueCurveAtTime === 'function') {
    param.setValueCurveAtTime(curve, startTime, duration);
    return;
  }

  param.setValueAtTime?.(fallbackStart, startTime);
  param.linearRampToValueAtTime?.(fallbackEnd, startTime + duration);
}

function stopSourceSafely(source, when = 0) {
  try {
    source.stop(when);
  } catch {
    // AudioBufferSourceNode throws when it has already ended. Cleanup is still complete.
  }
}

export class SoundscapeEngine {
  constructor({ contextFactory, fetchImpl, random = Math.random } = {}) {
    this.contextFactory = contextFactory ?? (() => {
      const AudioContextConstructor = getAudioContextConstructor();
      return AudioContextConstructor ? new AudioContextConstructor({ latencyHint: 'playback' }) : null;
    });
    this.fetchImpl = fetchImpl ?? ((...args) => fetch(...args));
    this.random = random;
    this.settings = normalizeSoundscapeSettings();
    this.tankerSound = null;
    this.tankerState = null;
    this.context = null;
    this.nodes = null;
    this.buffers = new Map();
    this.tracks = new Map();
    this.trackPromises = new Map();
    this.listeners = new Set();
    this.userEnabled = false;
    this.routeActive = false;
    this.pageVisible = true;
    this.unlocked = false;
    this.loadingCount = 0;
    this.lastError = '';
    this.soloTrackId = null;
    this.cameraTransition = { phase: 'idle', fadeSeconds: 0 };
    this.lastUiClickAt = 0;
    this.listenerPose = null;
    this.emitterPositions = new Map();
    this.generation = 0;
  }

  isSupported() {
    return Boolean(this.context || getAudioContextConstructor());
  }

  isSpatialTrackingActive() {
    return Boolean(
      this.userEnabled
      && this.unlocked
      && this.settings.enabled
      && this.pageVisible
      && this.routeActive
      && this.settings.mode !== 'off',
    );
  }

  getState() {
    const homeAudible = this.isSpatialTrackingActive();

    return {
      supported: this.isSupported(),
      contextState: this.context?.state ?? 'idle',
      unlocked: this.unlocked,
      enabled: this.userEnabled,
      homeAudible,
      routeActive: this.routeActive,
      pageVisible: this.pageVisible,
      mode: this.settings.mode,
      loading: this.loadingCount > 0,
      loadingCount: this.loadingCount,
      activeTracks: [...this.tracks.keys()],
      soloTrackId: this.soloTrackId,
      transitionPhase: this.cameraTransition.phase,
      homeGainTarget: this.routeActive && this.settings.mode !== 'off' ? 1 : 0,
      worldFocusTarget: (
        this.settings.duckOnCameraCut
        && this.cameraTransition.phase !== 'idle'
        && this.cameraTransition.phase !== 'fade-in'
      ) ? this.settings.cameraCutDuck : 1,
      trackSourceCounts: Object.fromEntries(
        [...this.tracks.entries()].map(([trackId, track]) => [trackId, track.sources.size]),
      ),
      error: this.lastError,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emitState() {
    const state = this.getState();

    if (typeof window !== 'undefined') {
      window.__DDG_AUDIO_STATE__ = state;
    }

    this.listeners.forEach((listener) => listener(state));
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }

    const context = this.contextFactory();
    if (!context) {
      this.lastError = 'Web Audio API is not available in this browser.';
      this.emitState();
      return null;
    }

    this.context = context;
    this.generation += 1;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.28;

    const master = context.createGain();
    const user = context.createGain();
    const home = context.createGain();
    const music = context.createGain();
    const ambience = context.createGain();
    const bed = context.createGain();
    const world = context.createGain();
    const worldFocus = context.createGain();
    const weather = context.createGain();
    const ui = context.createGain();

    music.connect(home);
    bed.connect(ambience);
    world.connect(worldFocus);
    worldFocus.connect(ambience);
    weather.connect(ambience);
    ambience.connect(home);
    home.connect(master);
    ui.connect(master);
    master.connect(user);
    user.connect(compressor);
    compressor.connect(context.destination);

    user.gain.value = 0;
    home.gain.value = 0;
    worldFocus.gain.value = 1;

    this.nodes = {
      compressor,
      master,
      user,
      home,
      music,
      ambience,
      bed,
      world,
      worldFocus,
      weather,
      ui,
    };

    this.applySettingsToGraph(true);
    this.emitState();
    return context;
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context) {
      return false;
    }

    try {
      if (context.state !== 'running') {
        await context.resume();
      }
      this.unlocked = context.state === 'running';
      this.lastError = '';
      this.emitState();
      return this.unlocked;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Audio playback was blocked.';
      this.unlocked = false;
      this.emitState();
      return false;
    }
  }

  async setUserEnabled(enabled) {
    const nextEnabled = Boolean(enabled);

    if (nextEnabled) {
      const unlocked = await this.unlock();
      if (!unlocked) {
        return false;
      }
    }

    this.userEnabled = nextEnabled;
    this.syncPlayback();
    this.emitState();
    return this.userEnabled;
  }

  async toggleUserEnabled() {
    return this.setUserEnabled(!this.userEnabled);
  }

  setSettings(value) {
    this.settings = normalizeSoundscapeSettings(value);

    for (const [emitterId, emitter] of Object.entries(this.settings.emitters)) {
      this.updateEmitter(emitterId, emitter.x, emitter.y, emitter.z, true);
    }

    if (this.context) {
      this.applySettingsToGraph(false);
      this.refreshTrackSpatialSettings();
      this.refreshTrackGains();
      this.syncPlayback();
    }

    this.emitState();
  }

  setRouteActive(active) {
    const nextActive = Boolean(active);
    if (nextActive === this.routeActive) {
      return;
    }

    this.routeActive = nextActive;
    this.syncPlayback();
    this.emitState();
  }

  async setPageVisible(visible) {
    this.pageVisible = Boolean(visible);

    if (!this.context) {
      this.emitState();
      return;
    }

    if (!this.pageVisible) {
      this.applyUserGain(0.08);
      window.setTimeout(() => {
        if (!this.pageVisible && this.context?.state === 'running') {
          void this.context.suspend().finally(() => this.emitState());
        }
      }, 110);
      this.emitState();
      return;
    }

    if (this.userEnabled && this.unlocked) {
      try {
        await this.context.resume();
      } catch {
        // A previously unlocked context normally resumes. If a WebView refuses,
        // the next explicit sound-button click retries through setUserEnabled.
      }
    }

    this.syncPlayback();
    this.emitState();
  }

  setCameraTransition(phase, fadeSeconds = 0) {
    const nextPhase = ['idle', 'fade-out', 'black', 'fade-in'].includes(phase) ? phase : 'idle';
    const nextFadeSeconds = clamp(Number(fadeSeconds) || 0, 0, 8);
    if (
      this.cameraTransition.phase === nextPhase
      && this.cameraTransition.fadeSeconds === nextFadeSeconds
    ) {
      return;
    }

    this.cameraTransition = { phase: nextPhase, fadeSeconds: nextFadeSeconds };
    this.applyCameraTransitionGain();
    this.emitState();
  }

  setSoloTrack(trackId) {
    this.soloTrackId = (trackId === 'tanker' || SOUNDSCAPE_TRACK_IDS.includes(trackId)) ? trackId : null;
    this.refreshTrackGains();
    this.emitState();
  }

  applySettingsToGraph(immediate = false) {
    if (!this.context || !this.nodes) {
      return;
    }

    const now = this.context.currentTime;
    const duration = immediate ? 0 : 0.08;
    holdAndRamp(this.nodes.master.gain, this.settings.masterGain, duration, now);
    holdAndRamp(this.nodes.music.gain, this.settings.musicGain, duration, now);
    holdAndRamp(this.nodes.ambience.gain, this.settings.ambienceGain, duration, now);
    holdAndRamp(this.nodes.world.gain, this.settings.spatialGain, duration, now);
    holdAndRamp(this.nodes.weather.gain, this.settings.weatherGain, duration, now);
    holdAndRamp(this.nodes.ui.gain, this.settings.uiGain, duration, now);
    this.applyCameraTransitionGain(immediate);
  }

  applyCameraTransitionGain(immediate = false) {
    if (!this.context || !this.nodes) {
      return;
    }

    const { phase, fadeSeconds } = this.cameraTransition;
    const shouldDuck = this.settings.duckOnCameraCut && phase !== 'idle' && phase !== 'fade-in';
    const target = shouldDuck ? this.settings.cameraCutDuck : 1;
    const duration = immediate
      ? 0
      : (phase === 'black' ? 0.08 : Math.max(0.08, fadeSeconds));
    holdAndRamp(this.nodes.worldFocus.gain, target, duration, this.context.currentTime);
  }

  applyUserGain(duration = 0.2) {
    if (!this.context || !this.nodes) {
      return;
    }

    const shouldBeAudible = this.userEnabled && this.settings.enabled && this.pageVisible;
    holdAndRamp(this.nodes.user.gain, shouldBeAudible ? 1 : 0, duration, this.context.currentTime);
  }

  applyRouteGain() {
    if (!this.context || !this.nodes) {
      return;
    }

    const duration = this.routeActive
      ? this.settings.homeFadeSeconds
      : this.settings.routeFadeSeconds;
    holdAndRamp(
      this.nodes.home.gain,
      this.routeActive && this.settings.mode !== 'off' ? 1 : 0,
      duration,
      this.context.currentTime,
    );
  }

  syncPlayback() {
    if (!this.context || !this.nodes) {
      return;
    }

    this.applySettingsToGraph(false);
    this.applyUserGain(this.userEnabled ? 0.24 : 0.12);
    this.applyRouteGain();
    this.refreshTrackGains();

    const canStartHome = this.userEnabled
      && this.unlocked
      && this.pageVisible
      && this.routeActive
      && this.settings.enabled;

    if (!canStartHome) {
      return;
    }

    const requestedTracks = [];
    if (audioModeHasMusic(this.settings.mode)) {
      requestedTracks.push('music');
    }
    if (audioModeHasSoundscape(this.settings.mode)) {
      requestedTracks.push(...SOUNDSCAPE_TRACK_IDS.filter((trackId) => trackId !== 'ui'));
    }

    requestedTracks.forEach((trackId) => {
      if (trackId !== 'music' && !this.settings.tracks[trackId]?.enabled) {
        return;
      }
      void this.ensureTrack(trackId);
    });
  }

  async loadBuffer(asset) {
    const existing = this.buffers.get(asset.url);
    if (existing) {
      return existing;
    }

    const generation = this.generation;
    const promise = (async () => {
      this.loadingCount += 1;
      this.emitState();

      try {
        const response = await this.fetchImpl(asset.url);
        if (!response.ok) {
          throw new Error(`Audio asset ${asset.id} failed with HTTP ${response.status}.`);
        }
        const encoded = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(encoded.slice(0));

        if (generation !== this.generation) {
          throw new Error('Audio graph changed while a track was decoding.');
        }

        return buffer;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : `Failed to load ${asset.id}.`;
        this.buffers.delete(asset.url);
        throw error;
      } finally {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        this.emitState();
      }
    })();

    this.buffers.set(asset.url, promise);
    return promise;
  }

  async ensureTrack(trackId) {
    if (this.tracks.has(trackId)) {
      return this.tracks.get(trackId);
    }

    const pending = this.trackPromises.get(trackId);
    if (pending) {
      return pending;
    }

    const asset = SOUNDSCAPE_ASSETS[trackId];
    if (!asset || !this.context || !this.nodes) {
      return null;
    }

    const generation = this.generation;
    const promise = (async () => {
      try {
        const buffer = await this.loadBuffer(asset);
        if (generation !== this.generation) {
          return null;
        }

        const track = this.createTrack(asset, buffer);
        this.tracks.set(trackId, track);
        this.applyTrackGain(track, true);
        this.startTrackTransport(track);
        this.emitState();
        return track;
      } catch {
        return null;
      } finally {
        this.trackPromises.delete(trackId);
      }
    })();

    this.trackPromises.set(trackId, promise);
    return promise;
  }

  createTrack(asset, buffer) {
    const context = this.context;
    const input = context.createGain();
    const gain = context.createGain();
    const sources = new Set();
    const timers = new Set();
    let signal = input;
    let filter = null;

    if (asset.lowpassHz) {
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = asset.lowpassHz;
      filter.Q.value = 0.6;
      signal.connect(filter);
      signal = filter;
    }

    let panner = null;
    let spatialMix = null;
    let directMix = null;

    if (asset.spatial) {
      panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 1;
      spatialMix = context.createGain();
      directMix = context.createGain();
      signal.connect(panner);
      panner.connect(spatialMix);
      spatialMix.connect(gain);
      signal.connect(directMix);
      directMix.connect(gain);
    } else {
      signal.connect(gain);
    }

    gain.connect(this.nodes[asset.bus]);

    const track = {
      asset,
      buffer,
      input,
      gain,
      filter,
      panner,
      spatialMix,
      directMix,
      sources,
      timers,
      stopped: false,
      nextLoopStart: null,
    };

    this.applyTrackSpatialSettings(track, true);
    return track;
  }

  getTrackTargetGain(trackId) {
    if (trackId === 'music') {
      return audioModeHasMusic(this.settings.mode) ? 1 : 0;
    }

    const trackSettings = this.settings.tracks[trackId];
    if (!trackSettings?.enabled || !audioModeHasSoundscape(this.settings.mode)) {
      return 0;
    }

    if (this.soloTrackId && this.soloTrackId !== trackId) {
      return 0;
    }

    return trackSettings.gain;
  }

  applyTrackGain(track, immediate = false) {
    if (!this.context) {
      return;
    }

    holdAndRamp(
      track.gain.gain,
      this.getTrackTargetGain(track.asset.id),
      immediate ? 0 : 0.08,
      this.context.currentTime,
    );
  }

  refreshTrackGains() {
    this.tracks.forEach((track) => this.applyTrackGain(track));
  }

  applyTrackSpatialSettings(track, immediate = false) {
    if (!track.panner || !this.context) {
      return;
    }

    const configured = track.asset.panner
      ?? this.settings.emitters[track.asset.emitterId]
      ?? {};
    track.panner.refDistance = configured.refDistance ?? 4;
    track.panner.maxDistance = Math.max(track.panner.refDistance + 0.1, configured.maxDistance ?? 80);
    track.panner.rolloffFactor = configured.rolloff ?? 1;
    track.panner.panningModel = 'HRTF';
    track.panner.distanceModel = 'inverse';

    const spatialTarget = this.settings.spatialEnabled ? 1 : 0;
    const directTarget = this.settings.spatialEnabled ? 0 : 1;
    holdAndRamp(
      track.spatialMix.gain,
      spatialTarget,
      immediate ? 0 : 0.06,
      this.context.currentTime,
    );
    holdAndRamp(
      track.directMix.gain,
      directTarget,
      immediate ? 0 : 0.06,
      this.context.currentTime,
    );

    const position = this.emitterPositions.get(track.asset.emitterId)
      ?? this.settings.emitters[track.asset.emitterId];
    if (position) {
      this.setPannerPosition(track.panner, position.x, position.y, position.z, immediate);
    }
  }

  refreshTrackSpatialSettings() {
    this.tracks.forEach((track) => this.applyTrackSpatialSettings(track));
  }

  setPannerPosition(panner, x, y, z, immediate = false) {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    const smooth = immediate ? 0.001 : 0.035;
    if (panner.positionX) {
      setSmoothedParam(panner.positionX, x, now, smooth);
      setSmoothedParam(panner.positionY, y, now, smooth);
      setSmoothedParam(panner.positionZ, z, now, smooth);
    } else {
      panner.setPosition?.(x, y, z);
    }
  }

  updateEmitter(emitterId, x, y, z, immediate = false) {
    if (![x, y, z].every(Number.isFinite)) {
      return;
    }

    const previous = this.emitterPositions.get(emitterId);
    if (
      !immediate
      && previous
      && Math.abs(previous.x - x) < POSITION_EPSILON
      && Math.abs(previous.y - y) < POSITION_EPSILON
      && Math.abs(previous.z - z) < POSITION_EPSILON
    ) {
      return;
    }

    if (previous) {
      previous.x = x;
      previous.y = y;
      previous.z = z;
    } else {
      this.emitterPositions.set(emitterId, { x, y, z });
    }
    this.tracks.forEach((track) => {
      if (track.asset.emitterId === emitterId && track.panner) {
        this.setPannerPosition(track.panner, x, y, z, immediate);
      }
    });
  }

  updateListener(position, forward, up) {
    if (!this.context || !this.unlocked || !position || !forward || !up) {
      return;
    }

    const pose = [
      position.x,
      position.y,
      position.z,
      forward.x,
      forward.y,
      forward.z,
      up.x,
      up.y,
      up.z,
    ];
    if (!pose.every(Number.isFinite)) {
      return;
    }

    const previous = this.listenerPose;
    if (
      previous
      && pose.every((value, index) => Math.abs(value - previous[index]) < POSITION_EPSILON)
    ) {
      return;
    }
    this.listenerPose = pose;

    const listener = this.context.listener;
    const now = this.context.currentTime;
    if (listener.positionX) {
      setSmoothedParam(listener.positionX, pose[0], now);
      setSmoothedParam(listener.positionY, pose[1], now);
      setSmoothedParam(listener.positionZ, pose[2], now);
      setSmoothedParam(listener.forwardX, pose[3], now);
      setSmoothedParam(listener.forwardY, pose[4], now);
      setSmoothedParam(listener.forwardZ, pose[5], now);
      setSmoothedParam(listener.upX, pose[6], now);
      setSmoothedParam(listener.upY, pose[7], now);
      setSmoothedParam(listener.upZ, pose[8], now);
    } else {
      listener.setPosition?.(pose[0], pose[1], pose[2]);
      listener.setOrientation?.(pose[3], pose[4], pose[5], pose[6], pose[7], pose[8]);
    }
  }

  startTrackTransport(track) {
    if (track.asset.playback === 'loop') {
      this.scheduleLoopCycle(track, this.context.currentTime + 0.04, track.asset.startOffsetSeconds ?? 0);
      return;
    }

    if (track.asset.playback === 'random-segment') {
      this.scheduleRandomTrack(track, 1.6);
      return;
    }

    if (track.asset.playback === 'random-one-shot') {
      this.scheduleRandomTrack(track, randomBetween([18, 38], this.random));
    }
  }

  createSource(track) {
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = track.buffer;
    source.playbackRate.value = track.asset.playbackRate ?? 1;
    source.connect(envelope);
    envelope.connect(track.input);
    track.sources.add(source);
    source.addEventListener?.('ended', () => {
      source.disconnect();
      envelope.disconnect();
      track.sources.delete(source);
    }, { once: true });
    return { source, envelope };
  }

  scheduleLoopCycle(track, requestedStartTime, offsetSeconds = 0) {
    if (track.stopped || !this.context) {
      return;
    }

    const playbackRate = track.asset.playbackRate ?? 1;
    const safeOffset = clamp(offsetSeconds, 0, Math.max(0, track.buffer.duration - 0.05));
    const sourceDuration = (track.buffer.duration - safeOffset) / playbackRate;
    const crossfade = Math.min(
      track.asset.crossfadeSeconds ?? 0.2,
      Math.max(0.03, sourceDuration * 0.24),
    );
    const startTime = Math.max(this.context.currentTime + 0.02, requestedStartTime);
    const endTime = startTime + sourceDuration;
    const nextStart = endTime - crossfade;
    const { source, envelope } = this.createSource(track);

    envelope.gain.setValueAtTime(0, startTime);
    setCurve(envelope.gain, equalPowerFadeIn, startTime, crossfade, 0, 1);
    envelope.gain.setValueAtTime(1, Math.max(startTime + crossfade, endTime - crossfade));
    setCurve(envelope.gain, equalPowerFadeOut, endTime - crossfade, crossfade, 1, 0);
    source.start(startTime, safeOffset);
    stopSourceSafely(source, endTime + 0.02);
    track.nextLoopStart = nextStart;

    const scheduleDelayMs = Math.max(
      40,
      (nextStart - this.context.currentTime - MIN_SCHEDULE_AHEAD_SECONDS) * 1000,
    );
    const timer = window.setTimeout(() => {
      track.timers.delete(timer);
      this.scheduleLoopCycle(track, nextStart, 0);
    }, scheduleDelayMs);
    track.timers.add(timer);
  }

  scheduleRandomTrack(track, requestedDelaySeconds) {
    if (track.stopped) {
      return;
    }

    const delaySeconds = Math.max(0.1, requestedDelaySeconds);
    const timer = window.setTimeout(() => {
      track.timers.delete(timer);
      if (!track.stopped) {
        const occurrenceDuration = this.playTrackOccurrence(track);
        // Authored delaySeconds are a silent gap after the recording, not a
        // start-to-start interval. This prevents two excerpts from sharing and
        // moving the same spatial panner while the first one is still audible.
        this.scheduleRandomTrack(
          track,
          occurrenceDuration + randomBetween(track.asset.delaySeconds, this.random),
        );
      }
    }, delaySeconds * 1000);
    track.timers.add(timer);
  }

  playTrackOccurrence(track) {
    if (
      !this.context
      || track.stopped
      || !this.pageVisible
      || this.context.state !== 'running'
    ) {
      return 0;
    }

    const now = this.context.currentTime + 0.015;
    const isSegment = track.asset.playback === 'random-segment';
    const duration = isSegment
      ? Math.min(track.buffer.duration, randomBetween(track.asset.segmentSeconds, this.random))
      : track.buffer.duration;
    const maximumOffset = Math.max(0, track.buffer.duration - duration - 0.05);
    const offset = isSegment ? this.random() * maximumOffset : 0;
    const fade = Math.min(track.asset.fadeSeconds ?? 0.2, duration * 0.24);
    const { source, envelope } = this.createSource(track);

    envelope.gain.setValueAtTime(0, now);
    setCurve(envelope.gain, equalPowerFadeIn, now, fade, 0, 1);
    envelope.gain.setValueAtTime(1, Math.max(now + fade, now + duration - fade));
    setCurve(envelope.gain, equalPowerFadeOut, now + duration - fade, fade, 1, 0);

    if (track.panner && track.asset.emitterId !== 'boat') {
      const base = this.settings.emitters[track.asset.emitterId];
      if (base) {
        const spread = track.asset.id === 'birds' ? 5 : 8;
        this.setPannerPosition(
          track.panner,
          base.x + ((this.random() - 0.5) * spread),
          base.y + ((this.random() - 0.5) * (spread * 0.45)),
          base.z + ((this.random() - 0.5) * spread),
        );
      }
    }

    source.start(now, offset, duration);
    stopSourceSafely(source, now + duration + 0.02);
    return duration;
  }

  updateTanker(state) {
    this.tankerState = state;
    if (!this.tankerSound && this.context && this.nodes && this.isSpatialTrackingActive()) {
      this.tankerSound = new TankerSound({ context: this.context, destination: this.nodes.world, sharedWorldBus: true });
    }
    this.tankerSound?.update({
      ...state, listener: this.listenerPose?.slice(0, 3) ?? [0, 0, 0],
      settings: this.settings,
      userEnabled: this.isSpatialTrackingActive() && (!this.soloTrackId || this.soloTrackId === 'tanker'),
    });
  }

  releaseTanker() {
    this.tankerSound?.dispose();
    this.tankerSound = null;
    this.tankerState = null;
  }

  async playPreview(trackId) {
    if (trackId === 'tanker') {
      if (!this.tankerState || !await this.unlock()) return false;
      this.updateTanker(this.tankerState);
      this.tankerSound?.horn();
      return Boolean(this.tankerSound);
    }

    const asset = SOUNDSCAPE_ASSETS[trackId];
    if (!asset) {
      return false;
    }

    const unlocked = await this.unlock();
    if (!unlocked) {
      return false;
    }

    const buffer = await this.loadBuffer(asset).catch(() => null);
    if (!buffer || !this.context || !this.nodes) {
      return false;
    }

    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    const previewGain = this.context.createGain();
    let output = previewGain;
    source.buffer = buffer;
    source.playbackRate.value = asset.playbackRate ?? 1;
    previewGain.gain.value = trackId === 'music'
      ? 0.75
      : (this.settings.tracks[trackId]?.gain ?? 0.5);

    let panner = null;
    if (asset.spatial && this.settings.spatialEnabled) {
      panner = this.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      const configured = asset.panner ?? this.settings.emitters[asset.emitterId] ?? {};
      panner.refDistance = configured.refDistance ?? 4;
      panner.maxDistance = configured.maxDistance ?? 80;
      panner.rolloffFactor = configured.rolloff ?? 1;
      const position = this.emitterPositions.get(asset.emitterId) ?? configured;
      this.setPannerPosition(panner, position.x ?? 0, position.y ?? 0, position.z ?? 0, true);
      previewGain.connect(panner);
      output = panner;
    }

    output.connect(this.nodes[asset.bus]);
    source.connect(envelope);
    envelope.connect(previewGain);

    const now = this.context.currentTime + 0.015;
    const requestedDuration = asset.playback === 'random-segment'
      ? randomBetween(asset.segmentSeconds, this.random)
      : (asset.playback === 'loop' ? 7 : buffer.duration);
    const duration = Math.min(buffer.duration, requestedDuration);
    const maxOffset = Math.max(0, buffer.duration - duration - 0.05);
    const offset = asset.startOffsetSeconds
      ? Math.min(asset.startOffsetSeconds, maxOffset)
      : (asset.playback === 'random-segment' ? this.random() * maxOffset : 0);
    const fade = Math.min(asset.fadeSeconds ?? 0.25, duration * 0.2);
    envelope.gain.setValueAtTime(0, now);
    setCurve(envelope.gain, equalPowerFadeIn, now, fade, 0, 1);
    envelope.gain.setValueAtTime(1, Math.max(now + fade, now + duration - fade));
    setCurve(envelope.gain, equalPowerFadeOut, now + duration - fade, fade, 1, 0);
    source.start(now, offset, duration);
    stopSourceSafely(source, now + duration + 0.02);
    source.addEventListener?.('ended', () => {
      source.disconnect();
      envelope.disconnect();
      previewGain.disconnect();
      panner?.disconnect();
    }, { once: true });
    return true;
  }

  async playUiClick() {
    const nowMilliseconds = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (
      !this.userEnabled
      || !this.settings.enabled
      || !this.settings.tracks.ui.enabled
      || nowMilliseconds - this.lastUiClickAt < 70
    ) {
      return false;
    }
    this.lastUiClickAt = nowMilliseconds;

    const asset = SOUNDSCAPE_ASSETS.ui;
    const buffer = await this.loadBuffer(asset).catch(() => null);
    if (!buffer || !this.context || this.context.state !== 'running') {
      return false;
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.settings.tracks.ui.gain;
    source.connect(gain);
    gain.connect(this.nodes.ui);
    source.start();
    source.addEventListener?.('ended', () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    return true;
  }

  stopTrack(track) {
    track.stopped = true;
    track.timers.forEach((timer) => window.clearTimeout(timer));
    track.timers.clear();
    track.sources.forEach((source) => stopSourceSafely(source));
    track.sources.clear();
    track.input.disconnect();
    track.gain.disconnect();
    track.filter?.disconnect();
    track.panner?.disconnect();
    track.spatialMix?.disconnect();
    track.directMix?.disconnect();
  }

  destroy() {
    this.releaseTanker();
    this.generation += 1;
    this.tracks.forEach((track) => this.stopTrack(track));
    this.tracks.clear();
    this.trackPromises.clear();
    this.buffers.clear();
    this.nodes = null;
    const context = this.context;
    this.context = null;
    this.unlocked = false;
    if (context && context.state !== 'closed') {
      void context.close();
    }
    this.emitState();
  }
}

export const siteAudioEngine = new SoundscapeEngine();

if (import.meta.hot) {
  import.meta.hot.dispose(() => siteAudioEngine.destroy());
}

export const soundscapeEngineInternals = Object.freeze({
  audioModeHasMusic,
  audioModeHasSoundscape,
  holdAndRamp,
  randomBetween,
});
