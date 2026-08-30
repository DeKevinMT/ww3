import * as THREE from 'three';
import { COUNTRIES } from '../../data/worldMap';
import type {
  GlobeSignalPurgePresentation,
  GlobeSignalPurgeTerritoryPresentation,
} from '../globeSignalPurgePresentation';
import { lonLatToUnitXyz } from './globeMath';

type Coordinate = readonly [number, number];

interface PreparedPurgeRing {
  readonly points: readonly Coordinate[];
  readonly minimumLongitude: number;
  readonly maximumLongitude: number;
  readonly minimumLatitude: number;
  readonly maximumLatitude: number;
  readonly visualArea: number;
}

interface ScanIntersection {
  readonly longitude: number;
  readonly latitude: number;
}

interface PurgeBufferRange {
  readonly lineStart: number;
  readonly lineCount: number;
  readonly pointStart: number;
  readonly pointCount: number;
  previousProgress: number;
  targetProgress: number;
}

export interface GlobeSignalPurgeEffectDiagnostics {
  readonly activeTerritories: number;
  readonly lineVertices: number;
  readonly pointVertices: number;
  readonly elevatedVertices: number;
  readonly drawCalls: number;
  readonly topologyRebuilds: number;
}

export const SIGNAL_PURGE_MAX_TERRITORIES = 48;
export const SIGNAL_PURGE_MAX_LINE_VERTICES = SIGNAL_PURGE_MAX_TERRITORIES * 1_536;
export const SIGNAL_PURGE_MAX_POINT_VERTICES = SIGNAL_PURGE_MAX_TERRITORIES * 24;
export const SIGNAL_PURGE_PROGRESS_TRANSITION_MS = 760;

const COUNTRY_RINGS = new Map(COUNTRIES.map((country) => [country.id, country.rings] as const));
const PREPARED_PURGE_RINGS = new Map<string, readonly PreparedPurgeRing[]>();
const SURFACE_RADIUS_SCALE = 1.0088;
const MIN_FRONT_WINDOW = 0.058;
const MAX_FRONT_WINDOW = 0.088;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function stableUnit(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function preparePurgeRing(source: readonly Coordinate[]): PreparedPurgeRing | undefined {
  const first = source[0];
  if (!first || source.length < 3) return undefined;
  const points: Coordinate[] = [[first[0], first[1]]];
  let previousLongitude = first[0];
  let longitudeOffset = 0;
  for (let index = 1; index < source.length; index += 1) {
    const coordinate = source[index]!;
    const shifted = coordinate[0] + longitudeOffset;
    if (shifted - previousLongitude > 180) longitudeOffset -= 360;
    else if (shifted - previousLongitude < -180) longitudeOffset += 360;
    const longitude = coordinate[0] + longitudeOffset;
    points.push([longitude, coordinate[1]]);
    previousLongitude = longitude;
  }
  const last = points.at(-1);
  if (last && points.length > 3
    && Math.abs(last[0] - points[0]![0]) < 1e-7
    && Math.abs(last[1] - points[0]![1]) < 1e-7) points.pop();
  if (points.length < 3) return undefined;

  let minimumLongitude = Number.POSITIVE_INFINITY;
  let maximumLongitude = Number.NEGATIVE_INFINITY;
  let minimumLatitude = Number.POSITIVE_INFINITY;
  let maximumLatitude = Number.NEGATIVE_INFINITY;
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    minimumLongitude = Math.min(minimumLongitude, start[0]);
    maximumLongitude = Math.max(maximumLongitude, start[0]);
    minimumLatitude = Math.min(minimumLatitude, start[1]);
    maximumLatitude = Math.max(maximumLatitude, start[1]);
    doubledArea += start[0] * end[1] - end[0] * start[1];
  }
  const middleLatitude = (minimumLatitude + maximumLatitude) * 0.5 * Math.PI / 180;
  return {
    points,
    minimumLongitude,
    maximumLongitude,
    minimumLatitude,
    maximumLatitude,
    visualArea: Math.abs(doubledArea) * 0.5 * Math.max(0.12, Math.cos(middleLatitude)),
  };
}

