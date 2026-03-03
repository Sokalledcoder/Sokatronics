const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
const VALID_FFT_SIZES = new Set([32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function averageRange(data, startIndex, endIndex) {
  if (!data.length || endIndex <= startIndex) {
    return 0;
  }

  let sum = 0;
  for (let i = startIndex; i < endIndex; i += 1) {
    sum += data[i];
  }
  const average = sum / (endIndex - startIndex);
  return average / 255;
}

function isLikelyAudioFile(file) {
  if (!file) {
    return false;
  }

  if (typeof file.type === 'string' && file.type.startsWith('audio/')) {
    return true;
  }

  return /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i.test(file.name || '');
}

export class AudioEngine extends EventTarget {
  constructor({ fftSize = 1024 } = {}) {
    super();

    this.audioEl = new Audio();
    this.audioEl.preload = 'metadata';
    this.audioEl.crossOrigin = 'anonymous';

    this.context = null;
    this.sourceNode = null;
    this.analyser = null;
    this.frequencyData = new Uint8Array(0);
    this.waveformData = new Uint8Array(0);

    this.trackName = '';
    this.objectUrl = null;
    this.fftSize = fftSize;
    this.smoothing = 0.82;

    this.#bindMediaEvents();
  }

  async loadFile(file) {
    if (!isLikelyAudioFile(file)) {
      this.#emitError('unsupported_file', 'Please upload a valid audio file.');
      throw new Error('Unsupported audio file.');
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.audioEl.pause();
    this.audioEl.currentTime = 0;

    this.trackName = file.name;
    this.objectUrl = URL.createObjectURL(file);
    this.audioEl.src = this.objectUrl;

    await this.#waitForMetadata();
    await this.#ensureGraph();
    this.#emitState();
    return this.getState();
  }

  async play() {
    if (!this.audioEl.src) {
      this.#emitError('no_track', 'Upload an audio file first.');
      return;
    }

    try {
      await this.#ensureGraph();
      await this.audioEl.play();
    } catch (error) {
      this.#emitError('playback_failed', 'Playback failed. Interact with the page and try again.');
      throw error;
    }
  }

  pause() {
    this.audioEl.pause();
  }

  async togglePlay() {
    if (!this.getState().isLoaded) {
      this.#emitError('no_track', 'Upload an audio file first.');
      return;
    }

    if (this.audioEl.paused) {
      await this.play();
      return;
    }
    this.pause();
  }

  seek(timeSec) {
    if (!this.getState().isLoaded) {
      return;
    }

    const duration = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0;
    this.audioEl.currentTime = clamp(timeSec, 0, duration || 0);
    this.#emitState();
  }

  skip(deltaSec) {
    this.seek((this.audioEl.currentTime || 0) + deltaSec);
  }

  setVolume(value) {
    this.audioEl.volume = clamp(value, 0, 1);
    this.#emitState();
  }

  toggleMute() {
    this.audioEl.muted = !this.audioEl.muted;
    this.#emitState();
  }

  setPlaybackRate(rate) {
    this.audioEl.playbackRate = clamp(rate, 0.5, 2);
    this.#emitState();
  }

  setLoop(enabled) {
    this.audioEl.loop = Boolean(enabled);
    this.#emitState();
  }

  setFftSize(size) {
    if (!VALID_FFT_SIZES.has(size)) {
      return;
    }

    this.fftSize = size;
    if (this.analyser) {
      this.analyser.fftSize = size;
      this.#allocateAnalysisBuffers();
    }
  }

  setSmoothing(value) {
    this.smoothing = clamp(value, 0, 0.99);
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = this.smoothing;
    }
  }

  sampleAnalysis() {
    if (!this.analyser || !this.frequencyData.length) {
      return {
        bins: this.frequencyData,
        bass: 0,
        mid: 0,
        treble: 0,
        rms: 0,
        peak: 0,
      };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.waveformData);

    const bassEnd = Math.max(1, Math.floor(this.frequencyData.length * 0.12));
    const midEnd = Math.max(bassEnd + 1, Math.floor(this.frequencyData.length * 0.45));
    const bass = averageRange(this.frequencyData, 0, bassEnd);
    const mid = averageRange(this.frequencyData, bassEnd, midEnd);
    const treble = averageRange(this.frequencyData, midEnd, this.frequencyData.length);

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < this.waveformData.length; i += 1) {
      const centered = (this.waveformData[i] - 128) / 128;
      sumSquares += centered * centered;
      peak = Math.max(peak, Math.abs(centered));
    }

    const rms = this.waveformData.length
      ? Math.min(1, Math.sqrt(sumSquares / this.waveformData.length))
      : 0;

    const frame = {
      bins: this.frequencyData,
      bass,
      mid,
      treble,
      rms,
      peak: Math.min(1, peak),
    };

    this.dispatchEvent(new CustomEvent('analysisframe', { detail: frame }));
    return frame;
  }

  getState() {
    const duration = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0;
    const currentTime = Number.isFinite(this.audioEl.currentTime) ? this.audioEl.currentTime : 0;
    const isLoaded = Boolean(this.audioEl.src);
    const isPlaying = isLoaded && !this.audioEl.paused && !this.audioEl.ended;

    return {
      isLoaded,
      isPlaying,
      currentTime,
      duration,
      volume: this.audioEl.volume,
      muted: this.audioEl.muted,
      rate: this.audioEl.playbackRate,
      loop: this.audioEl.loop,
      trackName: this.trackName,
    };
  }

  dispose() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (this.context) {
      this.context.close().catch(() => {});
    }
  }

  async #ensureGraph() {
    if (!AudioContextCtor) {
      this.#emitError('audio_context_unavailable', 'Web Audio API is not supported in this browser.');
      throw new Error('AudioContext is not supported.');
    }

    if (!this.context) {
      this.context = new AudioContextCtor();
    }

    if (!this.sourceNode) {
      this.sourceNode = this.context.createMediaElementSource(this.audioEl);
    }

    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.#allocateAnalysisBuffers();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  #allocateAnalysisBuffers() {
    if (!this.analyser) {
      return;
    }
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveformData = new Uint8Array(this.analyser.fftSize);
  }

  #bindMediaEvents() {
    const stateEvents = [
      'play',
      'pause',
      'timeupdate',
      'loadedmetadata',
      'durationchange',
      'ratechange',
      'volumechange',
      'seeking',
      'seeked',
      'ended',
    ];

    for (const eventName of stateEvents) {
      this.audioEl.addEventListener(eventName, () => this.#emitState());
    }

    this.audioEl.addEventListener('error', () => {
      const code = this.audioEl.error?.code ?? 0;
      this.#emitError('audio_error', `Audio playback error (code ${code}).`);
    });
  }

  #emitState() {
    this.dispatchEvent(new CustomEvent('statechange', { detail: this.getState() }));
  }

  #emitError(code, message) {
    this.dispatchEvent(new CustomEvent('error', { detail: { code, message } }));
  }

  #waitForMetadata() {
    return new Promise((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        this.#emitError('decode_failed', 'Failed to decode the selected audio file.');
        reject(new Error('Audio metadata failed to load.'));
      };

      const cleanup = () => {
        this.audioEl.removeEventListener('loadedmetadata', onLoaded);
        this.audioEl.removeEventListener('error', onError);
      };

      this.audioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
      this.audioEl.addEventListener('error', onError, { once: true });
      this.audioEl.load();
    });
  }
}
