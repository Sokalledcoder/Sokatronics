import * as THREE from 'three';

const GOLD = { r: 1, g: 0.84, b: 0.12 };
const PALETTES = {
  boris: [
    { r: 0, g: 1, b: 0.84 },
    { r: 0.7, g: 0.45, b: 1 },
    { r: 1, g: 0.26, b: 0.7 },
  ],
  neon: [
    { r: 0.1, g: 0.95, b: 1 },
    { r: 0.42, g: 1, b: 0.35 },
    { r: 1, g: 0.18, b: 0.6 },
  ],
  sunset: [
    { r: 1, g: 0.5, b: 0.2 },
    { r: 1, g: 0.26, b: 0.45 },
    { r: 0.98, g: 0.78, b: 0.24 },
  ],
  ice: [
    { r: 0.78, g: 0.92, b: 1 },
    { r: 0.62, g: 0.78, b: 1 },
    { r: 0.88, g: 0.88, b: 0.98 },
  ],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export class ParticleField {
  constructor(parentGroup, { count = 7000 } = {}) {
    this.parentGroup = parentGroup;
    this.count = 0;
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positionAttribute = null;
    this.colorAttribute = null;

    this.basePositions = new Float32Array(0);
    this.positions = new Float32Array(0);
    this.baseColors = new Float32Array(0);
    this.colors = new Float32Array(0);
    this.phases = new Float32Array(0);
    this.binIndices = new Uint16Array(0);
    this.colorSeeds = new Float32Array(0);
    this.sizeMultiplier = 1;
    this.palette = 'boris';

    this.setCount(count);
  }

  setCount(nextCount) {
    if (nextCount === this.count) {
      return;
    }

    this.dispose();
    this.count = nextCount;

    this.basePositions = new Float32Array(nextCount * 3);
    this.positions = new Float32Array(nextCount * 3);
    this.baseColors = new Float32Array(nextCount * 3);
    this.colors = new Float32Array(nextCount * 3);
    this.phases = new Float32Array(nextCount);
    this.binIndices = new Uint16Array(nextCount);
    this.colorSeeds = new Float32Array(nextCount);

    this.#seedParticles();
    this.#applyPalette();
    this.#buildPoints();
  }

  setSizeMultiplier(value) {
    this.sizeMultiplier = clamp(value, 0.5, 2.2);
  }

  setPalette(name) {
    this.palette = PALETTES[name] ? name : 'boris';
    if (!this.baseColors.length) {
      return;
    }
    this.#applyPalette();
    if (this.colorAttribute) {
      this.colorAttribute.needsUpdate = true;
    }
  }

  update(analysis, elapsedSeconds) {
    if (!this.points || !this.positionAttribute || !this.colorAttribute) {
      return;
    }

    const bins = analysis?.bins ?? new Uint8Array(0);
    const binsLength = bins.length;
    const peak = analysis?.peak ?? 0;
    const mid = analysis?.mid ?? 0;
    const rms = analysis?.rms ?? 0;

    const wobbleScale = 0.06 + mid * 0.36;

    for (let i = 0; i < this.count; i += 1) {
      const offset = i * 3;
      const phase = this.phases[i] + elapsedSeconds * 0.45;
      const mappedIndex = binsLength
        ? Math.floor((this.binIndices[i] / 511) * (binsLength - 1))
        : 0;
      const energy = binsLength ? bins[mappedIndex] / 255 : 0;

      const pulse =
        1 +
        energy * 1.6 +
        Math.sin(phase + energy * 8.5) * wobbleScale +
        Math.cos(phase * 0.7) * 0.05;

      this.positions[offset] = this.basePositions[offset] * pulse;
      this.positions[offset + 1] = this.basePositions[offset + 1] * pulse;
      this.positions[offset + 2] = this.basePositions[offset + 2] * pulse;

      const luminance = 0.2 + energy * 1.05;
      const goldBlend = peak > 0.88 ? clamp((energy - 0.7) * 1.6, 0, 0.45) : 0;

      const baseR = this.baseColors[offset];
      const baseG = this.baseColors[offset + 1];
      const baseB = this.baseColors[offset + 2];

      this.colors[offset] = clamp(baseR * luminance * (1 - goldBlend) + GOLD.r * goldBlend, 0, 1);
      this.colors[offset + 1] = clamp(
        baseG * luminance * (1 - goldBlend) + GOLD.g * goldBlend,
        0,
        1,
      );
      this.colors[offset + 2] = clamp(
        baseB * luminance * (1 - goldBlend) + GOLD.b * goldBlend,
        0,
        1,
      );
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;

    this.material.size = (0.06 + rms * 0.17 + peak * 0.1) * this.sizeMultiplier;
    this.material.opacity = 0.56 + peak * 0.38;
  }

  dispose() {
    if (!this.points) {
      return;
    }

    this.parentGroup.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();

    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positionAttribute = null;
    this.colorAttribute = null;
  }

  #seedParticles() {
    for (let i = 0; i < this.count; i += 1) {
      const offset = i * 3;
      const radius = 5 + Math.random() * 7.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      this.basePositions[offset] = x;
      this.basePositions[offset + 1] = y;
      this.basePositions[offset + 2] = z;
      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;

      this.colorSeeds[i] = Math.random();
      this.phases[i] = Math.random() * Math.PI * 2;
      this.binIndices[i] = Math.floor(Math.random() * 512);
    }
  }

  #applyPalette() {
    const palette = PALETTES[this.palette] || PALETTES.boris;
    for (let i = 0; i < this.count; i += 1) {
      const offset = i * 3;
      const seed = this.colorSeeds[i];
      const color =
        seed > 0.72 ? palette[2]
          : seed > 0.36 ? palette[1]
            : palette[0];

      this.baseColors[offset] = color.r;
      this.baseColors[offset + 1] = color.g;
      this.baseColors[offset + 2] = color.b;
      this.colors[offset] = color.r;
      this.colors[offset + 1] = color.g;
      this.colors[offset + 2] = color.b;
    }
  }

  #buildPoints() {
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);

    this.material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.parentGroup.add(this.points);
  }
}
