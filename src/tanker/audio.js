import { getTankerAcoustics } from './motion.js';

const smooth = (param, value, now, seconds = 0.15) => param.setTargetAtTime(value, now, seconds);

// This source owns neither AudioContext nor the listener. A host can connect it
// directly to SoundscapeEngine.nodes.world and retain its master/mute/route/cut
// buses. The laboratory uses the same published audio field names with its own
// explicitly unlocked context. No remote samples and no autoplay.
export class TankerSound {
  constructor({ context, destination, sharedWorldBus = false }) {
    this.context = context;
    this.sharedWorldBus = sharedWorldBus;
    this.sources = [];
    this.nodes = [];
    this.horns = new Set();
    this.disposed = false;
    const make = (type) => {
      const node = context[type]();
      this.nodes.push(node);
      return node;
    };
    this.mix = make('createGain');
    this.engine = make('createGain');
    this.wash = make('createGain');
    this.engine.gain.value = 0;
    this.wash.gain.value = 0;
    this.engine.connect(this.mix);
    this.wash.connect(this.mix);
    this.panner = make('createPanner');
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 45;
    this.panner.maxDistance = 12000;
    this.panner.rolloffFactor = 1;
    this.filter = make('createBiquadFilter');
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.45;
    this.output = make('createGain');
    this.output.gain.value = 0;
    this.analyser = make('createAnalyser');
    this.analyser.fftSize = 512;
    this.waveform = new Float32Array(this.analyser.fftSize);
    this.mix.connect(this.panner).connect(this.filter).connect(this.output).connect(this.analyser).connect(destination);

    this.partials = [1, 2, 3, 4, 6, 9, 13].map((harmonic, index) => {
      const oscillator = make('createOscillator');
      const gain = make('createGain');
      oscillator.type = 'sine';
      oscillator.frequency.value = 11 * harmonic;
      oscillator.detune.value = index % 2 ? -2 : 2;
      gain.gain.value = 0.2 / Math.pow(harmonic, 0.75);
      oscillator.connect(gain).connect(this.engine);
      oscillator.start();
      this.sources.push(oscillator);
      return { oscillator, harmonic };
    });
    const buffer = context.createBuffer(1, context.sampleRate * 5, context.sampleRate);
    let seed = 173, previous = 0;
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      previous = (previous + ((seed / 4294967296) * 2 - 1) * 0.025) / 1.025;
      data[i] = previous * 3.5;
    }
    for (const [frequency, q, gainValue, target] of [[180, 0.55, 0.8, this.engine], [820, 0.32, 0.55, this.wash]]) {
      const noise = make('createBufferSource');
      const band = make('createBiquadFilter');
      const gain = make('createGain');
      noise.buffer = buffer;
      noise.loop = true;
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = q;
      gain.gain.value = gainValue;
      noise.connect(band).connect(gain).connect(target);
      noise.start(0, frequency === 180 ? 0 : 1.31);
      this.sources.push(noise);
    }
    const flutter = make('createOscillator');
    const flutterGain = make('createGain');
    flutter.frequency.value = 1.7;
    flutterGain.gain.value = 0.018;
    flutter.connect(flutterGain).connect(this.engine.gain);
    flutter.start();
    this.sources.push(flutter);
  }

  update({ source, listener, forward, up, distance, speedKnots, radialVelocity = 0, settings, userEnabled = true, engineGain = 0.65, wakeGain = 0.4 }) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const track = settings.tracks?.tanker ?? { enabled: true, gain: 0.65 };
    const enabled = userEnabled && settings.enabled !== false && track.enabled !== false
      && ['soundscape', 'hybrid'].includes(settings.mode ?? 'soundscape');
    const acoustics = getTankerAcoustics({
      distance, speedKnots, radialVelocity,
      masterGain: settings.masterGain, ambienceGain: settings.ambienceGain,
      spatialGain: settings.spatialGain, trackGain: track.gain, enabled,
      spatialEnabled: settings.spatialEnabled !== false,
    });
    this.panner.rolloffFactor = settings.spatialEnabled === false ? 0 : 1;
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) {
      // With spatialization off the source sits at the listener, centred.
      smooth(this.panner[`position${axis}`], settings.spatialEnabled === false ? listener[index] : source[index], now, 0.08);
      if (!this.sharedWorldBus && this.context.listener[`position${axis}`]) {
        smooth(this.context.listener[`position${axis}`], listener[index], now, 0.08);
        smooth(this.context.listener[`forward${axis}`], forward[index], now, 0.08);
        smooth(this.context.listener[`up${axis}`], up[index], now, 0.08);
      }
    }
    for (const { oscillator, harmonic } of this.partials) smooth(oscillator.frequency, acoustics.fundamental * harmonic * acoustics.doppler, now, 0.35);
    smooth(this.filter.frequency, acoustics.cutoff, now, 0.3);
    smooth(this.engine.gain, engineGain * (0.38 + Math.min(1, speedKnots / 14) * 0.62), now);
    smooth(this.wash.gain, wakeGain * Math.pow(Math.min(1, speedKnots / 14), 1.3), now);
    smooth(this.output.gain, this.sharedWorldBus ? (enabled ? track.gain : 0) : acoustics.gain, now);
    this.lastAcoustics = acoustics;
  }

  horn(gain = 0.6, delay = 0) {
    const offline = typeof this.context.startRendering === 'function';
    if (this.disposed || (this.context.state !== 'running' && !offline)) return;
    const now = this.context.currentTime + Math.max(0, delay);
    // Slowly building air horns: three low fundamentals with their own harmonic
    // spectra and a long release. One voice at a time prevents button stacking.
    if (this.horns.size) return;
    for (const frequency of [110, 138.6, 164.8]) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const real = new Float32Array(10), imag = new Float32Array(10);
      for (let i = 1; i < imag.length; i += 1) imag[i] = 1 / Math.pow(i, 1.4);
      oscillator.setPeriodicWave(this.context.createPeriodicWave(real, imag));
      oscillator.frequency.value = frequency;
      oscillator.frequency.setTargetAtTime(frequency * 0.993, now + 1.5, 0.7);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(gain * 0.22, now + 0.42);
      envelope.gain.setValueAtTime(gain * 0.22, now + 2.0);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      oscillator.connect(envelope).connect(this.mix);
      const voice = { oscillator, envelope };
      this.horns.add(voice);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.horns.delete(voice); };
      oscillator.start(now);
      oscillator.stop(now + 3.5);
    }
  }

  meter() {
    this.analyser.getFloatTimeDomainData(this.waveform);
    let sum = 0, peak = 0;
    for (const sample of this.waveform) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    return { rms: Math.sqrt(sum / this.waveform.length), peak, ...this.lastAcoustics };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) source.stop();
    for (const { oscillator, envelope } of this.horns) { oscillator.onended = null; oscillator.stop(); oscillator.disconnect(); envelope.disconnect(); }
    this.horns.clear();
    for (const node of this.nodes) node.disconnect();
  }
}
