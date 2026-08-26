import { describe, expect, it } from 'vitest';
import { BATTLE_INTERVAL_TICKS, STALE_WAR_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
} from './types';
import { processWarsV2 } from './war';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const luxembourg = nationIdV2('lux');
const belgiumTerritory = territoryIdV2('bel');
const netherlandsTerritory = territoryIdV2('nld');
const luxembourgTerritory = territoryIdV2('lux');

function front(targetId: typeof netherlandsTerritory | typeof luxembourgTerritory): FrontOperationV2 {
  return {
    commanderId: belgium,
    sourceId: belgiumTerritory,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 200,
    momentum: 0,
  };
}

function war(id: string, defenderId: typeof netherlands | typeof luxembourg, operation: FrontOperationV2): WarStateV2 {
  return {
    id,
    attackerId: belgium,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [operation],
    defenderOperations: [],
    revenge: null,
  };
}

describe('shared-source multi-war fairness', () => {
  it('rotates one source army between simultaneous wars instead of starving the later war', () => {
    const state = createWorldStateV2(54_001);
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    state.tick = WAR_MOBILIZATION_TICKS;
    // Oversized temporary field forces keep this test focused on scheduling;
    // neither target is close to conquest during the stale-war window.
    state.territories[belgiumTerritory]!.army.manpower = 10;
    state.territories[belgiumTerritory]!.army.capacity = 10;
    state.territories[netherlandsTerritory]!.army.manpower = 4;
    state.territories[netherlandsTerritory]!.army.capacity = 4;
    state.territories[luxembourgTerritory]!.army.manpower = 4;
    state.territories[luxembourgTerritory]!.army.capacity = 4;
    const first = war('war-a-first', netherlands, front(netherlandsTerritory));
    const second = war('war-z-second', luxembourg, front(luxembourgTerritory));
    state.wars = [first, second];

    const battleWarIds: string[] = [];
    const endTick = WAR_MOBILIZATION_TICKS + STALE_WAR_TICKS + 4;
    for (; state.tick <= endTick; state.tick += 1) {
      if ((state.tick - WAR_MOBILIZATION_TICKS) % BATTLE_INTERVAL_TICKS !== 0) continue;
      battleWarIds.push(...processWarsV2(state, WORLD_CONTENT_V2).map((battle) => battle.warId));
    }

    expect(battleWarIds).toContain(first.id);
    expect(battleWarIds).toContain(second.id);
    expect(first.battles).toBeGreaterThanOrEqual(4);
    expect(second.battles).toBeGreaterThanOrEqual(4);
    expect(state.wars.some((candidate) => candidate.id === first.id)).toBe(true);
    expect(state.wars.some((candidate) => candidate.id === second.id)).toBe(true);
    expect(state.events.some((event) => /without a legal battle/i.test(event.message))).toBe(false);
  });
});
