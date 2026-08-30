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

export const GLOBE_BATTLE_WAVE_CACHE_CAPACITY = 12;

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

export interface GlobeBattleWaveCandidateRows {
  readonly firstRow: number;
  readonly lastRow: number;
  readonly cellCount: number;
  readonly totalCellCount: number;
}

/**
 * A spherical cap can only touch latitude cells intersecting its north/south
 * extent. Keeping this exact conservative row range avoids scanning the full
 * 320 x 200 globe whenever a new target receives its first impact wave.
 */
export function globeBattleWaveCandidateRows(
  impactDirection: THREE.Vector3,
  capAngle: number,
): GlobeBattleWaveCandidateRows {
  const direction = impactDirection.clone();
  if (direction.lengthSq() <= 1e-12) direction.set(0, 1, 0);
  else direction.normalize();
  const paddedCapAngle = Math.min(
    Math.PI,
    Math.max(0, capAngle) + WAVE_CAP_CELL_PADDING,
  );
  const totalCellCount = GLOBE_SPHERE_WIDTH_SEGMENTS * GLOBE_SPHERE_HEIGHT_SEGMENTS;
  if (paddedCapAngle >= Math.PI) return {
    firstRow: 0,
    lastRow: GLOBE_SPHERE_HEIGHT_SEGMENTS - 1,
    cellCount: totalCellCount,
    totalCellCount,
  };

  const impactLatitude = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
  const minimumLatitude = Math.max(-Math.PI / 2, impactLatitude - paddedCapAngle);
  const maximumLatitude = Math.min(Math.PI / 2, impactLatitude + paddedCapAngle);
  const rowHeight = Math.PI / GLOBE_SPHERE_HEIGHT_SEGMENTS;
  const minimumTheta = Math.PI / 2 - maximumLatitude;
  const maximumTheta = Math.PI / 2 - minimumLatitude;
  // Include both cells sharing an exact boundary vertex. The later dot test
  // remains authoritative, so these are conservative bounds only.
  const firstRow = Math.max(0, Math.ceil(minimumTheta / rowHeight - 1e-12) - 1);
  const lastRow = Math.min(
    GLOBE_SPHERE_HEIGHT_SEGMENTS - 1,
    Math.floor(maximumTheta / rowHeight + 1e-12),
  );
  return {
    firstRow,
    lastRow,
    cellCount: Math.max(0, lastRow - firstRow + 1) * GLOBE_SPHERE_WIDTH_SEGMENTS,
    totalCellCount,
  };
}

export interface GlobeBattleProjectile {
  readonly group: THREE.Group;
  readonly materials: readonly [
    THREE.MeshBasicMaterial,
    THREE.MeshBasicMaterial,
    THREE.MeshBasicMaterial,
  ];
}

export interface GlobeBattleTerritoryWave {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly progressUniform: { value: number };
  dispose(): void;
}

