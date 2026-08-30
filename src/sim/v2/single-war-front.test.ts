import { describe, expect, it } from 'vitest';
import { BATTLE_INTERVAL_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import {
  invalidateTerritoryIndexV2,
  selectActiveFrontCountV2,
  selectCanonicalWarFrontsV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  canonicalizeWarFrontV2,
  declareWarV2,
  processWarsV2,
  synchronizeWarFrontsV2,
} from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const lux = nationIdV2('lux');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const deuTerritory = territoryIdV2('deu');
const luxTerritory = territoryIdV2('lux');

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: commanderId === bel ? 'pressure' : 'counteroffensive',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 24,
    momentum: 0,
  };
}

function activeWar(attackerId = bel, defenderId = nld, id = 'war-one-front'): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
    campaign: {
      attackerObjective: 3,
      defenderObjective: 1,
      attackerCaptures: 0,
      defenderCaptures: 0,
      consolidationUntilTick: 0,
      expiresTick: 260,
    },
  };
}

function multipleBorderState(seed = 91_001): { state: WorldStateV2; war: WarStateV2 } {
  const state = createWorldStateV2(seed);
  state.wars = [];
  state.tick = WAR_MOBILIZATION_TICKS;
  state.territories[deuTerritory].owner = bel;
  state.territories[deuTerritory].coreOwner = bel;
  state.territories[deuTerritory].integration = 1;
  delete state.territories[deuTerritory].integrationProgram;
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
  for (const sourceId of [belTerritory, deuTerritory]) {
    const army = state.territories[sourceId]!.army;
    army.manpower = Math.max(0.05, army.capacity * 0.9);
  }
  const war = activeWar();
  state.wars.push(war);
  return { state, war };
}

describe('one bilateral war is one canonical front', () => {
  it('keeps the declaring attacker and APEX-facing assault on the first pulse', () => {
    const state = createWorldStateV2(91_000);
    state.wars = [];
    enterPostBlackoutCampaignForTestV2(state);
    state.players[bel]!.treasury = 1_000;
    state.territories[belTerritory]!.army.manpower = 0.001;
    state.territories[nldTerritory]!.army.manpower = Math.max(
      0.1,
      state.territories[nldTerritory]!.army.capacity,
    );

    expect(declareWarV2(state, WORLD_CONTENT_V2, bel, nld).accepted).toBe(true);
    const war = state.wars[0]!;
    expect(war.attackerOperations).toHaveLength(1);
    expect(war.defenderOperations).toHaveLength(0);
    state.tick = war.startedTick + WAR_MOBILIZATION_TICKS;
    const battle = processWarsV2(state, WORLD_CONTENT_V2)[0];

    expect(battle?.attackerId).toBe(bel);
  });

  it('uses one operation and one battle across multiple borders', () => {
    const { state, war } = multipleBorderState();
    war.attackerOperations = [
      operation(bel, belTerritory, nldTerritory),
      operation(bel, deuTerritory, nldTerritory),
    ];

    const battles = processWarsV2(state, WORLD_CONTENT_V2);

    expect(battles).toHaveLength(1);
    expect(war.attackerOperations.length + war.defenderOperations.length).toBe(1);
    expect(selectCanonicalWarFrontsV2(war)).toHaveLength(1);
    expect(selectActiveFrontCountV2(state, bel)).toBe(1);
  });

  it('lets initiative reverse without creating a second counterattack front', () => {
    const { state, war } = multipleBorderState(91_002);
    war.attackerOperations = [operation(bel, belTerritory, nldTerritory)];
    war.defenderOperations = [operation(nld, nldTerritory, belTerritory)];
    state.territories[nldTerritory]!.army.manpower = Math.max(
      0.1,
      state.territories[nldTerritory]!.army.capacity,
    );
    state.territories[belTerritory]!.army.manpower = 0.001;

    processWarsV2(state, WORLD_CONTENT_V2);

    expect(war.attackerOperations.length + war.defenderOperations.length).toBe(1);
    expect(selectActiveFrontCountV2(state, bel)).toBe(1);
  });

  it('counts a third hostile country as a second front, never as part of the first', () => {
    const state = createWorldStateV2(91_003);
    state.wars = [activeWar(bel, nld, 'war-nld'), activeWar(bel, lux, 'war-lux')];

    expect(selectActiveFrontCountV2(state, bel)).toBe(2);
    expect(selectActiveFrontCountV2(state, nld)).toBe(1);
    expect(selectActiveFrontCountV2(state, lux)).toBe(1);
  });

  it('moves the same front to the next legal objective after conquest', () => {
    const state = createWorldStateV2(91_004);
    state.wars = [];
    state.tick = WAR_MOBILIZATION_TICKS;
    state.territories[luxTerritory]!.owner = nld;
    state.territories[luxTerritory]!.coreOwner = nld;
    state.territories[nldTerritory]!.army.manpower = 0;
    state.territories[luxTerritory]!.army.manpower = Math.max(
      0.01,
      state.territories[luxTerritory]!.army.capacity * 0.2,
    );
    state.territories[belTerritory]!.army.manpower = Math.max(
      0.1,
      state.territories[belTerritory]!.army.capacity,
    );
    invalidateTerritoryIndexV2(state);
    const war = activeWar();
    state.wars.push(war);

    const first = processWarsV2(state, WORLD_CONTENT_V2);
    expect(first.some((battle) => battle.conquered)).toBe(true);
    expect(state.wars).toContain(war);
    state.tick += BATTLE_INTERVAL_TICKS;
    synchronizeWarFrontsV2(state, WORLD_CONTENT_V2);

    expect(war.id).toBe('war-one-front');
    expect(war.attackerOperations.length + war.defenderOperations.length).toBe(1);
    expect(selectCanonicalWarFrontsV2(war)[0]?.targetId).toBe(luxTerritory);
  });

  it('authenticates then collapses legacy duplicate operations on load', () => {
    const { state, war } = multipleBorderState(91_005);
    war.attackerOperations = [operation(bel, belTerritory, nldTerritory)];
    const save = structuredClone(createSaveV2(state, WORLD_CONTENT_V2));
    save.wars[0]!.attackerOperations.push(operation(bel, deuTerritory, nldTerritory));
    save.wars[0]!.defenderOperations.push(operation(nld, nldTerritory, belTerritory));
    save.canonicalStateHash = canonicalStateHashV2(save);

    const loaded = loadSaveV2(save, WORLD_CONTENT_V2);

    expect(loaded.wars[0]!.attackerOperations.length
      + loaded.wars[0]!.defenderOperations.length).toBe(1);
    expect(selectActiveFrontCountV2(loaded, bel)).toBe(1);
  });

  it('charges the normalized war as one front, not once per legacy border', () => {
    const { state, war } = multipleBorderState(91_006);
    war.attackerOperations = [operation(bel, belTerritory, nldTerritory)];
    war.attackerOperations.push(operation(bel, deuTerritory, nldTerritory));
    const duplicatedCost = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      bel,
    ).warOperations;
    canonicalizeWarFrontV2(state, WORLD_CONTENT_V2, war);

    const canonicalCost = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      bel,
    ).warOperations;
    expect(canonicalCost).toBeLessThan(duplicatedCost);
    expect(canonicalCost).toBeGreaterThan(0);
    expect(selectActiveFrontCountV2(state, bel)).toBe(1);
  });
});