function preparedPurgeRings(territoryId: string): readonly PreparedPurgeRing[] {
  const cached = PREPARED_PURGE_RINGS.get(territoryId);
  if (cached) return cached;
  const rings = (COUNTRY_RINGS.get(territoryId) ?? [])
    .map(preparePurgeRing)
    .filter((ring): ring is PreparedPurgeRing => Boolean(ring))
    .sort((left, right) => right.visualArea - left.visualArea);
  PREPARED_PURGE_RINGS.set(territoryId, rings);
  return rings;
}

function scanRing(
  ring: PreparedPurgeRing,
  alongLongitude: boolean,
  progress: number,
): ScanIntersection[] {
  const intersections: ScanIntersection[] = [];
  const axisMinimum = alongLongitude ? ring.minimumLongitude : ring.minimumLatitude;
  const axisMaximum = alongLongitude ? ring.maximumLongitude : ring.maximumLatitude;
  const axisValue = THREE.MathUtils.lerp(axisMinimum, axisMaximum, progress);
  for (let index = 0; index < ring.points.length; index += 1) {
    const start = ring.points[index]!;
    const end = ring.points[(index + 1) % ring.points.length]!;
    const startAxis = alongLongitude ? start[0] : start[1];
    const endAxis = alongLongitude ? end[0] : end[1];
    // Half-open edge ownership prevents duplicate hits on polygon vertices.
    if (!((startAxis <= axisValue && endAxis > axisValue)
      || (endAxis <= axisValue && startAxis > axisValue))) continue;
    const edgeProgress = (axisValue - startAxis) / (endAxis - startAxis);
    intersections.push({
      longitude: alongLongitude
        ? axisValue
        : THREE.MathUtils.lerp(start[0], end[0], edgeProgress),
      latitude: alongLongitude
        ? THREE.MathUtils.lerp(start[1], end[1], edgeProgress)
        : axisValue,
    });
  }
  intersections.sort((left, right) => (
    alongLongitude
      ? left.latitude - right.latitude
      : left.longitude - right.longitude
  ));
  return intersections;
}

function sphericalPosition(
  longitude: number,
  latitude: number,
  radius: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const point = lonLatToUnitXyz(longitude, latitude);
  return target.set(point.x * radius, point.y * radius, point.z * radius);
}

