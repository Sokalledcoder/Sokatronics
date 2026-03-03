export const QUALITY_PRESETS = {
  high: {
    particleCount: 12000,
    fftSize: 2048,
    dprCap: 2,
    smoothing: 0.84,
    noiseOpacity: 0.03,
    scanlineOpacity: 0.2,
  },
  medium: {
    particleCount: 7000,
    fftSize: 1024,
    dprCap: 1.5,
    smoothing: 0.82,
    noiseOpacity: 0.024,
    scanlineOpacity: 0.16,
  },
  low: {
    particleCount: 3500,
    fftSize: 512,
    dprCap: 1,
    smoothing: 0.8,
    noiseOpacity: 0.018,
    scanlineOpacity: 0.12,
  },
};

const TIERS = ['low', 'medium', 'high'];

export class QualityManager {
  constructor() {
    this.currentTier = this.#resolveInitialTier();
    this.lastTierSwitchMs = performance.now();
    this.lowFpsSince = 0;
    this.highFpsSince = 0;
    this.samples = [];
    this.maxSamples = 180;
    this.cooldownMs = 10000;
    this.lowThresholdFps = 30;
    this.highThresholdFps = 55;
    this.lowPersistMs = 3000;
    this.highPersistMs = 8000;
  }

  getCurrentTier() {
    return this.currentTier;
  }

  reportFrame(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) {
      return null;
    }

    this.samples.push(frameMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    const avgFrameMs = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    const avgFps = 1000 / avgFrameMs;
    const now = performance.now();

    if (avgFps < this.lowThresholdFps) {
      if (!this.lowFpsSince) {
        this.lowFpsSince = now;
      }
      this.highFpsSince = 0;

      if (
        now - this.lowFpsSince >= this.lowPersistMs &&
        now - this.lastTierSwitchMs >= this.cooldownMs
      ) {
        return this.#shiftTier(-1, now);
      }
      return null;
    }

    if (avgFps > this.highThresholdFps) {
      if (!this.highFpsSince) {
        this.highFpsSince = now;
      }
      this.lowFpsSince = 0;

      if (
        now - this.highFpsSince >= this.highPersistMs &&
        now - this.lastTierSwitchMs >= this.cooldownMs
      ) {
        return this.#shiftTier(1, now);
      }
      return null;
    }

    this.lowFpsSince = 0;
    this.highFpsSince = 0;
    return null;
  }

  #shiftTier(direction, now) {
    const currentIndex = TIERS.indexOf(this.currentTier);
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), TIERS.length - 1);
    if (nextIndex === currentIndex) {
      this.lowFpsSince = 0;
      this.highFpsSince = 0;
      return null;
    }

    this.currentTier = TIERS[nextIndex];
    this.lastTierSwitchMs = now;
    this.lowFpsSince = 0;
    this.highFpsSince = 0;
    this.samples = [];
    return this.currentTier;
  }

  #resolveInitialTier() {
    const cores = navigator.hardwareConcurrency ?? 4;
    const dpr = window.devicePixelRatio ?? 1;
    const pixelArea = window.innerWidth * window.innerHeight;

    let score = 0;

    if (cores >= 8) {
      score += 2;
    } else if (cores >= 4) {
      score += 1;
    } else if (cores <= 2) {
      score -= 1;
    }

    if (dpr >= 2) {
      score += 1;
    } else if (dpr <= 1) {
      score -= 1;
    }

    if (pixelArea >= 1920 * 1080) {
      score += 1;
    } else if (pixelArea <= 800 * 600) {
      score -= 1;
    }

    if (score >= 3) {
      return 'high';
    }
    if (score <= -1) {
      return 'low';
    }
    return 'medium';
  }
}
