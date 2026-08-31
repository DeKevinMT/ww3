import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  selectLocalHostileThreatV2,
  selectOpponentLocalHostileThreatV2,
} from './localHostileThreat';
import { nationIdV2, type PlayerId } from './types';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

function scaleArmy(engine: WorldEngineV2, ownerId: PlayerId, fill: number): void {
  for (const territory of Object.values(engine.state.territories)) {
    if (territory.owner !== ownerId) continue;
    territory.army.manpower = territory.army.capacity * fill;
    territory.army.baseAttack = 10;
    territory.army.baseDefense = 10;
  }
}

describe('local hostile threat', () => {
  it('shows the strongest live opening threat without a tutorial calm period', () => {
    const engine = new WorldEngineV2(95_001);
    const humanId = nationIdV2('slv');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });

    const threat = selectLocalHostileThreatV2(engine.state, engine.content, humanId);
    expect(threat.score).toBeGreaterThan(0);
    expect(threat.topAttackerId).not.toBeNull();
    expect(threat.level).not.toBe('calm');
    expect(threat.candidates[0]?.attackerId).toBe(threat.topAttackerId);
  });

  it('ranks a shared land border far above a long ocean route', () => {
    const engine = new WorldEngineV2(95_002);
    const humanId = nationIdV2('slv');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);

    const land = selectOpponentLocalHostileThreatV2(
      engine.state, engine.content, nationIdV2('gtm'), humanId,
    );
    const ocean = selectOpponentLocalHostileThreatV2(
      engine.state, engine.content, nationIdV2('png'), humanId,
    );

    expect(land).toMatchObject({ access: 'land', distanceKm: 0 });
    expect(ocean?.access).toBe('naval');
    expect(ocean?.distanceKm).toBeGreaterThan(5_000);
    expect(land!.score).toBeGreaterThan(ocean!.score + 20);
    expect(ocean!.score).toBeLessThan(18);
  });

  it('turns an active bilateral front into an imminent local threat', () => {
    const engine = new WorldEngineV2(95_003);
    const humanId = nationIdV2('slv');
    const attackerId = nationIdV2('gtm');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.wars.push({
      id: 'local-threat-war',
      attackerId,
      defenderId: humanId,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    });

    expect(selectOpponentLocalHostileThreatV2(
      engine.state, engine.content, attackerId, humanId,
    )).toMatchObject({ score: 100, level: 'imminent' });
  });

  it('adds gradual land-neighbour pressure when the human has no viable exit', () => {
    const engine = new WorldEngineV2(95_004);
    const humanId = nationIdV2('gnb');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    scaleArmy(engine, humanId, 0.001);
    for (const id of engine.content.nationIds) {
      if (id !== humanId && engine.content.nations[id]?.kind !== 'rogue-ai') {
        scaleArmy(engine, id, 1);
      }
    }
    engine.state.tick = 8;
    const early = selectLocalHostileThreatV2(engine.state, engine.content, humanId);
    engine.state.tick = 112;
    const stuck = selectLocalHostileThreatV2(engine.state, engine.content, humanId);

    expect(stuck.score).toBeGreaterThan(early.score);
    expect(stuck.reasons.join(' ')).toMatch(/No viable local exit/i);
    expect(stuck.candidates[0]?.access).toBe('land');
  });
});
