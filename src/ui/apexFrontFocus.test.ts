import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { nationIdV2, territoryIdV2, type FrontOperationV2 } from '../sim/v2/types';
import {
  planApexFrontFocusV2,
  rankApexFrontPrioritiesV2,
} from './apexFrontFocus';

function operation(
  sourceId: ReturnType<typeof territoryIdV2>,
  targetId: ReturnType<typeof territoryIdV2>,
  access: FrontOperationV2['access'] = 'land',
): FrontOperationV2 {
  return {
    commanderId: nationIdV2('bel'),
    sourceId,
    targetId,
    doctrine: 'pressure',
    access,
    startedTick: 10,
    lastBattleTick: 10,
    holdUntilTick: 20,
    momentum: 0,
  };
}

describe('shared Best Target focus + EONSCAR plan', () => {
  it('stages an assault from owned territory and never sends EONSCAR into the enemy', () => {
    const state = createWorldStateV2(81_001);
    const belgium = nationIdV2('bel');
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('nld');
    const front = operation(sourceId, targetId);
    const plan = planApexFrontFocusV2(state.territories, belgium, {
      id: 'war-focus-1', attackerOperations: [front], defenderOperations: [],
    }, sourceId, targetId);

    expect(plan).toEqual({
      allowed: true,
      mission: 'assault-support',
      destinationId: sourceId,
      hostileTerritoryId: targetId,
      front: { warId: 'war-focus-1', sourceId, targetId },
    });
    expect(state.territories[plan.destinationId!]!.owner).toBe(belgium);
  });

  it('uses the owned side of a defensive front and rejects a stale or foreign front', () => {
    const state = createWorldStateV2(81_002);
    const belgium = nationIdV2('bel');
    const sourceId = territoryIdV2('nld');
    const targetId = territoryIdV2('bel');
    const front = operation(sourceId, targetId);
    const war = { id: 'war-focus-2', attackerOperations: [front], defenderOperations: [] };

    expect(planApexFrontFocusV2(
      state.territories, belgium, war, sourceId, targetId,
    )).toMatchObject({
      allowed: true,
      mission: 'defense',
      destinationId: targetId,
      hostileTerritoryId: sourceId,
    });
    expect(planApexFrontFocusV2(
      state.territories, belgium, war, territoryIdV2('deu'), targetId,
    )).toEqual({ allowed: false, reason: 'That front is no longer active.' });
  });

  it('ranks active fronts deterministically and makes Survival more land-first', () => {
    const land = {
      warId: 'war-b', sourceId: territoryIdV2('bel'), targetId: territoryIdV2('nld'),
      access: 'land' as const, mission: 'assault-support' as const,
      ownPower: 80, enemyPower: 80, antarcticObjective: false,
    };
    const naval = {
      warId: 'war-a', sourceId: territoryIdV2('bel'), targetId: territoryIdV2('gbr'),
      access: 'naval' as const, mission: 'assault-support' as const,
      ownPower: 200, enemyPower: 80, antarcticObjective: false,
    };
    expect(rankApexFrontPrioritiesV2([naval, land], 'survival')[0]).toBe(land);
    expect(rankApexFrontPrioritiesV2([naval, land], 'campaign')).toEqual([naval, land]);
    expect(rankApexFrontPrioritiesV2([land, naval], 'campaign')).toEqual([naval, land]);
  });
});
