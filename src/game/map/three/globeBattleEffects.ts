import * as THREE from 'three';
import type { CountryRecord } from '../../data/worldMap';
import {
  GLOBE_SPHERE_HEIGHT_SEGMENTS,
  GLOBE_SPHERE_WIDTH_SEGMENTS,
  globeOverlayRadius,
} from './globeSurfacePresentation';

const MASK_WIDTH = 512;
const MASK_HEIGHT = 256;
const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);
const PROJECTILE_DIRECTION = new THREE.Vector3();
const WAVE_SURFACE_VERTEX_COLUMNS = GLOBE_SPHERE_WIDTH_SEGMENTS + 1;
const WAVE_SURFACE_VERTEX_COUNT = WAVE_SURFACE_VERTEX_COLUMNS
  * (GLOBE_SPHERE_HEIGHT_SEGMENTS + 1);
const WAVE_CAP_CELL_PADDING = Math.hypot(
  Math.PI / GLOBE_SPHERE_HEIGHT_SEGMENTS,
  Math.PI * 2 / GLOBE_SPHERE_WIDTH_SEGMENTS,
);

const WAVE_SURFACE_UNIT_POSITIONS = (() => {
  const positions = new Float64Array(WAVE_SURFACE_VERTEX_COUNT * 3);
  for (let row = 0; row <= GLOBE_SPHERE_HEIGHT_SEGMENTS; row += 1) {
    const theta = row / GLOBE_SPHERE_HEIGHT_SEGMENTS * Math.PI;
    const sinTheta = Math.sin(theta);
    for (let column = 0; column <= GLOBE_SPHERE_WIDTH_SEGMENTS; column += 1) {
      const phi = column / GLOBE_SPHERE_WIDTH_SEGMENTS * Math.PI * 2;
      const offset = (row * WAVE_SURFACE_VERTEX_COLUMNS + column) * 3;
      positions[offset] = -Math.cos(phi) * sinTheta;
      positions[offset + 1] = Math.cos(theta);
      positions[offset + 2] = Math.sin(phi) * sinTheta;
    }
  }
  return positions;
})();

const waveSurfaceVertexIndex = (column: number, row: number): number => (
  row * WAVE_SURFACE_VERTEX_COLUMNS + column
);

export interface GlobeBattleProjectile {
  readonly group: THREE.Group;
  readonly materials: readonly THREE.MeshBasicMaterial[];
}

export interface GlobeBattleTerritoryWave {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly maskTexture: THREE.CanvasTexture;
  readonly progressUniform: { value: number };
}

function traceUnwrappedRing(
  context: CanvasRenderingContext2D,
  ring: readonly (readonly [number, number])[],
  horizontalOffset: number,
): void {
  if (ring.length < 3) return;
  let previousLongitude = ring[0]![0];
  const points: [number, number][] = [[
    (previousLongitude + 180) / 360 * MASK_WIDTH,
    (90 - ring[0]![1]) / 180 * MASK_HEIGHT,
  ]];
  for (let index = 1; index < ring.length; index += 1) {
    let longitude = ring[index]![0];
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    points.push([
      (longitude + 180) / 360 * MASK_WIDTH,
      (90 - ring[index]![1]) / 180 * MASK_HEIGHT,
    ]);
    previousLongitude = longitude;
  }
  context.moveTo(points[0]![0] + horizontalOffset, points[0]![1]);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]![0] + horizontalOffset, points[index]![1]);
  }
  context.closePath();
}

