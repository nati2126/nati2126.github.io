/*
  Hero scene: a surface-sampled point cloud that morphs between primitives.
  A scan plane sweeps through it, and a 2D detection box tracks the object by
  projecting its 3D bounding box to screen space every frame.
*/
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

const COUNT = 9000;
const RADIUS = 1.5;          // every shape is normalised to this bounding radius
const HOLD_MS = 5200;        // time a shape is held before morphing
const MORPH_MS = 1700;
const SCAN_MS = 3400;        // one sweep of the scan plane
const SCAN_GAP_MS = 1400;
const PROBES = 360;          // points projected per frame to fit the detection box

const SHAPES = [
  { name: 'torus_knot',  score: 0.97, geo: () => new THREE.TorusKnotGeometry(1, 0.3, 220, 32) },
  { name: 'icosahedron', score: 0.94, geo: () => new THREE.IcosahedronGeometry(1.4, 0) },
  { name: 'torus',       score: 0.96, geo: () => new THREE.TorusGeometry(1.1, 0.42, 48, 140) },
  { name: 'capsule',     score: 0.92, geo: () => new THREE.CapsuleGeometry(0.62, 1.3, 12, 32) },
];

const vertexShader = /* glsl */`
  uniform float uMorph;
  uniform float uTime;
  uniform float uScan;
  uniform float uSize;
  uniform float uDist;
  attribute vec3 aTarget;
  attribute float aRand;
  varying float vScan;
  varying float vDepth;

  void main() {
    // staggered, eased morph so the cloud dissolves rather than slides
    float t = clamp((uMorph - aRand * 0.35) / 0.65, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aTarget, t);

    float burst = sin(t * 3.14159265);
    vec3 dir = normalize(p + vec3(1e-4));
    p += dir * burst * (0.15 + aRand * 0.45);
    p += dir * sin(uTime * 1.3 + aRand * 6.2831) * 0.006;

    vec4 world = modelMatrix * vec4(p, 1.0);

    float d = world.y - uScan;
    float band = 1.0 - smoothstep(0.0, 0.045, abs(d));
    float trail = d > 0.0 ? exp(-d * 5.0) * 0.45 : 0.0;
    vScan = max(band, trail);

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    float depth = uDist / -mv.z;
    vDepth = smoothstep(0.78, 1.22, depth);
    gl_PointSize = uSize * depth * (1.0 + band * 1.1);
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform float uAlpha;
  varying float vScan;
  varying float vDepth;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c);
    if (r > 0.25) discard;
    float edge = 1.0 - smoothstep(0.16, 0.25, r);

    vec3 col = mix(uInk, uAccent, vScan);
    float a = mix(0.22, 0.9, vDepth) * uAlpha;
    a = max(a, vScan * 0.95);
    gl_FragColor = vec4(col, a * edge);
  }
`;

function sampleShape(shape) {
  const geometry = shape.geo().toNonIndexed();
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)).build();
  const out = new Float32Array(COUNT * 3);
  const v = new THREE.Vector3();
  let maxLen = 0;

  for (let i = 0; i < COUNT; i++) {
    sampler.sample(v);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    maxLen = Math.max(maxLen, v.length());
  }

  const s = RADIUS / maxLen;
  for (let i = 0; i < out.length; i++) out[i] *= s;
  geometry.dispose();

  // a sparse subset is enough to fit a tight 2D box each frame
  const probe = new Float32Array(PROBES * 3);
  const step = Math.floor(COUNT / PROBES);
  for (let i = 0; i < PROBES; i++) probe.set(out.subarray(i * step * 3, i * step * 3 + 3), i * 3);
  return { positions: out, probe };
}

function cssColor(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || '#888');
}

