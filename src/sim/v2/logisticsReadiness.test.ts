import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  logisticsReadinessStatusV2,
  presentLogisticsReadinessV2,
  selectEmpireLogisticsReadinessV2,
} from './logisticsReadiness';
import { nationIdV2, type FrontOperationV2, type WarStateV2 } from './types';
import { supplyFactorV2 } from './war';

const BEL = nationIdV2('bel');
const NLD = nationIdV2('nld');
const DEU = nationIdV2('deu');

function operation(targetId: typeof BEL, access: 'land' | 'naval'): FrontOperationV2 {
  return {
    commanderId: BEL,
    sourceId: WORLD_CONTENT_V2.nations[BEL]!.capitalId,
    targetId: WORLD_CONTENT_V2.nations[targetId]!.capitalId,
    doctrine: 'balanced',
    access,
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(id: string, defenderId: typeof BEL, front: FrontOperationV2): WarStateV2 {
  return {
    id,
    attackerId: BEL,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000,
    attackerOperations: [front],
    defenderOperations: [],
    revenge: null,
  };
}

describe('logistics readiness presentation', () => {
  it('uses clear stable readiness thresholds', () => {
    expect(logisticsReadinessStatusV2(0.72)).toBe('ready');
    expect(logisticsReadinessStatusV2(0.50)).toBe('strained');
    expect(logisticsReadinessStatusV2(0.499)).toBe('critical');
    expect(presentLogisticsReadinessV2(0.40, 'naval', 7_000).limitingReason)
      .toBe('Front demand mostly unfunded');
    expect(presentLogisticsReadinessV2(1, 'land', 0, false)).toMatchObject({
      percent: 0,
      status: 'critical',
      limitingReason: 'No army available',
    });
  });

  it('shows zero war supply when no front is active', () => {
    const state = createWorldStateV2(701);
    state.wars = [];
    const readiness = selectEmpireLogisticsReadinessV2(state, WORLD_CONTENT_V2, BEL);
    expect(readiness.percent).toBe(0);
    expect(readiness.status).toBe('idle');
    expect(readiness.statusLabel).toBe('NO WAR');
    expect(readiness.frontCount).toBe(0);
    expect(readiness.limitingReason).toBe('No active war supply demand');
  });

  it('uses the exact combat supply factors, weights fronts and exposes the weakest', () => {
    const state = createWorldStateV2(702);
    const land = operation(NLD, 'land');
    const naval = operation(DEU, 'naval');
    state.wars = [war('land-front', NLD, land), war('naval-front', DEU, naval)];
    const readiness = selectEmpireLogisticsReadinessV2(state, WORLD_CONTENT_V2, BEL);
    expect(readiness.frontCount).toBe(2);
    for (const front of readiness.fronts) {
      expect(front.supplyFactor).toBeCloseTo(supplyFactorV2(
        state,
        WORLD_CONTENT_V2,
        BEL,
        front.sourceId,
        front.access,
        front.targetId,
      ), 6);
    }
    expect(readiness.weakest?.factor).toBe(Math.min(...readiness.fronts.map((front) => front.factor)));
    const weighted = readiness.fronts.reduce((sum, front) => sum + front.factor * front.weight, 0)
      / readiness.fronts.reduce((sum, front) => sum + front.weight, 0);
    expect(readiness.factor).toBeCloseTo(weighted, 6);
  });
});