function createTerritoryMaskTexture(country: CountryRecord): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_WIDTH;
  canvas.height = MASK_HEIGHT;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#fff';
    context.beginPath();
    for (const ring of country.rings) {
      traceUnwrappedRing(context, ring, -MASK_WIDTH);
      traceUnwrappedRing(context, ring, 0);
      traceUnwrappedRing(context, ring, MASK_WIDTH);
    }
    context.fill('evenodd');
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A tapered luminous shell reads as a moving projectile instead of a light ball. */
export function createGlobeBattleProjectile(
  color: number,
  conquered: boolean,
): GlobeBattleProjectile {
  const group = new THREE.Group();
  const trailMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.11,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: conquered ? 0xffefad : 0xffd0c5,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trailGeometry = new THREE.CylinderGeometry(0.030, 0.004, 0.21, 12, 1, true);
  const bodyGeometry = new THREE.CylinderGeometry(0.014, 0.006, 0.105, 12, 1, false);
  trailGeometry.rotateX(Math.PI / 2);
  bodyGeometry.rotateX(Math.PI / 2);
  const trail = new THREE.Mesh(trailGeometry, trailMaterial);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), coreMaterial);
  trail.position.z = -0.07;
  nose.position.z = 0.058;
  group.add(trail, body, nose);
  return { group, materials: [trailMaterial, bodyMaterial, coreMaterial] };
}

/** Keeps the projectile nose tangentially aligned with the sampled attack route. */
export function orientGlobeBattleProjectile(
  projectile: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
): void {
  PROJECTILE_DIRECTION.subVectors(to, from);
  if (PROJECTILE_DIRECTION.lengthSq() <= 1e-10) return;
  projectile.quaternion.setFromUnitVectors(PROJECTILE_FORWARD, PROJECTILE_DIRECTION.normalize());
}

/**
 * Cut one conservative spherical cap from the canonical globe mesh.
 * The fragment shader owns the exact visual edge, while sharing the underlying
 * a,b,d / b,c,d triangles prevents coast and horizon parallax.
 */
