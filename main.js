/**
 * STROBILATION — Procedural Ocean Engine
 * A Three.js simulation of ocean ecosystem stress.
 * Architecture: Scene → JellyfishSwarm (InstancedMesh) + FishSchool + WaterVolume
 */

// ─────────────────────────────────────────────
// GLSL SHADER LIBRARY
// ─────────────────────────────────────────────

const WaterVertexShader = `
  uniform float uTime;
  uniform float uNitrogen;
  uniform float uMicroplastics;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDepth;

  // Simplex-style hash
  vec3 hash3(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.zxy, p.yxz + 19.19);
    return fract(vec3(p.x * p.y, p.z * p.x, p.y * p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
          mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x), f.y),
      mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
          mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vPosition = position;
    vNormal = normal;
    vDepth = (position.y + 30.0) / 60.0;

    vec3 pos = position;

    // Micro-plastic jitter — high freq noise on surface
    float jitter = uMicroplastics / 100.0;
    float n = noise(pos * 4.0 + uTime * 2.0);
    pos.y += n * jitter * 0.8;
    pos.x += noise(pos * 3.0 + uTime * 1.5) * jitter * 0.4;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WaterFragmentShader = `
  uniform float uTime;
  uniform float uNitrogen;
  uniform float uCO2;
  uniform float uMicroplastics;
  uniform float uHypoxia;
  uniform float uAnoxia;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying float vDepth;

  void main() {
    // Color based on nitrogen
    float n = uNitrogen / 100.0;
    vec3 deepBlue   = vec3(0.01, 0.04, 0.18);
    vec3 murkyGreen = vec3(0.04, 0.14, 0.08);
    vec3 deadGray   = vec3(0.02, 0.02, 0.02);

    vec3 waterCol = mix(deepBlue, murkyGreen, smoothstep(0.0, 1.0, n));
    waterCol = mix(waterCol, deadGray, uAnoxia);

    // Depth fog
    float fog = 1.0 - vDepth;
    waterCol = mix(waterCol, waterCol * 0.2, fog * 0.6);

    // Subtle shimmer
    float shimmer = sin(vPosition.x * 8.0 + uTime) * sin(vPosition.z * 6.0 + uTime * 0.7) * 0.03;
    waterCol += shimmer;

    float alpha = mix(0.55, 0.85, uHypoxia);
    gl_FragColor = vec4(waterCol, alpha);
  }
`;

// ── Jellyfish Bell Shader ──
const JellyfishBellVertex = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMicroplastics;

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Mikroplastik etkisi: Hafif titreme
    if(uMicroplastics > 0.0) {
        pos.x += sin(uTime * 10.0) * (uMicroplastics / 500.0);
    }
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const JellyfishBellFragment = `
  uniform sampler2D uTexture;
  uniform float uBioluminescent;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Arka planı şeffaf olan PNG'ler için alpha kontrolü
    if(texColor.a < 0.1) discard;

    vec3 finalColor = texColor.rgb;

    // Bioluminescent (Anoxia) modu: Renkleri neon mavi/yeşile kaydır
    if(uBioluminescent > 0.1) {
        vec3 bioColor = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), sin(uTime) * 0.5 + 0.5);
        finalColor = mix(finalColor, bioColor, uBioluminescent);
    }

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