function disposeProjectile(projectile: GlobeBattleProjectile): void {
  projectile.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

function configureGlobeBattleProjectile(
  projectile: GlobeBattleProjectile,
  color: number,
  conquered: boolean,
): void {
  const [trailMaterial, bodyMaterial, coreMaterial] = projectile.materials;
  trailMaterial.color.setHex(color);
  trailMaterial.opacity = 0.11;
  bodyMaterial.color.setHex(conquered ? 0xffefad : 0xffd0c5);
  bodyMaterial.opacity = 0.52;
  coreMaterial.color.setHex(0xffffff);
  coreMaterial.opacity = 0.68;
  projectile.group.position.set(0, 0, 0);
  projectile.group.quaternion.identity();
  projectile.group.scale.setScalar(1);
  projectile.group.visible = true;
}

/**
 * Prewarms a fixed number of projectile shells and reuses them for every
 * attack. No projectile geometry or material is allocated after construction.
 */
export class GlobeBattleProjectilePool {
  private readonly all: GlobeBattleProjectile[] = [];
  private readonly free: GlobeBattleProjectile[] = [];
  private readonly active = new Set<GlobeBattleProjectile>();

  constructor(capacity: number) {
    const boundedCapacity = Math.max(0, Math.floor(capacity));
    for (let index = 0; index < boundedCapacity; index += 1) {
      const projectile = createGlobeBattleProjectile(0xff725f, false);
      projectile.group.visible = false;
      this.all.push(projectile);
      this.free.push(projectile);
    }
  }

  acquire(color: number, conquered: boolean): GlobeBattleProjectile | undefined {
    const projectile = this.free.pop();
    if (!projectile) return undefined;
    configureGlobeBattleProjectile(projectile, color, conquered);
    this.active.add(projectile);
    return projectile;
  }

  release(projectile: GlobeBattleProjectile): void {
    if (!this.active.delete(projectile)) return;
    projectile.group.removeFromParent();
    projectile.group.visible = false;
    this.free.push(projectile);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get capacity(): number {
    return this.all.length;
  }

  dispose(): void {
    for (const projectile of this.all) {
      projectile.group.removeFromParent();
      disposeProjectile(projectile);
    }
    this.active.clear();
    this.free.length = 0;
    this.all.length = 0;
  }
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

interface GlobeBattleWaveResource {
  readonly geometry: THREE.BufferGeometry;
  readonly maskTexture: THREE.CanvasTexture;
}

interface GlobeBattleWaveResourceLease extends GlobeBattleWaveResource {
  release(): void;
}

interface CachedGlobeBattleWaveResource extends GlobeBattleWaveResource {
  references: number;
}

function disposeWaveResource(resource: GlobeBattleWaveResource): void {
  resource.geometry.dispose();
  resource.maskTexture.dispose();
}

function waveResourceKey(
  country: CountryRecord,
  impactDirection: THREE.Vector3,
  globeRadius: number,
  capAngle: number,
): string {
  const direction = impactDirection.clone();
  if (direction.lengthSq() <= 1e-12) direction.set(0, 1, 0);
  else direction.normalize();
  return [
    country.id,
    globeRadius.toFixed(4),
    capAngle.toFixed(5),
    direction.x.toFixed(4),
    direction.y.toFixed(4),
    direction.z.toFixed(4),
  ].join(':');
}

/**
 * Bounded LRU cache for the expensive country mask + canonical globe cap.
 * Active leases are never evicted; if all entries are active, the overflow
 * resource is transient and is disposed immediately when its wave finishes.
 */
export class GlobeBattleWaveResourceCache {
  private readonly entries = new Map<string, CachedGlobeBattleWaveResource>();
  readonly capacity: number;

  constructor(capacity = GLOBE_BATTLE_WAVE_CACHE_CAPACITY) {
    this.capacity = Math.max(0, Math.floor(capacity));
  }

  acquire(
    country: CountryRecord,
    impactDirection: THREE.Vector3,
    globeRadius: number,
    capAngle: number,
  ): GlobeBattleWaveResourceLease {
    const key = waveResourceKey(country, impactDirection, globeRadius, capAngle);
    const cached = this.entries.get(key);
    if (cached) {
      cached.references += 1;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return this.cachedLease(key, cached);
    }

    this.evictInactiveUntilBelowCapacity();
    const resource: GlobeBattleWaveResource = {
      geometry: createGlobeBattleWaveSurfaceGeometry(
        impactDirection,
        globeRadius,
        capAngle,
      ),
      maskTexture: createTerritoryMaskTexture(country),
    };
    if (this.entries.size < this.capacity) {
      const entry: CachedGlobeBattleWaveResource = { ...resource, references: 1 };
      this.entries.set(key, entry);
      return this.cachedLease(key, entry);
    }

    let released = false;
    return {
      ...resource,
      release: () => {
        if (released) return;
        released = true;
        disposeWaveResource(resource);
      },
    };
  }

  get size(): number {
    return this.entries.size;
  }

  dispose(): void {
    for (const resource of this.entries.values()) disposeWaveResource(resource);
    this.entries.clear();
  }

  private cachedLease(
    key: string,
    resource: CachedGlobeBattleWaveResource,
  ): GlobeBattleWaveResourceLease {
    let released = false;
    return {
      geometry: resource.geometry,
      maskTexture: resource.maskTexture,
      release: () => {
        if (released) return;
        released = true;
        const current = this.entries.get(key);
        if (current === resource) current.references = Math.max(0, current.references - 1);
      },
    };
  }

  private evictInactiveUntilBelowCapacity(): void {
    while (this.entries.size >= this.capacity && this.entries.size > 0) {
      const candidate = [...this.entries].find(([, entry]) => entry.references === 0);
      if (!candidate) return;
      const [key, resource] = candidate;
      this.entries.delete(key);
      disposeWaveResource(resource);
    }
  }
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
  const candidateRows = globeBattleWaveCandidateRows(normalizedImpact, capAngle);
  const firstRow = candidateRows.firstRow;
  const lastRow = candidateRows.lastRow;
  const firstCandidateVertex = waveSurfaceVertexIndex(0, firstRow);
  const candidateVertexCount = Math.max(0, lastRow - firstRow + 2)
    * WAVE_SURFACE_VERTEX_COLUMNS;
  const localVertexByCandidate = new Int32Array(candidateVertexCount);
  localVertexByCandidate.fill(-1);
  const positions: number[] = [];
  const indices: number[] = [];
  const surfaceRadius = globeOverlayRadius(globeRadius);

  const localVertexIndex = (globalVertexIndex: number): number => {
    const candidateIndex = globalVertexIndex - firstCandidateVertex;
    const cached = localVertexByCandidate[candidateIndex]!;
    if (cached >= 0) return cached;
    const offset = globalVertexIndex * 3;
    const localIndex = positions.length / 3;
    positions.push(
      WAVE_SURFACE_UNIT_POSITIONS[offset]! * surfaceRadius,
      WAVE_SURFACE_UNIT_POSITIONS[offset + 1]! * surfaceRadius,
      WAVE_SURFACE_UNIT_POSITIONS[offset + 2]! * surfaceRadius,
    );
    localVertexByCandidate[candidateIndex] = localIndex;
    return localIndex;
  };
  const addTriangle = (
    first: number,
    second: number,
    third: number,
    firstDot: number,
    secondDot: number,
    thirdDot: number,
  ): void => {
    if (Math.max(firstDot, secondDot, thirdDot) < minimumDot) return;
    indices.push(
      localVertexIndex(first),
      localVertexIndex(second),
      localVertexIndex(third),
    );
  };

  const rowDots = new Float64Array(WAVE_SURFACE_VERTEX_COLUMNS);
  const nextRowDots = new Float64Array(WAVE_SURFACE_VERTEX_COLUMNS);
  const fillRowDots = (row: number, target: Float64Array): void => {
    const firstVertex = waveSurfaceVertexIndex(0, row);
    for (let column = 0; column < WAVE_SURFACE_VERTEX_COLUMNS; column += 1) {
      const offset = (firstVertex + column) * 3;
      target[column] = WAVE_SURFACE_UNIT_POSITIONS[offset]! * normalizedImpact.x
        + WAVE_SURFACE_UNIT_POSITIONS[offset + 1]! * normalizedImpact.y
        + WAVE_SURFACE_UNIT_POSITIONS[offset + 2]! * normalizedImpact.z;
    }
  };
  fillRowDots(firstRow, rowDots);

  for (let row = firstRow; row <= lastRow; row += 1) {
    fillRowDots(row + 1, nextRowDots);
    for (let column = 0; column < GLOBE_SPHERE_WIDTH_SEGMENTS; column += 1) {
      const a = waveSurfaceVertexIndex(column + 1, row);
      const b = waveSurfaceVertexIndex(column, row);
      const c = waveSurfaceVertexIndex(column, row + 1);
      const d = waveSurfaceVertexIndex(column + 1, row + 1);
      // These are exactly SphereGeometry's two triangles and omitted pole caps.
      if (row > 0) addTriangle(
        a, b, d,
        rowDots[column + 1]!, rowDots[column]!, nextRowDots[column + 1]!,
      );
      if (row < GLOBE_SPHERE_HEIGHT_SEGMENTS - 1) addTriangle(
        b, c, d,
        rowDots[column]!, nextRowDots[column]!, nextRowDots[column + 1]!,
      );
    }
    rowDots.set(nextRowDots);
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
  resourceCache = new GlobeBattleWaveResourceCache(0),
): GlobeBattleTerritoryWave {
  const progressUniform = { value: 0 };
  const normalizedImpactDirection = impactDirection.clone().normalize();
  const bandWidth = THREE.MathUtils.clamp(maximumAngleRadians * 0.16, 0.012, 0.052);
  const capAngle = Math.min(Math.PI, maximumAngleRadians + bandWidth * 1.28);
  const resources = resourceCache.acquire(
    country,
    normalizedImpactDirection,
    globeRadius,
    capAngle,
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: resources.maskTexture },
      uImpactDirection: { value: normalizedImpactDirection },
      uWaveProgress: progressUniform,
      uMaximumAngle: { value: maximumAngleRadians },
      uBandWidth: { value: bandWidth },
      uIntensity: { value: 0.88 },
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
        float leadingBand = 1.0 - smoothstep(
          uBandWidth * 0.72, uBandWidth * 1.28, abs(distanceFromImpact - waveRadius)
        );
        float echoRadius = max(0.0, waveRadius - uBandWidth * 2.05);
        float echoBand = 1.0 - smoothstep(
          uBandWidth * 0.62, uBandWidth * 1.18, abs(distanceFromImpact - echoRadius)
        );
        float reached = 1.0 - smoothstep(
          waveRadius - uBandWidth * 0.65,
          waveRadius + uBandWidth * 0.65,
          distanceFromImpact
        );
        float arrival = smoothstep(0.0, 0.055, uWaveProgress);
        float fade = 1.0 - smoothstep(0.72, 1.0, uWaveProgress);
        float alpha = territory * (
          leadingBand * 0.56 + echoBand * 0.18 + reached * 0.08
        ) * arrival * fade * uIntensity;
        vec3 waveColor = mix(
          vec3(1.0, 0.055, 0.025),
          vec3(1.0, 0.74, 0.28),
          clamp(leadingBand * 0.58 + echoBand * 0.18, 0.0, 0.72)
        );
        gl_FragColor = vec4(waveColor, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(resources.geometry, material);
  mesh.renderOrder = 8;
  let disposed = false;
  return {
    mesh,
    progressUniform,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      material.dispose();
      resources.release();
    },
  };
}