function init() {
  const stage = document.querySelector('.stage');
  const canvas = document.getElementById('scene');
  if (!stage || !canvas) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    stage.classList.add('no-webgl');
    return;
  }
  renderer.setClearColor(0x000000, 0);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // ─── Data ─────────────────────────────────────────────
  const clouds = SHAPES.map(sampleShape);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(clouds[0].positions.slice(), 3);
  const tgtAttr = new THREE.BufferAttribute(clouds[0].positions.slice(), 3);
  const rand = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) rand[i] = Math.random();
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aTarget', tgtAttr);
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 1.6);

  const uniforms = {
    uMorph:  { value: 1 },
    uTime:   { value: 0 },
    uScan:   { value: 99 },
    uSize:   { value: 2.4 * pixelRatio },
    uDist:   { value: 7 },
    uAlpha:  { value: 1 },
    uInk:    { value: cssColor('--scene-ink') },
    uAccent: { value: cssColor('--accent') },
  };

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.rotation.set(0.35, 0.6, 0);
  scene.add(points);

  document.addEventListener('themechange', () => {
    // CSS variables update synchronously when the attribute changes
    uniforms.uInk.value.copy(cssColor('--scene-ink'));
    uniforms.uAccent.value.copy(cssColor('--accent'));
  });

  // ─── HUD ──────────────────────────────────────────────
  const det = document.getElementById('det');
  const detClass = document.getElementById('det-class');
  const detScore = document.getElementById('det-score');
  const hudFps = document.getElementById('hud-fps');
  const hudPts = document.getElementById('hud-pts');
  const hudFrame = document.getElementById('hud-frame');
  const hudId = document.getElementById('hud-id');
  hudPts.textContent = COUNT.toLocaleString('en-US');

  // ─── Sizing ───────────────────────────────────────────
  let width = 1, height = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    // fit the bounding sphere (plus room for the label) in both directions
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const fitR = RADIUS * 1.32;
    const dist = Math.max(fitR / Math.sin(vHalf), fitR / Math.sin(hHalf));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    uniforms.uDist.value = dist;
    // keep apparent density similar across viewport sizes
    uniforms.uSize.value = THREE.MathUtils.clamp(height / 260, 1.6, 2.8) * pixelRatio;
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ─── Interaction ──────────────────────────────────────
  let dragging = false;
  let lastX = 0, lastY = 0, downX = 0, downY = 0;
  let velY = 0, velX = 0;
  let tiltTarget = 0.35;
  let pointerTilt = 0;

  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      velY = dx * 0.006;
      velX = dy * 0.004;
      points.rotation.y += velY;
      tiltTarget = THREE.MathUtils.clamp(tiltTarget + velX, -0.6, 1.2);
      lastX = e.clientX; lastY = e.clientY;
    } else if (e.pointerType === 'mouse') {
      const r = stage.getBoundingClientRect();
      pointerTilt = ((e.clientY - r.top) / r.height - 0.5) * 0.25;
    }
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    // a click without much movement skips to the next shape
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 4 && !morph.active) startMorph();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', () => { dragging = false; stage.classList.remove('is-dragging'); });
  stage.addEventListener('pointerleave', () => { pointerTilt = 0; });

  // ─── Morph state ──────────────────────────────────────
  let current = 0;
  const morph = { active: false, start: 0, from: 0, to: 0 };
  let holdStart = performance.now();

  function startMorph() {
    const next = (current + 1) % SHAPES.length;
    posAttr.array.set(tgtAttr.array);       // what's on screen now becomes the source
    tgtAttr.array.set(clouds[next].positions);
    posAttr.needsUpdate = true;
    tgtAttr.needsUpdate = true;
    uniforms.uMorph.value = 0;
    morph.active = true;
    morph.start = performance.now();
    morph.from = current;
    morph.to = next;
    det.classList.add('is-searching');
    detClass.textContent = 'searching';
  }

  function endMorph() {
    morph.active = false;
    current = morph.to;
    uniforms.uMorph.value = 1;
    holdStart = performance.now();
    det.classList.remove('is-searching');
    detClass.textContent = SHAPES[current].name;
    hudId.textContent = `obj ${String(current + 1).padStart(2, '0')}/${String(SHAPES.length).padStart(2, '0')}`;
  }

  detClass.textContent = SHAPES[0].name;

  // ─── Detection box projection ─────────────────────────
  const v = new THREE.Vector3();
  const screen = { x: 0, y: 0, w: 0, h: 0, init: false };

  function projectCloud(probe) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < probe.length; i += 3) {
      v.set(probe[i], probe[i + 1], probe[i + 2]).applyMatrix4(points.matrixWorld).project(camera);
      const sx = (v.x * 0.5 + 0.5) * width;
      const sy = (-v.y * 0.5 + 0.5) * height;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function mixRect(a, b, k, grow) {
    const x = a.x + (b.x - a.x) * k - grow;
    const y = a.y + (b.y - a.y) * k - grow;
    return { x, y, w: a.w + (b.w - a.w) * k + grow * 2, h: a.h + (b.h - a.h) * k + grow * 2 };
  }

  // ─── Loop ─────────────────────────────────────────────
  const clock = new THREE.Clock();
  let running = false;
  let frameCount = 0;
  let fpsFrames = 0, fpsTime = performance.now();
  let scoreTime = 0;
  let scanStart = performance.now();

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);

    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;

    // rotation: idle spin + drag inertia
    if (!dragging) {
      velY *= 0.94;
      points.rotation.y += velY + (reduced ? 0 : dt * 0.18);
    }
    const tilt = tiltTarget + pointerTilt;
    points.rotation.x += (tilt - points.rotation.x) * 0.06;

    // morph timeline
    if (morph.active) {
      const p = Math.min((now - morph.start) / MORPH_MS, 1);
      uniforms.uMorph.value = p;
      if (p >= 1) endMorph();
    } else if (!reduced && now - holdStart > HOLD_MS) {
      startMorph();
    }

    // scan plane sweeps top to bottom, then rests off-object
    if (!reduced) {
      const s = (now - scanStart) % (SCAN_MS + SCAN_GAP_MS);
      uniforms.uScan.value = s < SCAN_MS ? THREE.MathUtils.lerp(RADIUS + 0.4, -RADIUS - 0.4, s / SCAN_MS) : 99;
    }

    points.updateMatrixWorld();

    // detection box: fit projected sample points; blend between shapes during a morph
    let target;
    if (morph.active) {
      const t = uniforms.uMorph.value;
      const k = t * t * (3 - 2 * t);
      // the cloud bursts outward mid-morph; widen the box with it
      const grow = Math.sin(t * Math.PI) * height * 0.06;
      target = mixRect(projectCloud(clouds[morph.from].probe), projectCloud(clouds[morph.to].probe), k, grow);
    } else {
      target = projectCloud(clouds[current].probe);
    }
    const pad = 10;
    target.x -= pad; target.y -= pad; target.w += pad * 2; target.h += pad * 2;

    if (!screen.init) { Object.assign(screen, target, { init: true }); }
    const f = 0.18; // tracker smoothing
    screen.x += (target.x - screen.x) * f;
    screen.y += (target.y - screen.y) * f;
    screen.w += (target.w - screen.w) * f;
    screen.h += (target.h - screen.h) * f;
    det.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
    det.style.width = `${screen.w.toFixed(1)}px`;
    det.style.height = `${screen.h.toFixed(1)}px`;

    // readouts
    if (now - scoreTime > 260) {
      scoreTime = now;
      const score = morph.active
        ? 0.18 + Math.random() * 0.25
        : SHAPES[current].score + (Math.random() - 0.5) * 0.02;
      detScore.textContent = Math.min(score, 0.99).toFixed(2);
    }
    frameCount++;
    fpsFrames++;
    if (now - fpsTime >= 500) {
      hudFps.textContent = Math.round((fpsFrames * 1000) / (now - fpsTime));
      fpsFrames = 0;
      fpsTime = now;
    }
    if ((frameCount & 3) === 0) hudFrame.textContent = String(frameCount).padStart(6, '0');

    renderer.render(scene, camera);
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      clock.getDelta();
      fpsTime = performance.now();
      fpsFrames = 0;
      // don't trigger a morph the instant we resume
      if (!morph.active) holdStart = performance.now() - Math.min(performance.now() - holdStart, HOLD_MS - 600);
      requestAnimationFrame(tick);
    }
  }

  let inView = true;
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    setRunning(inView && !document.hidden);
  }).observe(stage);
  document.addEventListener('visibilitychange', () => setRunning(inView && !document.hidden));

  setRunning(true);
  requestAnimationFrame(() => stage.classList.add('is-ready'));
}

try {
  init();
} catch (err) {
  console.error('[scene]', err);
  document.querySelector('.stage')?.classList.add('no-webgl');
}
