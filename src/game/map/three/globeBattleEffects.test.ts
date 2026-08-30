import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createGlobeBattleWaveSurfaceGeometry,
  globeBattleWaveCandidateRows,
  GlobeBattleProjectilePool,
} from './globeBattleEffects';
import battleEffectSource from './globeBattleEffects.ts?raw';
import globeSceneSource from './ThreeGlobeScene.ts?raw';
import {
  GLOBE_SPHERE_HEIGHT_SEGMENTS,
  GLOBE_SPHERE_WIDTH_SEGMENTS,
  GLOBE_SURFACE_CLEARANCE,
  globeOverlayRadius,
} from './globeSurfacePresentation';

describe('globe battle effects', () => {
  it('uses an oriented tapered projectile instead of an impact ball', () => {
    expect(battleEffectSource).toContain('new THREE.CylinderGeometry(0.030, 0.004, 0.21, 12, 1, true)');
    expect(battleEffectSource).toContain('new THREE.CylinderGeometry(0.014, 0.006, 0.105, 12, 1, false)');
    expect(battleEffectSource).toContain('new THREE.SphereGeometry(0.009, 12, 8)');
    expect(battleEffectSource).toContain('setFromUnitVectors(PROJECTILE_FORWARD');
    expect(battleEffectSource).toContain('trail.position.z = -0.07;');
    expect(battleEffectSource).toContain('nose.position.z = 0.058;');
    expect(battleEffectSource).toContain('opacity: 0.11');
    expect(battleEffectSource).toContain('opacity: 0.52');
    expect(battleEffectSource).toContain('opacity: 0.68');
    expect(globeSceneSource).toContain('const projectileScale = battleProjectileScale(effectScale);');
    expect(globeSceneSource).toContain('this.battleProjectilePool.acquire(color, result.conquered)');
    expect(globeSceneSource).toContain('projectile.scale.setScalar(effect.projectileScale * pulse);');
    expect(globeSceneSource).toContain('const pulse = 0.985 + Math.sin(progress * Math.PI * 8) * 0.025;');
    expect(globeSceneSource).toContain('trailMaterial.opacity = 0.11 * projectileFade;');
    expect(globeSceneSource).toContain('bodyMaterial.opacity = 0.52 * projectileFade;');
    expect(globeSceneSource).toContain('coreMaterial.opacity = 0.68 * projectileFade;');
    expect(globeSceneSource).not.toContain('impactRing');
    expect(globeSceneSource).not.toContain('impactFlash');
    expect(globeSceneSource).not.toContain('BATTLE_IMPACT_');
    expect(globeSceneSource).not.toContain('new THREE.SphereGeometry(0.031, 16, 10)');
  });

  it('prewarms a hard-capped projectile pool and reuses the same shell', () => {
    const pool = new GlobeBattleProjectilePool(2);
    const first = pool.acquire(0xff0000, false);
    const second = pool.acquire(0x00ffff, true);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(pool.acquire(0xffffff, false)).toBeUndefined();
    expect(pool.activeCount).toBe(2);

    pool.release(first!);
    const reused = pool.acquire(0x123456, false);
    expect(reused).toBe(first);
    expect(reused!.materials[0].color.getHex()).toBe(0x123456);
    expect(pool.capacity).toBe(2);
    expect(pool.activeCount).toBe(2);
    pool.dispose();
  });

  it('animates a red geographic wave with uniforms and a static territory mask', () => {
    expect(battleEffectSource).toContain('uWaveProgress: progressUniform');
    expect(battleEffectSource).toContain('float maskCoverage = texture2D(uMask, vec2(maskU, maskV)).a;');
    expect(battleEffectSource).toContain('if (maskCoverage < 0.58) discard;');
    expect(battleEffectSource).toContain('float territory = smoothstep(0.58, 0.90, maskCoverage);');
    expect(battleEffectSource).not.toContain('texture2D(uMask, vWaveUv).r');
    expect(battleEffectSource).not.toContain('territory < 0.02');
    expect(battleEffectSource).toContain('uBandWidth * 0.72, uBandWidth * 1.28');
    expect(battleEffectSource).toContain('waveRadius - uBandWidth * 0.65');
    expect(battleEffectSource).toContain('waveRadius + uBandWidth * 0.65');
    expect(battleEffectSource).toContain('gl_FragColor = vec4(waveColor, alpha);');
    expect(battleEffectSource).toContain('leadingBand * 0.56 + echoBand * 0.18');
    expect(battleEffectSource).toContain('for (const ring of country.rings)');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, -MASK_WIDTH);');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, 0);');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, MASK_WIDTH);');
    expect(battleEffectSource).toContain("context.fill('evenodd');");
    expect(globeSceneSource).toContain('if (impactWave) group.add(impactWave.mesh);');
    expect(globeSceneSource).toContain('effect.impactWave.progressUniform.value = THREE.MathUtils.smoothstep(');
    expect(globeSceneSource).toContain('duration: this.reducedMotion ? 460 :');
    expect(globeSceneSource).toContain('effect.impactWave?.dispose();');
    expect(globeSceneSource).toContain('const impactWave = !this.reducedMotion && targetCountry');
    expect(battleEffectSource.match(/texture\.needsUpdate/g)).toBeNull();
  });

  it('keeps the transient wave inexpensive and mipmap-free', () => {
    expect(battleEffectSource).toContain('const MASK_WIDTH = 512;');
    expect(battleEffectSource).toContain('const MASK_HEIGHT = 256;');
    expect(battleEffectSource).toContain('texture.generateMipmaps = false;');
    expect(battleEffectSource).toContain('texture.minFilter = THREE.LinearFilter;');
    expect(battleEffectSource).toContain('texture.magFilter = THREE.LinearFilter;');
    expect(battleEffectSource).toContain('texture.wrapS = THREE.RepeatWrapping;');
    expect(battleEffectSource).toContain('texture.wrapT = THREE.ClampToEdgeWrapping;');
    expect(battleEffectSource).toContain('texture.colorSpace = THREE.NoColorSpace;');
    expect(battleEffectSource).not.toContain('globeRadius * 1.027');
    expect(battleEffectSource).toContain('new THREE.BufferGeometry()');
    expect(battleEffectSource).toContain("geometry.setAttribute('position'");
    expect(battleEffectSource).toContain('geometry.setIndex(indices);');
    expect(battleEffectSource).toContain('const surfaceRadius = globeOverlayRadius(globeRadius);');
    expect(battleEffectSource).toContain('export const GLOBE_BATTLE_WAVE_CACHE_CAPACITY = 12;');
    expect(battleEffectSource).toContain('this.evictInactiveUntilBelowCapacity();');
    expect(globeSceneSource).toContain('this.battleEffects.length >= BATTLE_EFFECT_MAX_ACTIVE');
    expect(globeSceneSource).toContain('impactDirection.dot(cameraDirection) < -0.08');
    expect(battleEffectSource).not.toContain('radiusSampler');
    expect(battleEffectSource).toContain('depthTest: true');
    expect(globeSceneSource).not.toContain('borderRadiusSampler');
  });

  it('uses canonical globe triangles only inside the conservative reachable cap', () => {
    expect(battleEffectSource).toContain('const capAngle = Math.min(Math.PI, maximumAngleRadians + bandWidth * 1.28);');
    expect(battleEffectSource).toContain('if (row > 0) addTriangle(');
    expect(battleEffectSource).toContain(
      'if (row < GLOBE_SPHERE_HEIGHT_SEGMENTS - 1) addTriangle(',
    );
    expect(battleEffectSource).toContain('Math.max(0, capAngle) + WAVE_CAP_CELL_PADDING');
    expect(battleEffectSource).toContain('const candidateRows = globeBattleWaveCandidateRows(normalizedImpact, capAngle);');
    expect(battleEffectSource).toContain('for (let row = firstRow; row <= lastRow; row += 1)');
    expect(battleEffectSource).toContain('geometry.computeBoundingSphere();');
    expect(battleEffectSource).toContain('float maskU = fract(atan(direction.z, -direction.x)');
    expect(battleEffectSource).toContain('float maskV = asin(clamp(direction.y, -1.0, 1.0))');
    const earlyDiscard = battleEffectSource.indexOf('if (uWaveProgress <= 0.0) discard;');
    const maskSample = battleEffectSource.indexOf('texture2D(uMask, vec2(maskU, maskV)).a');
    expect(earlyDiscard).toBeGreaterThan(-1);
    expect(maskSample).toBeGreaterThan(earlyDiscard);
  });

  it('bounds first-hit cap construction to the latitude rows the wave can touch', () => {
    const equatorial = globeBattleWaveCandidateRows(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(8),
    );
    const polar = globeBattleWaveCandidateRows(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(8),
    );
    expect(equatorial.totalCellCount).toBe(
      GLOBE_SPHERE_WIDTH_SEGMENTS * GLOBE_SPHERE_HEIGHT_SEGMENTS,
    );
    expect(equatorial.cellCount).toBe(7_040);
    expect(polar.cellCount).toBe(3_520);
    expect(equatorial.cellCount).toBeLessThan(equatorial.totalCellCount * 0.13);
    expect(polar.cellCount).toBeLessThan(polar.totalCellCount * 0.08);
    expect(equatorial.firstRow).toBeGreaterThan(0);
    expect(equatorial.lastRow).toBeLessThan(GLOBE_SPHERE_HEIGHT_SEGMENTS - 1);
    expect(polar.firstRow).toBe(0);
  });

  it('matches the exact canonical full-globe triangle selection', () => {
    const padding = Math.hypot(
      Math.PI / GLOBE_SPHERE_HEIGHT_SEGMENTS,
      Math.PI * 2 / GLOBE_SPHERE_WIDTH_SEGMENTS,
    );
    const referenceTriangleCount = (rawDirection: THREE.Vector3, capAngle: number): number => {
      const direction = rawDirection.clone();
      if (direction.lengthSq() <= 1e-12) direction.set(0, 1, 0);
      else direction.normalize();
      const minimumDot = Math.cos(Math.min(Math.PI, Math.max(0, capAngle) + padding));
      const dot = (column: number, row: number): number => {
        const theta = row / GLOBE_SPHERE_HEIGHT_SEGMENTS * Math.PI;
        const phi = column / GLOBE_SPHERE_WIDTH_SEGMENTS * Math.PI * 2;
        const sinTheta = Math.sin(theta);
        return -Math.cos(phi) * sinTheta * direction.x
          + Math.cos(theta) * direction.y
          + Math.sin(phi) * sinTheta * direction.z;
      };
      let triangles = 0;
      for (let row = 0; row < GLOBE_SPHERE_HEIGHT_SEGMENTS; row += 1) {
        for (let column = 0; column < GLOBE_SPHERE_WIDTH_SEGMENTS; column += 1) {
          const a = dot(column + 1, row);
          const b = dot(column, row);
          const c = dot(column, row + 1);
          const d = dot(column + 1, row + 1);
          if (row > 0 && Math.max(a, b, d) >= minimumDot) triangles += 1;
          if (row < GLOBE_SPHERE_HEIGHT_SEGMENTS - 1
            && Math.max(b, c, d) >= minimumDot) triangles += 1;
        }
      }
      return triangles;
    };
    const cases = [
      [new THREE.Vector3(1, 0, 0), 8],
      [new THREE.Vector3(0.4, 0.7, -0.3), 18],
      [new THREE.Vector3(0, 1, 0), 3],
      [new THREE.Vector3(0, -1, 0), 27],
    ] as const;
    for (const [direction, angleDegrees] of cases) {
      const angle = THREE.MathUtils.degToRad(angleDegrees);
      const geometry = createGlobeBattleWaveSurfaceGeometry(direction, 5, angle);
      expect(geometry.getIndex()!.count / 3).toBe(referenceTriangleCount(direction, angle));
      geometry.dispose();
    }
  });

  it('builds one finite constant-surface indexed cap with bounded topology cost', () => {
    const geometry = createGlobeBattleWaveSurfaceGeometry(
      new THREE.Vector3(1, 0, 0),
      5,
      THREE.MathUtils.degToRad(12),
    );
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThan(
      (GLOBE_SPHERE_WIDTH_SEGMENTS + 1) * (GLOBE_SPHERE_HEIGHT_SEGMENTS + 1),
    );
    expect(index!.count).toBeGreaterThan(0);
    expect(index!.count).toBeLessThan(
      GLOBE_SPHERE_WIDTH_SEGMENTS * GLOBE_SPHERE_HEIGHT_SEGMENTS * 6,
    );
    const expectedRadius = globeOverlayRadius(5);
    expect(expectedRadius - 5).toBeCloseTo(GLOBE_SURFACE_CLEARANCE, 8);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const radius = Math.hypot(
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      );
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeCloseTo(expectedRadius, 5);
    }
    geometry.dispose();
  });

  it('keeps canonical caps finite at the antimeridian and both poles', () => {
    const directions = [
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
    ];
    for (const direction of directions) {
      const geometry = createGlobeBattleWaveSurfaceGeometry(
        direction,
        5,
        THREE.MathUtils.degToRad(3),
      );
      const position = geometry.getAttribute('position');
      expect(position.count).toBeGreaterThan(0);
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        expect(Number.isFinite(position.getX(vertex))).toBe(true);
        expect(Number.isFinite(position.getY(vertex))).toBe(true);
        expect(Number.isFinite(position.getZ(vertex))).toBe(true);
      }
      geometry.dispose();
    }
  });
});
