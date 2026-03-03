import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { QUALITY_PRESETS } from '../core/QualityManager.js';
import { ParticleField } from './ParticleField.js';

export class SceneController {
  constructor({ tier = 'medium' } = {}) {
    this.tier = tier;
    this.densityMultiplier = 1;
    this.pointSizeMultiplier = 1;
    this.palette = 'boris';
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.rootGroup = null;
    this.particleField = null;
    this.haloRing = null;
    this.innerRing = null;
    this.lastAnalysis = null;
    this.canvas = null;
  }

  init(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }

    const webgl2Context = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!webgl2Context) {
      return false;
    }

    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: webgl2Context,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080f);
    this.scene.fog = new THREE.Fog(0x07080f, 16, 64);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      120,
    );
    this.camera.position.set(0, 2.5, 20);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 36;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.7;

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(8.6, 0.03, 16, 240),
      new THREE.MeshBasicMaterial({
        color: 0x8f76ff,
        transparent: true,
        opacity: 0.24,
      }),
    );
    this.haloRing.rotation.x = Math.PI / 2.25;
    this.rootGroup.add(this.haloRing);

    this.innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, 0.02, 16, 240),
      new THREE.MeshBasicMaterial({
        color: 0x00ffd5,
        transparent: true,
        opacity: 0.22,
      }),
    );
    this.innerRing.rotation.x = Math.PI / 2.35;
    this.rootGroup.add(this.innerRing);

    this.particleField = new ParticleField(this.rootGroup, {
      count: QUALITY_PRESETS[this.tier].particleCount,
    });

    this.setQuality(this.tier);
    this.resize(window.innerWidth, window.innerHeight);
    return true;
  }

  setQuality(tier) {
    this.tier = tier;
    const preset = QUALITY_PRESETS[tier];
    if (!preset || !this.renderer) {
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dprCap));
    this.#applyParticleCountForTier();
  }

  setDensityMultiplier(value) {
    this.densityMultiplier = Math.min(Math.max(value, 0.25), 2);
    this.#applyParticleCountForTier();
  }

  setPointSizeMultiplier(value) {
    this.pointSizeMultiplier = Math.min(Math.max(value, 0.5), 2.2);
    this.particleField?.setSizeMultiplier(this.pointSizeMultiplier);
  }

  setPalette(palette) {
    this.palette = palette;
    this.particleField?.setPalette(palette);
  }

  updateAnalysis(frame) {
    this.lastAnalysis = frame;
  }

  render(deltaMs, elapsedSeconds) {
    if (!this.renderer || !this.scene || !this.camera || !this.rootGroup) {
      return;
    }

    const bass = this.lastAnalysis?.bass ?? 0;
    const peak = this.lastAnalysis?.peak ?? 0;

    this.particleField?.update(this.lastAnalysis, elapsedSeconds);

    const spinSpeed = 0.16 + bass * 0.92;
    this.rootGroup.rotation.y += spinSpeed * (deltaMs / 1000);
    this.rootGroup.rotation.x = Math.sin(elapsedSeconds * 0.32) * 0.24 + peak * 0.08;

    if (this.haloRing && this.innerRing) {
      this.haloRing.rotation.z += (0.08 + peak * 0.22) * (deltaMs / 1000);
      this.innerRing.rotation.z -= (0.11 + bass * 0.28) * (deltaMs / 1000);
      this.haloRing.material.opacity = 0.1 + peak * 0.4;
      this.innerRing.material.opacity = 0.12 + bass * 0.34;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    if (!this.renderer || !this.camera || !width || !height) {
      return;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    this.particleField?.dispose();
    this.controls?.dispose();

    if (this.haloRing) {
      this.haloRing.geometry.dispose();
      this.haloRing.material.dispose();
    }

    if (this.innerRing) {
      this.innerRing.geometry.dispose();
      this.innerRing.material.dispose();
    }

    this.renderer?.dispose();

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.rootGroup = null;
    this.haloRing = null;
    this.innerRing = null;
    this.particleField = null;
  }

  #applyParticleCountForTier() {
    const preset = QUALITY_PRESETS[this.tier];
    if (!preset || !this.particleField) {
      return;
    }

    const adjustedCount = Math.floor(preset.particleCount * this.densityMultiplier);
    this.particleField.setCount(Math.max(500, adjustedCount));
    this.particleField.setSizeMultiplier(this.pointSizeMultiplier);
    this.particleField.setPalette(this.palette);
  }
}
