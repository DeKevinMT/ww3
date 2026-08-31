import { describe, expect, it } from 'vitest';
import {
  PEACE_ARMY_REFILL_CAPACITY_RATE_V2,
  SURVIVAL_REAR_ARMY_REFILL_CAPACITY_RATE_V2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  projectFinanceManpowerPhaseV2,
  selectArmyRefillTerritoryIdsV2,
  selectCurrentPowerV2,
  selectRecruitmentTrainingPipelineV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { resolveScenarioV2 } from './scenarios';
import { markSurvivalScorchedTerritoryV2 } from './survivalEmpire';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const germany = nationIdV2('deu');
const greenland = nationIdV2('grl');

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'balanced',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 26,
    momentum: 0,
  };
}

function war(
  id: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  attackerOperations: FrontOperationV2[] = [],
  defenderOperations: FrontOperationV2[] = [],
): WarStateV2 {
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
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    revenge: null,
    attackerOperations,
    defenderOperations,
  };
}

function fund(state: WorldStateV2, playerId: PlayerId): void {
  state.players[playerId]!.treasury = 1_000_000;
  state.players[playerId]!.budget = { military: 90, research: 5, development: 5 };
  state.players[playerId]!.trainedReserves = 0;
}

function setFill(state: WorldStateV2, playerId: PlayerId, fill: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === playerId) territory.army.manpower = territory.army.capacity * fill;
  }
}

function formedSurvival(seed: number): { engine: WorldEngineV2; content: WorldContentV2 } {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire(greenland, [netherlands])).toEqual({ accepted: true });
  return { engine, content: resolved.content };
}

function unformedSurvival(seed: number): { engine: WorldEngineV2; content: WorldContentV2 } {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
  return { engine, content: resolved.content };
}