export function createGlobeBattleWaveSurfaceGeometry(
  impactDirection: THREE.Vector3,
  globeRadius: number,
  capAngle: number,
): THREE.BufferGeometry {
  const normalizedImpact = impactDirection.clone();
  if (normalizedImpact.lengthSq() <= 1e-12) normalizedImpact.set(0, 1, 0);
  else normalizedImpact.normalize();
  const paddedCapAngle = Math.min(
    Math.PI,
    Math.max(0, capAngle) + WAVE_CAP_CELL_PADDING,
  );
  const minimumDot = Math.cos(paddedCapAngle);
  const localVertexByGlobal = new Int32Array(WAVE_SURFACE_VERTEX_COUNT);
  localVertexByGlobal.fill(-1);
  const positions: number[] = [];
  const indices: number[] = [];
  const surfaceRadius = globeOverlayRadius(globeRadius);

  const vertexDot = (vertexIndex: number): number => {
    const offset = vertexIndex * 3;
    return WAVE_SURFACE_UNIT_POSITIONS[offset]! * normalizedImpact.x
      + WAVE_SURFACE_UNIT_POSITIONS[offset + 1]! * normalizedImpact.y
      + WAVE_SURFACE_UNIT_POSITIONS[offset + 2]! * normalizedImpact.z;
  };
  const localVertexIndex = (globalVertexIndex: number): number => {
    const cached = localVertexByGlobal[globalVertexIndex]!;
    if (cached >= 0) return cached;
    const offset = globalVertexIndex * 3;
    const localIndex = positions.length / 3;
    positions.push(
      WAVE_SURFACE_UNIT_POSITIONS[offset]! * surfaceRadius,
      WAVE_SURFACE_UNIT_POSITIONS[offset + 1]! * surfaceRadius,
      WAVE_SURFACE_UNIT_POSITIONS[offset + 2]! * surfaceRadius,
    );
    localVertexByGlobal[globalVertexIndex] = localIndex;
    return localIndex;
  };
  const addTriangle = (first: number, second: number, third: number): void => {
    if (Math.max(vertexDot(first), vertexDot(second), vertexDot(third)) < minimumDot) return;
    indices.push(
      localVertexIndex(first),
      localVertexIndex(second),
      localVertexIndex(third),
    );
  };

  for (let row = 0; row < GLOBE_SPHERE_HEIGHT_SEGMENTS; row += 1) {
    for (let column = 0; column < GLOBE_SPHERE_WIDTH_SEGMENTS; column += 1) {
      const a = waveSurfaceVertexIndex(column + 1, row);
      const b = waveSurfaceVertexIndex(column, row);
      const c = waveSurfaceVertexIndex(column, row + 1);
      const d = waveSurfaceVertexIndex(column + 1, row + 1);
      // These are exactly SphereGeometry's two triangles and omitted pole caps.
      if (row > 0) addTriangle(a, b, d);
      if (row < GLOBE_SPHERE_HEIGHT_SEGMENTS - 1) addTriangle(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A low-poly shell and one small static mask let the wave cross only the target
 * territory. Animation changes uniforms, never the political or mask texture.
 */
export function createGlobeBattleTerritoryWave(
  country: CountryRecord,
  impactDirection: THREE.Vector3,
  globeRadius: number,
  maximumAngleRadians: number,
  effectScale: number,
): GlobeBattleTerritoryWave {
  const maskTexture = createTerritoryMaskTexture(country);
  const progressUniform = { value: 0 };
  const normalizedImpactDirection = impactDirection.clone().normalize();
  const normalizedEffectScale = THREE.MathUtils.clamp((effectScale - 0.72) / 1.08, 0, 1);
  const bandWidth = THREE.MathUtils.clamp(maximumAngleRadians * 0.16, 0.012, 0.052)
    * THREE.MathUtils.lerp(0.88, 1.16, normalizedEffectScale);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: maskTexture },
      uImpactDirection: { value: normalizedImpactDirection },
      uWaveProgress: progressUniform,
      uMaximumAngle: { value: maximumAngleRadians },
      uBandWidth: { value: bandWidth },
      uIntensity: { value: THREE.MathUtils.lerp(0.72, 1, normalizedEffectScale) },
    },
    vertexShader: `
      varying vec3 vWaveDirection;
      void main() {
        vWaveDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMask;
      uniform vec3 uImpactDirection;
      uniform float uWaveProgress;
      uniform float uMaximumAngle;
      uniform float uBandWidth;
      uniform float uIntensity;
      varying vec3 vWaveDirection;
      void main() {
        if (uWaveProgress <= 0.0) discard;
        vec3 direction = normalize(vWaveDirection);
        float maskU = fract(atan(direction.z, -direction.x) / 6.28318530718 + 1.0);
        float maskV = asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
        float maskCoverage = texture2D(uMask, vec2(maskU, maskV)).a;
        if (maskCoverage < 0.58) discard;
        float territory = smoothstep(0.58, 0.90, maskCoverage);
        float distanceFromImpact = acos(clamp(
          dot(direction, normalize(uImpactDirection)), -1.0, 1.0
        ));
        float waveRadius = uWaveProgress * uMaximumAngle;
        float band = 1.0 - smoothstep(
          uBandWidth * 0.72, uBandWidth * 1.28, abs(distanceFromImpact - waveRadius)
        );
        float reached = 1.0 - smoothstep(
          waveRadius - uBandWidth * 0.65,
          waveRadius + uBandWidth * 0.65,
          distanceFromImpact
        );
        float arrival = smoothstep(0.0, 0.055, uWaveProgress);
        float fade = 1.0 - smoothstep(0.72, 1.0, uWaveProgress);
        float alpha = territory * (band * 0.58 + reached * 0.10) * arrival * fade * uIntensity;
        gl_FragColor = vec4(1.0, 0.055, 0.025, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const capAngle = Math.min(Math.PI, maximumAngleRadians + bandWidth * 1.28);
  const geometry = createGlobeBattleWaveSurfaceGeometry(
    normalizedImpactDirection,
    globeRadius,
    capAngle,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 8;
  return { mesh, maskTexture, progressUniform };
}