function createLineMaterial(reducedMotion: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      purgeTime: { value: 0 },
      purgeProgressBlend: { value: 1 },
      purgeMotion: { value: reducedMotion ? 0 : 1 },
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float purgeSweep;
      attribute float purgePrevious;
      attribute float purgeTarget;
      attribute float purgeSeed;
      attribute float purgeKind;
      uniform float purgeTime;
      uniform float purgeProgressBlend;
      uniform float purgeMotion;
      varying float vPurgeAlpha;
      varying float vPurgeFront;
      varying float vPurgeKind;

      void main() {
        float progress = mix(purgePrevious, purgeTarget, purgeProgressBlend);
        float distanceToFront = abs(purgeSweep - progress);
        float frontWindow = mix(${MIN_FRONT_WINDOW.toFixed(3)}, ${MAX_FRONT_WINDOW.toFixed(3)}, purgeKind);
        float front = 1.0 - smoothstep(frontWindow * 0.30, frontWindow, distanceToFront);
        float trailDistance = progress - purgeSweep;
        float reclaimedTrail = step(0.0, trailDistance)
          * (1.0 - smoothstep(0.025, 0.19, trailDistance))
          * (1.0 - purgeKind);
        float shimmer = 0.86 + 0.14 * sin(
          purgeTime * 2.4 * purgeMotion + purgeSeed * 17.0
        );
        vPurgeAlpha = (front * mix(0.84, 1.0, purgeKind) + reclaimedTrail * 0.15) * shimmer;
        vPurgeFront = front;
        vPurgeKind = purgeKind;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vPurgeAlpha;
      varying float vPurgeFront;
      varying float vPurgeKind;

      void main() {
        if (vPurgeAlpha < 0.018) discard;
        vec3 stableSignal = vec3(0.12, 0.82, 0.98);
        vec3 reclaimFront = vec3(1.0, 0.73, 0.25);
        vec3 color = mix(stableSignal, reclaimFront, clamp(vPurgeFront * 1.18, 0.0, 1.0));
        float alpha = vPurgeAlpha * mix(0.68, 0.82, vPurgeKind);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createPointMaterial(reducedMotion: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      purgeTime: { value: 0 },
      purgeProgressBlend: { value: 1 },
      purgeMotion: { value: reducedMotion ? 0 : 1 },
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float purgeSweep;
      attribute float purgePrevious;
      attribute float purgeTarget;
      attribute float purgeSeed;
      uniform float purgeTime;
      uniform float purgeProgressBlend;
      uniform float purgeMotion;
      varying float vPurgeAlpha;
      varying float vPurgeFront;

      void main() {
        float progress = mix(purgePrevious, purgeTarget, purgeProgressBlend);
        float distanceToFront = abs(purgeSweep - progress);
        float front = 1.0 - smoothstep(0.020, ${MAX_FRONT_WINDOW.toFixed(3)}, distanceToFront);
        float pulse = 0.82 + 0.18 * sin(purgeTime * 3.1 * purgeMotion + purgeSeed * 19.0);
        vPurgeAlpha = front * pulse;
        vPurgeFront = front;
        gl_PointSize = 2.2 + front * 2.8;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vPurgeAlpha;
      varying float vPurgeFront;

      void main() {
        float radius = distance(gl_PointCoord, vec2(0.5));
        float glow = 1.0 - smoothstep(0.08, 0.5, radius);
        if (glow * vPurgeAlpha < 0.015) discard;
        vec3 color = mix(vec3(0.18, 0.88, 1.0), vec3(1.0, 0.82, 0.42), vPurgeFront);
        gl_FragColor = vec4(color, glow * vPurgeAlpha * 0.92);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * One bounded WebGL effect for every local Signal Purge. Geometry is rebuilt
 * only when the active territory set changes. Weekly progress rewrites two
 * pooled scalar attributes; frame animation is uniform-only.
 */
export class GlobeSignalPurgeEffect {
  readonly object3d = new THREE.Group();

  private readonly linePositions = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES * 3);
  private readonly lineSweep = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES);
  private readonly linePrevious = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES);
  private readonly lineTarget = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES);
  private readonly lineSeed = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES);
  private readonly lineKind = new Float32Array(SIGNAL_PURGE_MAX_LINE_VERTICES);
  private readonly pointPositions = new Float32Array(SIGNAL_PURGE_MAX_POINT_VERTICES * 3);
  private readonly pointSweep = new Float32Array(SIGNAL_PURGE_MAX_POINT_VERTICES);
  private readonly pointPrevious = new Float32Array(SIGNAL_PURGE_MAX_POINT_VERTICES);
  private readonly pointTarget = new Float32Array(SIGNAL_PURGE_MAX_POINT_VERTICES);
  private readonly pointSeed = new Float32Array(SIGNAL_PURGE_MAX_POINT_VERTICES);
  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly pointGeometry = new THREE.BufferGeometry();
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly pointMaterial: THREE.ShaderMaterial;
  private readonly lines: THREE.LineSegments;
  private readonly points: THREE.Points;
  private readonly ranges = new Map<string, PurgeBufferRange>();
  private readonly pointScratch = new THREE.Vector3();
  private topologySignature = '';
  private transitionStartedAt = -Infinity;
  private lineVertexCount = 0;
  private pointVertexCount = 0;
  private elevatedVertexCount = 0;
  private topologyRebuildCount = 0;
  private active = false;

  constructor(
    private readonly globeRadius: number,
    private readonly reducedMotion: boolean,
  ) {
    this.lineMaterial = createLineMaterial(reducedMotion);
    this.pointMaterial = createPointMaterial(reducedMotion);
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      'purgeSweep',
      new THREE.BufferAttribute(this.lineSweep, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      'purgePrevious',
      new THREE.BufferAttribute(this.linePrevious, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      'purgeTarget',
      new THREE.BufferAttribute(this.lineTarget, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      'purgeSeed',
      new THREE.BufferAttribute(this.lineSeed, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      'purgeKind',
      new THREE.BufferAttribute(this.lineKind, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.pointGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pointPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.pointGeometry.setAttribute(
      'purgeSweep',
      new THREE.BufferAttribute(this.pointSweep, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.pointGeometry.setAttribute(
      'purgePrevious',
      new THREE.BufferAttribute(this.pointPrevious, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.pointGeometry.setAttribute(
      'purgeTarget',
      new THREE.BufferAttribute(this.pointTarget, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.pointGeometry.setAttribute(
      'purgeSeed',
      new THREE.BufferAttribute(this.pointSeed, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.lineGeometry.setDrawRange(0, 0);
    this.pointGeometry.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    this.lines.frustumCulled = false;
    this.points.frustumCulled = false;
    this.lines.renderOrder = 9.2;
    this.points.renderOrder = 9.25;
    this.lines.userData.pooledSignalPurgeContours = true;
    this.points.userData.pooledSignalPurgeFilaments = true;
    this.object3d.name = 'signal-purge-reclamation-front';
    this.object3d.visible = false;
    this.object3d.add(this.lines, this.points);
  }

  get visible(): boolean {
    return this.active;
  }

  get transitioning(): boolean {
    if (!this.active || this.reducedMotion) return false;
    return performance.now() - this.transitionStartedAt < SIGNAL_PURGE_PROGRESS_TRANSITION_MS;
  }

  get activeTerritoryCount(): number {
    return this.ranges.size;
  }

  get drawCallCount(): number {
    return this.active ? 2 : 0;
  }

  get activeLineVertexCount(): number {
    return this.lineVertexCount;
  }

  get activePointVertexCount(): number {
    return this.pointVertexCount;
  }

  diagnostics(): GlobeSignalPurgeEffectDiagnostics {
    return {
      activeTerritories: this.ranges.size,
      lineVertices: this.lineVertexCount,
      pointVertices: this.pointVertexCount,
      elevatedVertices: this.elevatedVertexCount,
      drawCalls: this.active ? 2 : 0,
      topologyRebuilds: this.topologyRebuildCount,
    };
  }

  sync(presentation: GlobeSignalPurgePresentation, now = performance.now()): void {
    if (presentation.topologySignature !== this.topologySignature) {
      this.rebuildTopology(presentation, now);
      return;
    }
    if (!this.active) return;
    const blend = this.progressBlendAt(now);
    let progressChanged = false;
    for (const territory of presentation.territories) {
      const range = this.ranges.get(territory.territoryId);
      if (!range || Math.abs(range.targetProgress - territory.progress) < 1e-7) continue;
      const visualProgress = THREE.MathUtils.lerp(
        range.previousProgress,
        range.targetProgress,
        blend,
      );
      range.previousProgress = visualProgress;
      range.targetProgress = territory.progress;
      this.linePrevious.fill(
        visualProgress,
        range.lineStart,
        range.lineStart + range.lineCount,
      );
      this.lineTarget.fill(
        territory.progress,
        range.lineStart,
        range.lineStart + range.lineCount,
      );
      this.pointPrevious.fill(
        visualProgress,
        range.pointStart,
        range.pointStart + range.pointCount,
      );
      this.pointTarget.fill(
        territory.progress,
        range.pointStart,
        range.pointStart + range.pointCount,
      );
      progressChanged = true;
    }
    if (!progressChanged) return;
    this.lineGeometry.getAttribute('purgePrevious').needsUpdate = true;
    this.lineGeometry.getAttribute('purgeTarget').needsUpdate = true;
    this.pointGeometry.getAttribute('purgePrevious').needsUpdate = true;
    this.pointGeometry.getAttribute('purgeTarget').needsUpdate = true;
    this.transitionStartedAt = now;
    this.setProgressBlend(0);
  }

  animate(now: number): void {
    if (!this.active) return;
    const seconds = now / 1_000;
    this.lineMaterial.uniforms.purgeTime!.value = seconds;
    this.pointMaterial.uniforms.purgeTime!.value = seconds;
    this.setProgressBlend(this.progressBlendAt(now));
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.pointGeometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
    this.object3d.clear();
    this.ranges.clear();
    this.active = false;
  }

  private progressBlendAt(now: number): number {
    if (this.reducedMotion) return 1;
    return clamp(
      (now - this.transitionStartedAt) / SIGNAL_PURGE_PROGRESS_TRANSITION_MS,
      0,
      1,
    );
  }

  private setProgressBlend(progress: number): void {
    this.lineMaterial.uniforms.purgeProgressBlend!.value = progress;
    this.pointMaterial.uniforms.purgeProgressBlend!.value = progress;
  }

  private rebuildTopology(
    presentation: GlobeSignalPurgePresentation,
    now: number,
  ): void {
    this.topologySignature = presentation.topologySignature;
    this.topologyRebuildCount += 1;
    this.ranges.clear();
    this.lineVertexCount = 0;
    this.pointVertexCount = 0;
    this.elevatedVertexCount = 0;
    const supported = presentation.territories
      .filter((territory) => COUNTRY_RINGS.has(territory.territoryId))
      .slice(0, SIGNAL_PURGE_MAX_TERRITORIES);
    for (const territory of supported) this.writeTerritoryTopology(territory);

    for (const attributeName of [
      'position', 'purgeSweep', 'purgePrevious', 'purgeTarget', 'purgeSeed', 'purgeKind',
    ]) this.lineGeometry.getAttribute(attributeName).needsUpdate = true;
    for (const attributeName of [
      'position', 'purgeSweep', 'purgePrevious', 'purgeTarget', 'purgeSeed',
    ]) this.pointGeometry.getAttribute(attributeName).needsUpdate = true;
    this.lineGeometry.setDrawRange(0, this.lineVertexCount);
    this.pointGeometry.setDrawRange(0, this.pointVertexCount);
    this.active = presentation.active && this.lineVertexCount > 0;
    this.object3d.visible = this.active;
    this.lines.visible = this.active;
    this.points.visible = this.active && this.pointVertexCount > 0;
    this.transitionStartedAt = now - SIGNAL_PURGE_PROGRESS_TRANSITION_MS;
    this.setProgressBlend(1);
  }

  private writeTerritoryTopology(
    territory: GlobeSignalPurgeTerritoryPresentation,
  ): void {
    const lineStart = this.lineVertexCount;
    const pointStart = this.pointVertexCount;
    const rings = preparedPurgeRings(territory.territoryId);
    const principalArea = rings[0]?.visualArea ?? 0;
    const visibleRings = rings
      .filter((ring, index) => index === 0 || ring.visualArea >= principalArea * 0.0025)
      .slice(0, 12);
    for (let ringIndex = 0; ringIndex < visibleRings.length; ringIndex += 1) {
      if (this.lineVertexCount + 2 > SIGNAL_PURGE_MAX_LINE_VERTICES) break;
      const ring = visibleRings[ringIndex]!;
      const middleLatitude = (ring.minimumLatitude + ring.maximumLatitude) * 0.5;
      const longitudeSpan = (ring.maximumLongitude - ring.minimumLongitude)
        * Math.max(0.16, Math.cos(middleLatitude * Math.PI / 180));
      const latitudeSpan = ring.maximumLatitude - ring.minimumLatitude;
      const alongLongitude = longitudeSpan >= latitudeSpan;
      const principal = ringIndex === 0;
      const bandCount = principal
        ? clamp(Math.round(11 + Math.sqrt(ring.points.length) * 0.75), 13, 22)
        : clamp(Math.round(6 + Math.sqrt(ring.points.length) * 0.42), 7, 12);
      const filamentStride = Math.max(2, Math.round(bandCount / 5));
      for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
        const sweep = (bandIndex + 1) / (bandCount + 1);
        const intersections = scanRing(ring, alongLongitude, sweep);
        let widestStart: ScanIntersection | undefined;
        let widestEnd: ScanIntersection | undefined;
        let widestDistance = 0;
        for (let index = 0; index + 1 < intersections.length; index += 2) {
          const start = intersections[index]!;
          const end = intersections[index + 1]!;
          const distance = Math.hypot(
            (end.longitude - start.longitude) * Math.max(0.16, Math.cos(middleLatitude * Math.PI / 180)),
            end.latitude - start.latitude,
          );
          if (distance < 0.015) continue;
          if (distance > widestDistance) {
            widestDistance = distance;
            widestStart = start;
            widestEnd = end;
          }
          this.writeSurfaceContour(
            start,
            end,
            sweep,
            stableUnit(`${territory.territoryId}:${ringIndex}:${bandIndex}:${index}`),
          );
        }
        if (principal && bandIndex % filamentStride === Math.min(1, filamentStride - 1)
          && widestStart && widestEnd) {
          this.writeFilament(
            THREE.MathUtils.lerp(widestStart.longitude, widestEnd.longitude, 0.5),
            THREE.MathUtils.lerp(widestStart.latitude, widestEnd.latitude, 0.5),
            sweep,
            stableUnit(`${territory.territoryId}:filament:${bandIndex}`),
            Math.max(longitudeSpan, latitudeSpan),
          );
        }
      }
    }
    const lineCount = this.lineVertexCount - lineStart;
    const pointCount = this.pointVertexCount - pointStart;
    if (lineCount <= 0) return;
    this.linePrevious.fill(territory.progress, lineStart, lineStart + lineCount);
    this.lineTarget.fill(territory.progress, lineStart, lineStart + lineCount);
    this.pointPrevious.fill(territory.progress, pointStart, pointStart + pointCount);
    this.pointTarget.fill(territory.progress, pointStart, pointStart + pointCount);
    this.ranges.set(territory.territoryId, {
      lineStart,
      lineCount,
      pointStart,
      pointCount,
      previousProgress: territory.progress,
      targetProgress: territory.progress,
    });
  }

  private writeSurfaceContour(
    start: ScanIntersection,
    end: ScanIntersection,
    sweep: number,
    seed: number,
  ): void {
    const angularSpan = Math.hypot(
      end.longitude - start.longitude,
      end.latitude - start.latitude,
    );
    const steps = clamp(Math.ceil(angularSpan / 2.8), 1, 6);
    const radius = this.globeRadius * SURFACE_RADIUS_SCALE;
    for (let step = 0; step < steps; step += 1) {
      if (this.lineVertexCount + 2 > SIGNAL_PURGE_MAX_LINE_VERTICES) return;
      const leftProgress = step / steps;
      const rightProgress = (step + 1) / steps;
      sphericalPosition(
        THREE.MathUtils.lerp(start.longitude, end.longitude, leftProgress),
        THREE.MathUtils.lerp(start.latitude, end.latitude, leftProgress),
        radius,
        this.pointScratch,
      );
      this.writeLineVertex(this.pointScratch, sweep, seed, 0);
      sphericalPosition(
        THREE.MathUtils.lerp(start.longitude, end.longitude, rightProgress),
        THREE.MathUtils.lerp(start.latitude, end.latitude, rightProgress),
        radius,
        this.pointScratch,
      );
      this.writeLineVertex(this.pointScratch, sweep, seed, 0);
    }
  }

  private writeFilament(
    longitude: number,
    latitude: number,
    sweep: number,
    seed: number,
    territorySpanDegrees: number,
  ): void {
    if (this.lineVertexCount + 2 > SIGNAL_PURGE_MAX_LINE_VERTICES
      || this.pointVertexCount >= SIGNAL_PURGE_MAX_POINT_VERTICES) return;
    const surfaceRadius = this.globeRadius * SURFACE_RADIUS_SCALE;
    const height = clamp(
      0.035 + seed * 0.065 + Math.sqrt(Math.max(0, territorySpanDegrees)) * 0.007,
      0.045,
      0.14,
    );
    sphericalPosition(longitude, latitude, surfaceRadius, this.pointScratch);
    this.writeLineVertex(this.pointScratch, sweep, seed, 1);
    sphericalPosition(longitude, latitude, surfaceRadius + height, this.pointScratch);
    this.writeLineVertex(this.pointScratch, sweep, seed, 1);
    this.writePointVertex(this.pointScratch, sweep, seed);
    this.elevatedVertexCount += 2;
  }

  private writeLineVertex(
    point: THREE.Vector3,
    sweep: number,
    seed: number,
    kind: 0 | 1,
  ): void {
    const index = this.lineVertexCount;
    const offset = index * 3;
    this.linePositions[offset] = point.x;
    this.linePositions[offset + 1] = point.y;
    this.linePositions[offset + 2] = point.z;
    this.lineSweep[index] = sweep;
    this.lineSeed[index] = seed;
    this.lineKind[index] = kind;
    this.lineVertexCount += 1;
  }

  private writePointVertex(point: THREE.Vector3, sweep: number, seed: number): void {
    const index = this.pointVertexCount;
    const offset = index * 3;
    this.pointPositions[offset] = point.x;
    this.pointPositions[offset + 1] = point.y;
    this.pointPositions[offset + 2] = point.z;
    this.pointSweep[index] = sweep;
    this.pointSeed[index] = seed;
    this.pointVertexCount += 1;
  }
}