// ── Tentacle Shader ──
const TentacleVertex = `
  uniform float uTime;
  uniform float uPulse;
  uniform float uMicroplastics;
  uniform float uHypoxia;

  attribute float aPhase;
  attribute float aRadius;

  varying float vAlpha;

  vec3 hash3(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.zxy, p.yxz + 19.19);
    return fract(vec3(p.x * p.y, p.z * p.x, p.y * p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
          mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x), f.y),
      mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
          mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 pos = position;

    float t = pos.y; // goes from 0 (top) to -1 (tip)
    float depth = -t; // 0 at top, 1 at tip

    // Slow-down in hypoxia
    float speed = mix(1.0, 0.2, uHypoxia);

    // Smooth wave — normal behavior
    float wave = sin(uTime * speed * 1.2 + aPhase + depth * 3.0) * 0.2 * depth;
    float wave2 = cos(uTime * speed * 0.8 + aPhase * 1.5 + depth * 2.0) * 0.12 * depth;

    // Microplastic jitter — high frequency noise replacing smooth sine
    float jitter = uMicroplastics / 100.0;
    float hiFreqNoise = noise(pos * 8.0 + vec3(uTime * 6.0 * speed, aPhase, 0.0)) - 0.5;
    float wave_x = mix(wave, hiFreqNoise * 0.3, jitter);
    float wave_z = mix(wave2, noise(pos * 7.0 + vec3(0.0, uTime * 5.0 * speed, aPhase)) * 0.25 - 0.125, jitter);

    pos.x += wave_x;
    pos.z += wave_z;

    vAlpha = depth;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const TentacleFragment = `
  uniform float uBioluminescent;
  uniform vec3 uColor;
  uniform float uTime;

  varying float vAlpha;

  void main() {
    vec3 normalColor = uColor;
    vec3 bioColor = mix(vec3(0.0, 1.0, 0.85), vec3(0.2, 1.0, 0.05), sin(uTime + vAlpha * 4.0) * 0.5 + 0.5);

    vec3 col = mix(normalColor, bioColor, uBioluminescent);
    float alpha = (1.0 - vAlpha * 0.7) * mix(0.5, 0.9, uBioluminescent);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Fish Shader ──
const FishVertex = `
  uniform float uTime;
  uniform float uCO2;
  uniform float uHypoxia;

  attribute float aPhase;

  varying float vDissolve;

  void main() {
    vec3 pos = position;
    float dissolve = uCO2 / 100.0;
    vDissolve = dissolve;

    float speed = mix(1.0, 0.15, uHypoxia);

    // Schooling swim motion
    pos.x += sin(uTime * speed * 1.5 + aPhase) * 0.08;
    pos.y += cos(uTime * speed * 0.9 + aPhase * 1.3) * 0.05;

    // CO2 dissolve jitter
    if (dissolve > 0.2) {
      float jitter = dissolve * 0.3;
      pos.x += (fract(sin(dot(pos.xz, vec2(127.1, 311.7))) * 43758.5453) - 0.5) * jitter;
      pos.y += (fract(sin(dot(pos.yz, vec2(269.5, 183.3))) * 43758.5453) - 0.5) * jitter;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FishFragment = `
  uniform float uCO2;
  uniform float uTime;

  varying float vDissolve;

  void main() {
    float dissolve = vDissolve;

    // Pixel discard for dissolve effect
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (noise < dissolve * 0.8) discard;

    vec3 fishColor = mix(vec3(0.8, 0.9, 1.0), vec3(0.2, 0.4, 0.5), dissolve);
    float alpha = 1.0 - dissolve * 0.9;

    gl_FragColor = vec4(fishColor, alpha);
  }
`;

// ─────────────────────────────────────────────
// SCENE PARAMETERS
// ─────────────────────────────────────────────

const params = {
  nitrogen: 0,
  co2: 0,
  microplastics: 0,
};

// ─────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────

class StrobulationEngine {
  constructor() {

    this.textureLoader = new THREE.TextureLoader();
    this.jellyTexture = this.textureLoader.load('jellyfish01.png'); // Resim dosyanın adını buraya yaz

    this.clock = new THREE.Clock();
    this.time = 0;

    this.jellyfishGroup = null;
    this.jellyInstances = [];
    this.fishMeshes = [];
    this.waterMesh = null;

    this.totalStress = 0;
    this.systemState = 'NOMINAL';

    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._buildWater();
    this._buildFishSchool();
    this._buildJellyfishSwarm(3);
    this._setupControls();
    this._loop();
  }

  // ── Renderer ──────────────────────────────
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x050508, 1);
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ── Scene ─────────────────────────────────
  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050508, 0.018);
  }

  // ── Camera — 45° surveillance ──────────────
  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(0, 35, 55);
    this.camera.lookAt(0, 0, 0);
  }

  // ── Water Volume ───────────────────────────
  _buildWater() {
    const geo = new THREE.BoxGeometry(120, 60, 120, 48, 24, 48);
    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WaterVertexShader,
      fragmentShader: WaterFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uNitrogen: { value: 0 },
        uCO2: { value: 0 },
        uMicroplastics: { value: 0 },
        uHypoxia: { value: 0 },
        uAnoxia: { value: 0 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.waterMesh = new THREE.Mesh(geo, this.waterMaterial);
    this.waterMesh.position.y = -5;
    this.scene.add(this.waterMesh);
  }

  // ── Fish School ────────────────────────────
  _buildFishSchool() {
    this.fishGroup = new THREE.Group();
    this.fishMeshes = [];

    const fishGeo = new THREE.TetrahedronGeometry(0.3, 0);
    this.fishMat = new THREE.ShaderMaterial({
      vertexShader: FishVertex,
      fragmentShader: FishFragment,
      uniforms: {
        uTime: { value: 0 },
        uCO2: { value: 0 },
        uHypoxia: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const FISH_COUNT = 60;
    // Add per-vertex phase attribute
    const phaseAttr = new Float32Array(fishGeo.attributes.position.count);
    for (let i = 0; i < phaseAttr.length; i++) phaseAttr[i] = Math.random() * Math.PI * 2;
    fishGeo.setAttribute('aPhase', new THREE.BufferAttribute(phaseAttr, 1));

    for (let i = 0; i < FISH_COUNT; i++) {
      const mesh = new THREE.Mesh(fishGeo, this.fishMat);
      mesh.position.set(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 20 - 5,
        (Math.random() - 0.5) * 50,
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      mesh.userData.phase = Math.random() * Math.PI * 2;
      mesh.userData.speedX = (Math.random() - 0.5) * 0.012;
      mesh.userData.speedZ = (Math.random() - 0.5) * 0.012;
      mesh.userData.range = 20 + Math.random() * 20;
      mesh.userData.originX = mesh.position.x;
      mesh.userData.originZ = mesh.position.z;
      this.fishMeshes.push(mesh);
      this.fishGroup.add(mesh);
    }

    this.scene.add(this.fishGroup);
  }

  // ── Jellyfish Swarm ────────────────────────
  _buildJellyfishSwarm(count) {
    // Remove existing
    if (this.jellyfishGroup) {
      this.scene.remove(this.jellyfishGroup);
    }

    this.jellyfishGroup = new THREE.Group();
    this.jellyInstances = [];

    for (let i = 0; i < count; i++) {
      const jelly = this._createJellyfish(i, count);
      this.jellyfishGroup.add(jelly.group);
      this.jellyInstances.push(jelly);
    }

    this.scene.add(this.jellyfishGroup);
  }

  _createJellyfish(index, total) {
    const group = new THREE.Group();

    // Konumlandırma (Mevcut kodla aynı mantık)
    const angle = (index / total) * Math.PI * 2 + Math.random() * 0.5;
    const radius = 5 + Math.random() * 30;
    group.position.set(
      Math.cos(angle) * radius,
      (Math.random() - 0.5) * 18,
      Math.sin(angle) * radius,
    );

    // Tek parça deniz anası için Plane (Düzlem) geometrisi
    // 3.0, 4.0 değerlerini resminin en-boy oranına göre değiştirebilirsin
    const geo = new THREE.PlaneGeometry(3.0, 4.0);

    const mat = new THREE.ShaderMaterial({
      vertexShader: JellyfishBellVertex,
      fragmentShader: JellyfishBellFragment,
      uniforms: {
        uTexture: { value: this.jellyTexture },
        uTime: { value: 0 },
        uBioluminescent: { value: 0 },
        uMicroplastics: { value: 0 }
      },
      transparent: true,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Resmin kameraya bakması için (opsiyonel)
    mesh.rotation.x = 0;

    group.add(mesh);

    return {
      group,
      allMats: [mat],
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: 0.003 + Math.random() * 0.005,
      // Diğer eski referansları boş dizi olarak geçiyoruz ki loop hata vermesin
      tentMats: []
    };
  }

  _buildTentacleGeo(segments, length) {
    const positions = [];
    const phases = [];

    for (let s = 0; s < segments; s++) {
      const y0 = -(s / segments) * length;
      const y1 = -((s + 1) / segments) * length;
      positions.push(0, y0, 0, 0, y1, 0);
      phases.push(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aRadius', new THREE.Float32BufferAttribute(phases.map(() => Math.random()), 1));
    return geo;
  }

  // ── Tweakpane Controls ─────────────────────
  _setupControls() {
    const pane = new Tweakpane.Pane({
      title: 'CONTROL MATRIX',
      container: document.getElementById('controls-container'),
    });

    pane.addInput(params, 'nitrogen', {
      label: 'NITROGEN',
      min: 0, max: 100, step: 1,
    }).on('change', () => this._onParamChange());

    pane.addInput(params, 'co2', {
      label: 'CO₂',
      min: 0, max: 100, step: 1,
    }).on('change', () => this._onParamChange());

    pane.addInput(params, 'microplastics', {
      label: 'MICROPLASTICS',
      min: 0, max: 100, step: 1,
    }).on('change', () => this._onParamChange());

    pane.addSeparator();
    pane.addMonitor(params, 'nitrogen', { label: 'N-LEVEL' });

    this._onParamChange();
  }

  // ── Parameter Change Handler ───────────────
  _onParamChange() {
    const { nitrogen, co2, microplastics } = params;
    this.totalStress = nitrogen + co2 + microplastics;

    // ── Determine system state ──
    const prevState = this.systemState;

    if (this.totalStress > 250) {
      this.systemState = 'ANOXIA / DEAD ZONE';
    } else if (this.totalStress > 150) {
      this.systemState = 'HYPOXIA';
    } else if (this.totalStress > 80) {
      this.systemState = 'STRESSED';
    } else {
      this.systemState = 'NOMINAL';
    }

    // ── Jellyfish count (nitrogen bloom) ──
    if (nitrogen > 50) {
      const t = (nitrogen - 50) / 50; // 0-1
      const count = Math.floor(3 + t * t * 47); // 3 to 50, exponential
      if (this.jellyInstances.length !== count) {
        this._buildJellyfishSwarm(count);
      }
    } else {
      if (this.jellyInstances.length !== 3) {
        this._buildJellyfishSwarm(3);
      }
    }

    // ── HUD updates ──
    const stateEl = document.getElementById('status-state');
    const stressEl = document.getElementById('status-stress');
    const entityEl = document.getElementById('status-entities');

    stateEl.textContent = this.systemState;
    stressEl.textContent = this.totalStress.toFixed(0);
    entityEl.textContent = this.jellyInstances.length + this.fishMeshes.length;

    stateEl.className = 'status-val';
    if (this.systemState === 'STRESSED') stateEl.classList.add('warn');
    if (this.systemState === 'HYPOXIA') stateEl.classList.add('danger');
    if (this.systemState === 'ANOXIA / DEAD ZONE') stateEl.classList.add('bio');

    // ── Anoxia overlay ──
    const overlay = document.getElementById('overlay-anoxia');
    if (this.systemState === 'ANOXIA / DEAD ZONE') {
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }

  // ── Main Animation Loop ────────────────────
  _loop() {
    requestAnimationFrame(() => this._loop());
    const delta = this.clock.getDelta();
    this.time += delta;

    const { nitrogen, co2, microplastics } = params;
    const hypoxia = this.totalStress > 150 ? (this.totalStress - 150) / 100 : 0;
    const anoxia = this.totalStress > 250 ? (this.totalStress - 250) / 50 : 0;
    const bioOn = Math.min(anoxia, 1.0);
    const speed = 1.0 - Math.min(hypoxia * 0.8, 0.8);

    // ── Update water ──
    if (this.waterMaterial) {
      const u = this.waterMaterial.uniforms;
      u.uTime.value = this.time;
      u.uNitrogen.value = nitrogen;
      u.uCO2.value = co2;
      u.uMicroplastics.value = microplastics;
      u.uHypoxia.value = Math.min(hypoxia, 1.0);
      u.uAnoxia.value = Math.min(anoxia, 1.0);
    }

    // ── Update fish ──
    const fishVisibility = 1.0 - Math.min(hypoxia, 1.0);
    this.fishGroup.visible = fishVisibility > 0.01;
    if (this.fishMat) {
      this.fishMat.uniforms.uTime.value = this.time;
      this.fishMat.uniforms.uCO2.value = co2;
      this.fishMat.uniforms.uHypoxia.value = Math.min(hypoxia, 1.0);
    }
    this.fishMeshes.forEach((fish) => {
      fish.position.x = fish.userData.originX + Math.sin(this.time * speed * 0.4 + fish.userData.phase) * fish.userData.range * 0.3;
      fish.position.z = fish.userData.originZ + Math.cos(this.time * speed * 0.3 + fish.userData.phase * 1.2) * fish.userData.range * 0.3;
      fish.position.y += Math.sin(this.time * speed + fish.userData.phase) * 0.005;
      fish.rotation.y += fish.userData.speedX * speed;
    });

    // ── Update jellyfish ──
    this.jellyInstances.forEach((jelly) => {
      const t = this.time * speed;

      // Drift
      jelly.driftAngle += jelly.driftSpeed * speed;
      jelly.group.position.x += Math.cos(jelly.driftAngle) * 0.01;
      jelly.group.position.z += Math.sin(jelly.driftAngle) * 0.008;
      jelly.group.position.y += Math.sin(t * jelly.speed + jelly.phase) * 0.006;

      // Wrap to scene bounds
      ['x', 'z'].forEach(axis => {
        if (Math.abs(jelly.group.position[axis]) > 50) {
          jelly.group.position[axis] *= -0.9;
        }
      });

      // Update all materials
      jelly.allMats.forEach(mat => {
        if (mat.uniforms) {
          mat.uniforms.uTime.value = t;
          mat.uniforms.uBioluminescent.value = bioOn;
          mat.uniforms.uMicroplastics.value = microplastics;
        }
      });
      jelly.tentMats.forEach(mat => {
        if (mat.uniforms?.uHypoxia) {
          mat.uniforms.uHypoxia.value = Math.min(hypoxia, 1.0);
        }
      });

      // Bioluminescent point light
      if (bioOn > 0.01) {
        jelly.light.color.setHSL(0.35 + Math.sin(t * 0.5) * 0.1, 1.0, 0.6);
        jelly.light.intensity = 1.5 + Math.sin(t * 2.0 + jelly.phase) * 0.5;
        jelly.light.distance = 12;
      } else {
        jelly.light.color.copy(jelly.bellMat.uniforms.uColor.value);
        jelly.light.intensity = 0.4 + Math.sin(t + jelly.phase) * 0.2;
        jelly.light.distance = 8;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }
}

// ── Boot ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  new StrobulationEngine();
});
