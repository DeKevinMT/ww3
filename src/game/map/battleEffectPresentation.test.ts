import { describe, expect, it } from 'vitest';
import worldMapSceneSource from './WorldMapScene.ts?raw';
import legacyMapSceneSource from './MapScene.ts?raw';
import globeSceneSource from './three/ThreeGlobeScene.ts?raw';
import {
  BATTLE_EFFECT_MAX_ACTIVE,
  BATTLE_EFFECT_SCALE,
  BATTLE_PROJECTILE_SCALE,
  battleEffectScale,
  battleProjectileScale,
  battleTerritoryWaveRadiusDegrees,
} from './battleEffectPresentation';

describe('battle effect presentation', () => {
  it('renders every attack with one authored scale regardless of magnitude', () => {
    const inputs = [
      {},
      { attackerPower: 0.08 },
      { attackerPower: 180 },
      { attackerPower: 1_000_000 },
      { attackerPower: -100, attackerLosses: 200, defenderLosses: 400 },
      { attackerPower: Number.NaN, attackerLosses: Number.POSITIVE_INFINITY },
    ];
    expect(inputs.map((input) => battleEffectScale(input)))
      .toEqual(inputs.map(() => BATTLE_EFFECT_SCALE));
  });

  it('keeps projectile scale and the active-effect budget constant', () => {
    expect([
      battleProjectileScale(-100),
      battleProjectileScale(BATTLE_EFFECT_SCALE),
      battleProjectileScale(1_000_000),
      battleProjectileScale(Number.NaN),
    ]).toEqual([
      BATTLE_PROJECTILE_SCALE,
      BATTLE_PROJECTILE_SCALE,
      BATTLE_PROJECTILE_SCALE,
      BATTLE_PROJECTILE_SCALE,
    ]);
    expect(BATTLE_EFFECT_MAX_ACTIVE).toBe(4);
  });

  it('never reads battle magnitude in any 2D or 3D visual route', () => {
    const flatPlayBattle = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('  playBattle(result: MapBattleEvent): void {'),
      worldMapSceneSource.indexOf('  private createBattleMarker('),
    );
    const globePlayBattle = globeSceneSource.slice(
      globeSceneSource.indexOf('  playBattle(result: MapBattleEvent): void {'),
      globeSceneSource.indexOf('  resetCamera(): void'),
    );
    const legacyPlayBattle = legacyMapSceneSource.slice(
      legacyMapSceneSource.indexOf('  playBattle(result: BattleEvent): void {'),
      legacyMapSceneSource.indexOf('  setLens('),
    );
    for (const renderer of [flatPlayBattle, globePlayBattle, legacyPlayBattle]) {
      expect(renderer).not.toMatch(
        /result\.(?:attackerPower|defenderPower|attackerLosses|defenderLosses|manpower)/,
      );
    }
    expect(flatPlayBattle).toContain('const effectScale = this.combatWorldSize(1);');
    expect(globePlayBattle).toContain('const effectScale = battleEffectScale(result);');
  });

  it('coalesces duplicate source-target bursts in both renderers', () => {
    for (const renderer of [worldMapSceneSource, globeSceneSource]) {
      expect(renderer).toContain('BATTLE_EFFECT_COALESCE_WINDOW_MS');
      expect(renderer).toContain('const effectKey = `${result.sourceId}>${result.targetId}`;');
    }
    expect(worldMapSceneSource).toContain('this.recentBattleEffectStarts.has(effectKey)');
    expect(globeSceneSource).toContain('effect.key === effectKey');
  });

  it('batches the flat-map territory flash into one tween allocation', () => {
    const flatPlayBattle = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('  playBattle(result: MapBattleEvent): void {'),
      worldMapSceneSource.indexOf('  private playBattleRouteEffect('),
    );
    expect(flatPlayBattle).toContain('const battleParts = target.parts.slice(0, 20);');
    expect(flatPlayBattle).toContain('targets: battleParts');
    expect(flatPlayBattle).not.toContain('targets: part, alpha:');
  });

  it('holds a Phaser budget slot until the impact has fully drained', () => {
    expect(worldMapSceneSource).toContain('this.activeBattleEffects >= BATTLE_EFFECT_MAX_ACTIVE');
    expect(worldMapSceneSource).toContain('Math.max(duration + (ringCount - 1) * ringDelay, burstDuration) + 16');
    const projectileCompletion = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('onComplete: () => {\n        projectile.destroy();'),
      worldMapSceneSource.indexOf('  private createBattleMarker('),
    );
    expect(projectileCompletion).toContain('this.playBattleImpact(');
    expect(projectileCompletion).not.toContain(
      'projectile.destroy();\n        this.activeBattleEffects = Math.max',
    );
  });

  it('covers detached target geography and remains bounded', () => {
    const radius = battleTerritoryWaveRadiusDegrees([179, 0], [[
      [178, -1], [-178, -1], [-178, 1], [178, 1], [178, -1],
    ]]);
    expect(radius).toBeGreaterThan(2.5);
    expect(radius).toBeLessThan(4);

    expect(battleTerritoryWaveRadiusDegrees([0, 0], [])).toBe(0.8);
    expect(battleTerritoryWaveRadiusDegrees([0, 0], [[[179, 0]]])).toBe(70);
  });
});
