function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(secondsValue) {
  if (!Number.isFinite(secondsValue) || secondsValue < 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(secondsValue);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class OverlayController {
  constructor(
    rootElement,
    audioEngine,
    {
      initialTier = 'medium',
      initialQualityMode = 'auto',
      onQualityModeChange = () => {},
      onDensityChange = () => {},
      onSizeChange = () => {},
      onPaletteChange = () => {},
    } = {},
  ) {
    this.root = rootElement;
    this.audioEngine = audioEngine;
    this.isScrubbing = false;
    this.currentState = audioEngine.getState();
    this.qualityMode = initialQualityMode;
    this.onQualityModeChange = onQualityModeChange;
    this.onDensityChange = onDensityChange;
    this.onSizeChange = onSizeChange;
    this.onPaletteChange = onPaletteChange;
    this.elements = {
      fileInput: this.root.querySelector('#file-input'),
      uploadBtn: this.root.querySelector('#upload-btn'),
      playPauseBtn: this.root.querySelector('#play-pause-btn'),
      backBtn: this.root.querySelector('#back-btn'),
      forwardBtn: this.root.querySelector('#forward-btn'),
      seekSlider: this.root.querySelector('#seek-slider'),
      timeCurrent: this.root.querySelector('#time-current'),
      timeTotal: this.root.querySelector('#time-total'),
      muteBtn: this.root.querySelector('#mute-btn'),
      volumeSlider: this.root.querySelector('#volume-slider'),
      rateSelect: this.root.querySelector('#rate-select'),
      loopBtn: this.root.querySelector('#loop-btn'),
      qualityModeSelect: this.root.querySelector('#quality-mode-select'),
      densitySlider: this.root.querySelector('#density-slider'),
      sizeSlider: this.root.querySelector('#size-slider'),
      paletteSelect: this.root.querySelector('#palette-select'),
      statusDot: this.root.querySelector('#status-dot'),
      statusText: this.root.querySelector('#status-text'),
      qualityPill: this.root.querySelector('#quality-pill'),
      trackName: this.root.querySelector('#track-name'),
      trackDetail: this.root.querySelector('#track-detail'),
      meterBass: this.root.querySelector('#meter-bass'),
      meterMid: this.root.querySelector('#meter-mid'),
      meterTreble: this.root.querySelector('#meter-treble'),
      message: this.root.querySelector('#hud-message'),
    };

    this.elements.qualityModeSelect.value = initialQualityMode;
    this.setQualityTier(initialTier);
    this.#bindControls();
  }

  setQualityTier(tier, mode = this.qualityMode) {
    this.qualityMode = mode;
    this.elements.qualityPill.textContent =
      mode === 'auto' ? `${tier.toUpperCase()} / AUTO` : `${tier.toUpperCase()} / MANUAL`;
  }

  updateState(state) {
    this.currentState = state;
    const { isLoaded, isPlaying, currentTime, duration, volume, muted, rate, loop, trackName } = state;

    this.elements.statusDot.classList.toggle('is-live', isPlaying);
    this.elements.statusText.textContent = isPlaying ? 'LIVE' : isLoaded ? 'PAUSED' : 'IDLE';
    this.elements.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    this.elements.trackName.textContent = trackName || 'No track loaded';
    this.elements.trackDetail.textContent = isLoaded
      ? `${formatTime(currentTime)} / ${formatTime(duration)}`
      : 'Upload an audio file to begin';
    this.elements.timeCurrent.textContent = formatTime(currentTime);
    this.elements.timeTotal.textContent = formatTime(duration);
    this.elements.muteBtn.textContent = muted ? 'Unmute' : 'Mute';
    this.elements.loopBtn.classList.toggle('is-active', loop);
    this.elements.muteBtn.classList.toggle('is-active', muted);
    this.elements.loopBtn.textContent = loop ? 'Loop On' : 'Loop';

    this.elements.volumeSlider.value = String(volume);
    this.elements.rateSelect.value = String(rate);

    const enablePlayback = isLoaded;
    this.elements.playPauseBtn.disabled = !enablePlayback;
    this.elements.backBtn.disabled = !enablePlayback;
    this.elements.forwardBtn.disabled = !enablePlayback;
    this.elements.seekSlider.disabled = !enablePlayback;
    this.elements.volumeSlider.disabled = !enablePlayback;
    this.elements.muteBtn.disabled = !enablePlayback;
    this.elements.rateSelect.disabled = !enablePlayback;
    this.elements.loopBtn.disabled = !enablePlayback;

    if (!this.isScrubbing) {
      const sliderValue = duration > 0 ? Math.floor((currentTime / duration) * 1000) : 0;
      this.elements.seekSlider.value = String(clamp(sliderValue, 0, 1000));
    }
  }

  refresh(state, analysisFrame) {
    if (!this.isScrubbing) {
      this.updateState(state);
    } else {
      this.elements.timeTotal.textContent = formatTime(state.duration);
    }

    const bass = Math.round((analysisFrame?.bass ?? 0) * 100);
    const mid = Math.round((analysisFrame?.mid ?? 0) * 100);
    const treble = Math.round((analysisFrame?.treble ?? 0) * 100);

    this.elements.meterBass.style.width = `${bass}%`;
    this.elements.meterMid.style.width = `${mid}%`;
    this.elements.meterTreble.style.width = `${treble}%`;
  }

  setMessage(text, type = 'info') {
    this.elements.message.textContent = text;
    this.elements.message.dataset.type = type;
  }

  dispose() {
    window.removeEventListener('keydown', this.onWindowKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
  }

  #bindControls() {
    this.elements.uploadBtn.addEventListener('click', () => {
      this.elements.fileInput.click();
    });

    this.elements.fileInput.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }

      try {
        await this.audioEngine.loadFile(file);
        this.setMessage(`Loaded ${file.name}`);
      } catch {
        this.setMessage('Unable to load selected file.', 'error');
      } finally {
        this.elements.fileInput.value = '';
      }
    });

    this.elements.playPauseBtn.addEventListener('click', async () => {
      try {
        await this.audioEngine.togglePlay();
      } catch {
        this.setMessage('Playback action failed. Try again.', 'error');
      }
    });

    this.elements.backBtn.addEventListener('click', () => {
      this.audioEngine.skip(-10);
    });

    this.elements.forwardBtn.addEventListener('click', () => {
      this.audioEngine.skip(10);
    });

    this.elements.seekSlider.addEventListener('pointerdown', () => {
      this.isScrubbing = true;
    });

    const scrubToSliderTime = () => {
      const duration = this.currentState.duration || 0;
      if (duration <= 0) {
        return;
      }

      const ratio = Number(this.elements.seekSlider.value) / 1000;
      const seekTarget = duration * clamp(ratio, 0, 1);
      this.audioEngine.seek(seekTarget);
      this.elements.timeCurrent.textContent = formatTime(seekTarget);
    };

    this.elements.seekSlider.addEventListener('input', scrubToSliderTime);

    this.onWindowPointerUp = () => {
      this.isScrubbing = false;
    };
    window.addEventListener('pointerup', this.onWindowPointerUp);

    this.elements.volumeSlider.addEventListener('input', () => {
      this.audioEngine.setVolume(Number(this.elements.volumeSlider.value));
    });

    this.elements.muteBtn.addEventListener('click', () => {
      this.audioEngine.toggleMute();
    });

    this.elements.rateSelect.addEventListener('change', () => {
      this.audioEngine.setPlaybackRate(Number(this.elements.rateSelect.value));
    });

    this.elements.loopBtn.addEventListener('click', () => {
      this.audioEngine.setLoop(!this.currentState.loop);
    });

    this.elements.qualityModeSelect.addEventListener('change', () => {
      const mode = this.elements.qualityModeSelect.value;
      this.qualityMode = mode;
      this.onQualityModeChange(mode);
    });

    this.elements.densitySlider.addEventListener('input', () => {
      const normalized = Number(this.elements.densitySlider.value) / 100;
      this.onDensityChange(normalized);
    });

    this.elements.sizeSlider.addEventListener('input', () => {
      const normalized = Number(this.elements.sizeSlider.value) / 100;
      this.onSizeChange(normalized);
    });

    this.elements.paletteSelect.addEventListener('change', () => {
      this.onPaletteChange(this.elements.paletteSelect.value);
    });

    this.onWindowKeyDown = async (event) => {
      const targetTag = event.target?.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(targetTag)) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        try {
          await this.audioEngine.togglePlay();
        } catch {
          this.setMessage('Playback action failed. Try again.', 'error');
        }
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        this.audioEngine.skip(-10);
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        this.audioEngine.skip(10);
      } else if (event.key?.toLowerCase() === 'm') {
        event.preventDefault();
        this.audioEngine.toggleMute();
      }
    };

    window.addEventListener('keydown', this.onWindowKeyDown);
  }
}