describe('fast symmetric army refill', () => {
  it('starts every sovereign country at 100% of effective Army Capacity', () => {
    const state = createWorldStateV2(93_001);
    for (const territoryId of WORLD_CONTENT_V2.territoryIds) {
      if ((WORLD_CONTENT_V2.territories[territoryId]?.kind ?? 'sovereign') !== 'sovereign') {
        continue;
      }
      const army = state.territories[territoryId]!.army;
      expect(army.manpower, String(territoryId)).toBe(army.capacity);
    }
  });

  it('starts ordinary Survival AI at full normal capacity and pristine power', () => {
    const { engine } = unformedSurvival(93_002);
    const army = engine.state.territories[territoryIdV2('deu')]!.army;
    const standardArmy = createWorldStateV2(93_002)
      .territories[territoryIdV2('deu')]!.army;
    expect(army.capacity / standardArmy.capacity).toBeCloseTo(1, 9);
    expect(army.manpower).toBeCloseTo(army.capacity, 9);
    const pristineState = createWorldStateV2(93_002);
    const survivalPower = selectCurrentPowerV2(engine.state, engine.content, germany);
    const pristinePower = selectCurrentPowerV2(
      pristineState, WORLD_CONTENT_V2, germany,
    );
    expect(survivalPower / pristinePower).toBeCloseTo(1, 9);
  });

  it('uses the same fixed 1% peace rate for a player and ordinary AI', () => {
    const playerState = createWorldStateV2(93_003);
    playerState.tick = 100;
    playerState.wars = [];
    setFill(playerState, belgium, 0.50);
    fund(playerState, belgium);
    const aiState = structuredClone(playerState);
    aiState.humanPlayerId = netherlands;
    aiState.humanPlayerIds = [netherlands];

    const playerCapacity = playerState.territories[territoryIdV2('bel')]!.army.capacity;
    const aiCapacity = aiState.territories[territoryIdV2('bel')]!.army.capacity;
    const playerPipeline = selectRecruitmentTrainingPipelineV2(
      playerState, WORLD_CONTENT_V2, belgium,
    );
    const aiPipeline = selectRecruitmentTrainingPipelineV2(
      aiState, WORLD_CONTENT_V2, belgium,
    );

    expect(playerPipeline / playerCapacity).toBeCloseTo(
      PEACE_ARMY_REFILL_CAPACITY_RATE_V2,
      4,
    );
    expect(aiPipeline / aiCapacity).toBeCloseTo(
      PEACE_ARMY_REFILL_CAPACITY_RATE_V2,
      4,
    );
    expect(aiPipeline).toBe(playerPipeline);
  });

  it('freezes fresh recruitment for every participant in an ordinary war', () => {
    const state = createWorldStateV2(93_004);
    state.tick = 100;
    setFill(state, belgium, 0.50);
    setFill(state, netherlands, 0.50);
    fund(state, belgium);
    fund(state, netherlands);
    state.wars = [war('ordinary-war', belgium, netherlands)];

    for (const playerId of [belgium, netherlands]) {
      expect(selectRecruitmentTrainingPipelineV2(
        state, WORLD_CONTENT_V2, playerId,
      )).toBe(0);
      expect(selectWeeklyFinanceBreakdownV2(
        state, WORLD_CONTENT_V2, playerId,
      ).passiveRecruitment).toBe(0);
    }
  });

  it('freezes every player territory during the permanent Rogue war', () => {
    const { engine, content } = formedSurvival(93_005);
    const frontId = territoryIdV2('grl');
    const rearId = territoryIdV2('nld');
    engine.state.territories[frontId]!.army.manpower = 0;
    engine.state.territories[rearId]!.army.manpower = 0;
    fund(engine.state, greenland);
    engine.state.wars = [war(
      'survival-player-front',
      ROGUE_AI_NATION_ID_V2,
      greenland,
      [],
      [operation(greenland, frontId, ANTARCTIC_TERRITORY_IDS_V2[0]!)],
    )];

    expect(selectArmyRefillTerritoryIdsV2(engine.state, content, greenland))
      .toEqual([]);
    expect(selectRecruitmentTrainingPipelineV2(engine.state, content, greenland))
      .toBe(0);
    const finance = selectWeeklyFinanceBreakdownV2(engine.state, content, greenland);
    const projection = projectFinanceManpowerPhaseV2(
      engine.state,
      content,
      greenland,
      finance,
    );
    const projectedFront = projection.territories.find((territory) => territory.id === frontId)!;
    const projectedRear = projection.territories.find((territory) => territory.id === rearId)!;
    expect(projectedFront.manpower).toBe(0);
    expect(projectedRear.manpower).toBe(0);
  });

  it('freezes ordinary Survival AI recruitment in its Rogue war', () => {
    const { engine, content } = unformedSurvival(93_006);
    const germanyId = territoryIdV2('deu');
    engine.state.territories[germanyId]!.army.manpower = 0;
    fund(engine.state, germany);
    engine.state.wars = [war(
      'survival-ai-rear',
      ROGUE_AI_NATION_ID_V2,
      germany,
    )];
    expect(selectRecruitmentTrainingPipelineV2(engine.state, content, germany))
      .toBeCloseTo(
        engine.state.territories[germanyId]!.army.capacity
          * SURVIVAL_REAR_ARMY_REFILL_CAPACITY_RATE_V2,
        6,
      );

    engine.state.wars = [war(
      'survival-ai-front',
      ROGUE_AI_NATION_ID_V2,
      germany,
      [],
      [operation(germany, germanyId, ANTARCTIC_TERRITORY_IDS_V2[0]!)],
    )];
    expect(selectRecruitmentTrainingPipelineV2(engine.state, content, germany)).toBe(0);
  });

  it('never recruits locally in a Rogue-held world corridor', () => {
    const { engine, content } = formedSurvival(93_007);
    const corridorId = territoryIdV2('deu');
    const corridor = engine.state.territories[corridorId]!;
    corridor.owner = ROGUE_AI_NATION_ID_V2;
    corridor.coreOwner = ROGUE_AI_NATION_ID_V2;
    corridor.integration = 0;
    corridor.army.manpower = 0;
    markSurvivalScorchedTerritoryV2(engine.state, content, corridorId);
    invalidateTerritoryIndexV2(engine.state);
    engine.state.wars = [war(
      'survival-rogue-corridor',
      ROGUE_AI_NATION_ID_V2,
      greenland,
    )];

    expect(selectArmyRefillTerritoryIdsV2(
      engine.state,
      content,
      ROGUE_AI_NATION_ID_V2,
    )).not.toContain(corridorId);
    expect(selectRecruitmentTrainingPipelineV2(
      engine.state,
      content,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(0);
    expect(corridor.army.manpower).toBe(0);
  });

  it('raises absolute weekly refill when effective Army Capacity increases', () => {
    const state = createWorldStateV2(93_008);
    state.tick = 100;
    setFill(state, belgium, 0.50);
    const beforeCapacity = state.territories[territoryIdV2('bel')]!.army.capacity;
    const beforeRefill = selectRecruitmentTrainingPipelineV2(
      state, WORLD_CONTENT_V2, belgium,
    );
    state.players[belgium]!.research.effectLevels['force-capacity'] = 10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const afterCapacity = state.territories[territoryIdV2('bel')]!.army.capacity;
    const afterRefill = selectRecruitmentTrainingPipelineV2(
      state, WORLD_CONTENT_V2, belgium,
    );

    expect(afterCapacity).toBeGreaterThan(beforeCapacity);
    expect(afterRefill).toBeGreaterThan(beforeRefill);
    expect(afterRefill / beforeRefill).toBeCloseTo(afterCapacity / beforeCapacity, 3);
  });
});
