import './styles/theme.css';
import './styles/app.css';
import { AudioEngine } from './audio/AudioEngine.js';
import { QualityManager, QUALITY_PRESETS } from './core/QualityManager.js';
import { OverlayController } from './ui/OverlayController.js';
import { SceneController } from './visualizer/SceneController.js';

const canvas = document.querySelector('#visualizer-canvas');
const hud = document.querySelector('#hud-panel');
const fallbackCard = document.querySelector('#fallback-card');

const qualityManager = new QualityManager();
let qualityMode = 'auto';
const audioEngine = new AudioEngine({
  fftSize: QUALITY_PRESETS[qualityManager.getCurrentTier()].fftSize,
});
const overlayController = new OverlayController(hud, audioEngine, {
  initialTier: qualityManager.getCurrentTier(),
  initialQualityMode: qualityMode,
  onQualityModeChange: (mode) => {
    qualityMode = mode;
    const targetTier = mode === 'auto' ? qualityManager.getCurrentTier() : mode;
    applyTier(targetTier, true);
  },
  onDensityChange: (value) => {
    sceneController.setDensityMultiplier(value);
  },
  onSizeChange: (value) => {
    sceneController.setPointSizeMultiplier(value);
  },
  onPaletteChange: (palette) => {
    sceneController.setPalette(palette);
  },
});
const sceneController = new SceneController({
  tier: qualityManager.getCurrentTier(),
});

let webglReady = false;
let animationHandle = null;
let lastFrameTime = performance.now();

function applyTier(tier, showStatus = false) {
  const preset = QUALITY_PRESETS[tier];

  audioEngine.setFftSize(preset.fftSize);
  audioEngine.setSmoothing(preset.smoothing);
  sceneController.setQuality(tier);
  overlayController.setQualityTier(tier, qualityMode);

  document.documentElement.style.setProperty(
    '--noise-opacity',
    String(preset.noiseOpacity),
  );
  document.documentElement.style.setProperty(
    '--scanline-opacity',
    String(preset.scanlineOpacity),
  );

  if (showStatus) {
    if (qualityMode === 'auto') {
      overlayController.setMessage(`Adaptive quality set to ${tier.toUpperCase()}.`);
    } else {
      overlayController.setMessage(`Quality locked to ${tier.toUpperCase()}.`);
    }
  }
}

function startRenderLoop() {
  const tick = (now) => {
    const deltaMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    const analysisFrame = audioEngine.sampleAnalysis();
    sceneController.updateAnalysis(analysisFrame);

    if (webglReady) {
      sceneController.render(deltaMs, now * 0.001);
      if (qualityMode === 'auto') {
        const nextTier = qualityManager.reportFrame(deltaMs);
        if (nextTier) {
          applyTier(nextTier, true);
        }
      }
    }

    overlayController.refresh(audioEngine.getState(), analysisFrame);
    animationHandle = window.requestAnimationFrame(tick);
  };

  animationHandle = window.requestAnimationFrame(tick);
}

function setupFallback(message) {
  fallbackCard.textContent = message;
  fallbackCard.classList.remove('hidden');
  overlayController.setMessage(
    'WebGL2 unavailable. Audio controls remain active; 3D visualizer disabled.',
    'warning',
  );
}

function setupRuntime() {
  overlayController.updateState(audioEngine.getState());

  audioEngine.addEventListener('statechange', (event) => {
    overlayController.updateState(event.detail);
  });

  audioEngine.addEventListener('error', (event) => {
    overlayController.setMessage(event.detail.message, 'error');
  });

  if (!sceneController.init(canvas)) {
    setupFallback('WebGL2 is not available on this system.');
    webglReady = false;
  } else {
    webglReady = true;
    overlayController.setMessage('WebGL2 ready. Upload a track to begin.');
  }

  applyTier(qualityManager.getCurrentTier(), false);

  window.addEventListener('resize', () => {
    sceneController.resize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('beforeunload', () => {
    if (animationHandle) {
      window.cancelAnimationFrame(animationHandle);
    }
    overlayController.dispose();
    sceneController.dispose();
    audioEngine.dispose();
  });

  startRenderLoop();
}

setupRuntime();
