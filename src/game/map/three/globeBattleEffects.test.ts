import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGlobeBattleWaveSurfaceGeometry } from './globeBattleEffects';
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
    expect(globeSceneSource).toContain('effect.projectile.scale.setScalar(effect.projectileScale * pulse);');
    expect(globeSceneSource).toContain('const pulse = 0.985 + Math.sin(progress * Math.PI * 8) * 0.025;');
    expect(globeSceneSource).toContain('trailMaterial.opacity = 0.11 * projectileFade;');
    expect(globeSceneSource).toContain('bodyMaterial.opacity = 0.52 * projectileFade;');
    expect(globeSceneSource).toContain('coreMaterial.opacity = 0.68 * projectileFade;');
    expect(globeSceneSource).not.toContain('impactRing');
    expect(globeSceneSource).not.toContain('impactFlash');
    expect(globeSceneSource).not.toContain('BATTLE_IMPACT_');
    expect(globeSceneSource).not.toContain('new THREE.SphereGeometry(0.031, 16, 10)');
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
    expect(battleEffectSource).toContain('gl_FragColor = vec4(1.0, 0.055, 0.025, alpha);');
    expect(battleEffectSource).toContain('for (const ring of country.rings)');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, -MASK_WIDTH);');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, 0);');
    expect(battleEffectSource).toContain('traceUnwrappedRing(context, ring, MASK_WIDTH);');
    expect(battleEffectSource).toContain("context.fill('evenodd');");
    expect(globeSceneSource).toContain('if (impactWave) group.add(impactWave.mesh);');
    expect(globeSceneSource).toContain('effect.impactWave.progressUniform.value = THREE.MathUtils.smoothstep(');
    expect(globeSceneSource).toContain('duration: this.reducedMotion ? 620 :');
    expect(globeSceneSource).toContain('effect.impactWave?.maskTexture.dispose();');
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
    expect(battleEffectSource).not.toContain('radiusSampler');
    expect(battleEffectSource).toContain('depthTest: true');
    expect(globeSceneSource).not.toContain('borderRadiusSampler');
  });

  it('uses canonical globe triangles only inside the conservative reachable cap', () => {
    expect(battleEffectSource).toContain('const capAngle = Math.min(Math.PI, maximumAngleRadians + bandWidth * 1.28);');
    expect(battleEffectSource).toContain('if (row > 0) addTriangle(a, b, d);');
    expect(battleEffectSource).toContain(
      'if (row < GLOBE_SPHERE_HEIGHT_SEGMENTS - 1) addTriangle(b, c, d);',
    );
    expect(battleEffectSource).toContain('Math.max(0, capAngle) + WAVE_CAP_CELL_PADDING');
    expect(battleEffectSource).toContain('geometry.computeBoundingSphere();');
    expect(battleEffectSource).toContain('float maskU = fract(atan(direction.z, -direction.x)');
    expect(battleEffectSource).toContain('float maskV = asin(clamp(direction.y, -1.0, 1.0))');
    const earlyDiscard = battleEffectSource.indexOf('if (uWaveProgress <= 0.0) discard;');
    const maskSample = battleEffectSource.indexOf('texture2D(uMask, vec2(maskU, maskV)).a');
    expect(earlyDiscard).toBeGreaterThan(-1);
    expect(maskSample).toBeGreaterThan(earlyDiscard);
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
