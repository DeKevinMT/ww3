import { describe, expect, it } from 'vitest';
import { round } from './balance';
import {
  openingArmyCapacityMultiplierV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  consumeOpeningArmyBonusLossV2,
  OPENING_ARMY_BONUS_DURATION_TICKS_V2,
  processOpeningArmyBonusDecayV2,
  selectOpeningArmyBonusRemainingV2,
} from './openingArmyBonus';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import {
  selectFoodDemandV2,
  selectRecruitmentThroughputV2,
  selectTotalManpowerV2,
  selectTrainedReserveCapacityV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  humanStartingArmyMultiplierForContentV2,
  legacyV261HumanStartingArmyMultiplierForContentV2,
} from './traits';
import { nationIdV2, territoryIdV2, type PlayerId, type WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

const grl = nationIdV2('grl');
const usa = nationIdV2('usa');
const bel = nationIdV2('bel');

function deployedV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTotalManpowerV2(state, playerId).deployed;
}

function createOpeningEngineV2(seed: number, playerId = grl): WorldEngineV2 {
  const engine = new WorldEngineV2(seed, WORLD_CONTENT_V2);
  const configured = engine.configureHumanPlayers([playerId], playerId);
  if (!configured.accepted) throw new Error(configured.reason);
  return engine;
}

/** Applies a physical national loss; the production accounting helper is called separately. */
function removePhysicalManpowerV2(
  state: WorldStateV2,
  playerId: PlayerId,
  requestedLoss: number,
): number {
  let outstanding = Math.max(0, requestedLoss);
  let removed = 0;
  for (const territoryId of Object.keys(state.territories).sort()) {
    const territory = state.territories[territoryId]!;
    if (territory.owner !== playerId || outstanding <= 0) continue;
    const loss = Math.min(territory.army.manpower, outstanding);
    territory.army.manpower = round(territory.army.manpower - loss, 9);
    outstanding = round(outstanding - loss, 9);
    removed = round(removed + loss, 9);
  }
  return removed;
}

function addPhysicalManpowerV2(
  state: WorldStateV2,
  playerId: PlayerId,
  amount: number,
): void {
  const territoryId = Object.keys(state.territories).sort().find((id) => (
    state.territories[id]!.owner === playerId
  ));
  if (!territoryId) throw new Error(`No territory owned by ${playerId}.`);
  const army = state.territories[territoryId]!.army;
  army.manpower = round(army.manpower + Math.max(0, amount), 9);
}

function capacityAtOneXHumanOpeningV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  const oneXState = structuredClone(state);
  oneXState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
  synchronizeArmyCapacityV2(oneXState, WORLD_CONTENT_V2);
  return selectTotalManpowerV2(oneXState, playerId).capacity;
}

function reserveCapacityAtOneXHumanOpeningV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  const oneXState = structuredClone(state);
  oneXState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
  synchronizeArmyCapacityV2(oneXState, WORLD_CONTENT_V2);
  return selectTrainedReserveCapacityV2(oneXState, playerId);
}

describe('temporary human opening-army bonus', () => {
  it('scales only a sub-1x tick-zero reserve cadre and reverses lobby switches exactly once', () => {
    const engine = new WorldEngineV2(86_010, WORLD_CONTENT_V2);
    const ordinaryUsReserves = engine.state.players[usa]!.trainedReserves;
    const ordinaryGreenlandReserves = engine.state.players[grl]!.trainedReserves;
    const strongMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, usa);
    const weakMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, grl);
    expect(strongMultiplier).toBeLessThan(1);
    expect(weakMultiplier).toBeGreaterThan(1);

    expect(engine.configureHumanPlayers([usa], usa)).toEqual({ accepted: true });
    const discountedUsReserves = engine.state.players[usa]!.trainedReserves;
    expect(discountedUsReserves).toBeCloseTo(
      ordinaryUsReserves * strongMultiplier,
      9,
    );

    // Replaying the same lobby state is a no-op, while changing country first
    // restores the old cadre and then applies the new country's own rule.
    expect(engine.configureHumanPlayers([usa], usa)).toEqual({ accepted: true });
    expect(engine.state.players[usa]!.trainedReserves).toBe(discountedUsReserves);
    expect(engine.chooseCountry(grl)).toEqual({ accepted: true });
    expect(engine.state.players[usa]!.trainedReserves).toBe(ordinaryUsReserves);
    const boostedGreenlandReserves = engine.state.players[grl]!.trainedReserves;
    expect(boostedGreenlandReserves).toBeGreaterThan(ordinaryGreenlandReserves);
    expect(engine.chooseCountry(grl)).toEqual({ accepted: true });
    expect(engine.state.players[grl]!.trainedReserves).toBe(boostedGreenlandReserves);

    expect(engine.chooseCountry(usa)).toEqual({ accepted: true });
    expect(engine.state.players[usa]!.trainedReserves).toBe(discountedUsReserves);
    expect(engine.state.players[grl]!.trainedReserves).toBe(ordinaryGreenlandReserves);
    expect(engine.chooseCountry(grl)).toEqual({ accepted: true });
    expect(engine.state.players[grl]!.trainedReserves).toBe(boostedGreenlandReserves);
  });

  it('lets reserve capacity follow the temporary army-cap curve without granting reserves', () => {
    const engine = new WorldEngineV2(86_011, WORLD_CONTENT_V2);
    const ordinaryUsReserves = engine.state.players[usa]!.trainedReserves;
    expect(engine.configureHumanPlayers([usa], usa)).toEqual({ accepted: true });
    const state = engine.state;
    const openingMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, usa);
    const oneXReserveCapacity = reserveCapacityAtOneXHumanOpeningV2(state, usa);
    const discountedReserves = state.players[usa]!.trainedReserves;

    expect(selectTrainedReserveCapacityV2(state, usa))
      .toBeCloseTo(oneXReserveCapacity * openingMultiplier, 6);
    expect(discountedReserves).toBeCloseTo(ordinaryUsReserves * openingMultiplier, 9);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const halfwayMultiplier = 1 + (openingMultiplier - 1) / 2;
    expect(selectTrainedReserveCapacityV2(state, usa))
      .toBeCloseTo(oneXReserveCapacity * halfwayMultiplier, 6);
    expect(state.players[usa]!.trainedReserves).toBe(discountedReserves);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectTrainedReserveCapacityV2(state, usa)).toBeCloseTo(oneXReserveCapacity, 6);
    expect(state.players[usa]!.trainedReserves).toBe(discountedReserves);
  });

  it('starts deployed army and capacity at the exact 0.05x–50x endpoints', () => {
    const weakEngine = new WorldEngineV2(86_001, WORLD_CONTENT_V2);
    const weakBefore = selectTotalManpowerV2(weakEngine.state, grl);
    const weakTreasuryBefore = weakEngine.state.players[grl]!.treasury;
    const weakReservesBefore = weakEngine.state.players[grl]!.trainedReserves;
    expect(weakEngine.configureHumanPlayers([grl], grl)).toEqual({ accepted: true });

    const weakAfter = selectTotalManpowerV2(weakEngine.state, grl);
    const weakMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, grl);
    const weakOneXCapacity = capacityAtOneXHumanOpeningV2(weakEngine.state, grl);
    const weakBonus = weakEngine.state.players[grl]!.openingArmyBonus;
    expect(weakMultiplier).toBe(50);
    expect(openingArmyCapacityMultiplierV2(weakEngine.state, WORLD_CONTENT_V2, grl))
      .toBe(50);
    expect(weakAfter.deployed).toBeCloseTo(weakBefore.deployed * weakMultiplier, 7);
    // Per-territory capacity is rounded before national aggregation.
    expect(weakAfter.capacity).toBeCloseTo(weakOneXCapacity * weakMultiplier, 4);
    expect(weakEngine.state.players[grl]!.treasury).toBe(weakTreasuryBefore);
    expect(weakEngine.state.players[grl]!.trainedReserves).toBeGreaterThan(weakReservesBefore);
    expect(weakBonus).not.toBeNull();
    expect(weakBonus!.initialManpower).toBeCloseTo(
      weakAfter.deployed - weakBefore.deployed,
      8,
    );
    expect(weakBonus!.remainingManpower).toBe(weakBonus!.initialManpower);
    expect(weakBonus!.startedTick).toBe(0);
    expect(weakBonus!.expiresTick).toBe(OPENING_ARMY_BONUS_DURATION_TICKS_V2);

    const strongEngine = new WorldEngineV2(86_002, WORLD_CONTENT_V2);
    const usaBefore = deployedV2(strongEngine.state, usa);
    expect(strongEngine.configureHumanPlayers([usa], usa)).toEqual({ accepted: true });
    const strongMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, usa);
    const strongOneXCapacity = capacityAtOneXHumanOpeningV2(strongEngine.state, usa);
    expect(strongMultiplier).toBe(0.05);
    expect(deployedV2(strongEngine.state, usa))
      .toBeCloseTo(usaBefore * strongMultiplier, 6);
    expect(selectTotalManpowerV2(strongEngine.state, usa).capacity)
      .toBeCloseTo(strongOneXCapacity * strongMultiplier, 6);
    expect(strongEngine.state.players[usa]!.openingArmyBonus).toBeNull();
  });

  it('limits the temporary opening-cap multiplier to original homeland', () => {
    const engine = createOpeningEngineV2(86_012);
    const state = engine.state;
    const homelandId = territoryIdV2('grl');
    const capturedId = territoryIdV2('isl');
    const captured = state.territories[capturedId]!;
    captured.owner = grl;
    const multiplier = openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, grl);

    for (const integration of [0.10, 1]) {
      captured.integration = integration;
      captured.coreOwner = integration === 1 ? grl : nationIdV2('isl');
      delete captured.integrationProgram;
      synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

      const oneXState = structuredClone(state);
      oneXState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
      synchronizeArmyCapacityV2(oneXState, WORLD_CONTENT_V2);

      expect(stateTerritoryArmyCapacityTargetV2(
        state, WORLD_CONTENT_V2, homelandId, grl,
      )).toBeCloseTo(
        stateTerritoryArmyCapacityTargetV2(
          oneXState, WORLD_CONTENT_V2, homelandId, grl,
        ) * multiplier,
        4,
      );
      expect(stateTerritoryArmyCapacityTargetV2(
        state, WORLD_CONTENT_V2, capturedId, grl,
      )).toBeCloseTo(
        stateTerritoryArmyCapacityTargetV2(
          oneXState, WORLD_CONTENT_V2, capturedId, grl,
        ),
        8,
      );
      expect(stateTerritoryArmySupportCeilingV2(
        state, WORLD_CONTENT_V2, capturedId, grl,
      )).toBeCloseTo(
        stateTerritoryArmySupportCeilingV2(
          oneXState, WORLD_CONTENT_V2, capturedId, grl,
        ),
        8,
      );
    }
  });

  it('fades deployed surplus and capacity linearly: halfway at week 780, 1x at week 1560', () => {
    const engine = createOpeningEngineV2(86_003);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;
    const ordinaryArmy = deployedV2(state, grl) - initial;
    const openingMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, grl);
    const ordinaryCapacity = selectTotalManpowerV2(state, grl).capacity / openingMultiplier;

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2))
      .toBeCloseTo(initial / 2, 7);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 7);
    expect(deployedV2(state, grl)).toBeCloseTo(ordinaryArmy + initial / 2, 7);
    const halfwayMultiplier = 1 + (openingMultiplier - 1) / 2;
    expect(openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, grl))
      .toBe(halfwayMultiplier);
    expect(selectTotalManpowerV2(state, grl).capacity)
      .toBeCloseTo(ordinaryCapacity * halfwayMultiplier, 6);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2))
      .toBeCloseTo(initial / 2, 7);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(state.players[grl]!.openingArmyBonus).toBeNull();
    expect(deployedV2(state, grl)).toBeCloseTo(ordinaryArmy, 7);
    expect(openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, grl)).toBe(1);
    expect(selectTotalManpowerV2(state, grl).capacity)
      .toBeCloseTo(ordinaryCapacity, 6);
  });

  it('makes the above-1x opening units and capacity cost no food or upkeep', () => {
    const engine = createOpeningEngineV2(86_008);
    const state = engine.state;
    const bonus = state.players[grl]!.openingArmyBonus!;
    const ordinaryState = structuredClone(state);
    expect(removePhysicalManpowerV2(ordinaryState, grl, bonus.remainingManpower))
      .toBeCloseTo(bonus.remainingManpower, 8);
    ordinaryState.players[grl]!.openingArmyBonus = null;
    ordinaryState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(ordinaryState, WORLD_CONTENT_V2);

    expect(selectFoodDemandV2(state, grl))
      .toBeCloseTo(selectFoodDemandV2(ordinaryState, grl), 8);
    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, grl).armyUpkeep)
      .toBeCloseTo(
        selectWeeklyFinanceBreakdownV2(ordinaryState, WORLD_CONTENT_V2, grl).armyUpkeep,
        8,
      );
  });

  it('consumes early physical casualties first and does not decay them twice before the calendar catches up', () => {
    const engine = createOpeningEngineV2(86_004);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;
    const earlyLoss = round(initial / 2, 9);
    const beforeCasualty = deployedV2(state, grl);

    expect(removePhysicalManpowerV2(state, grl, earlyLoss)).toBeCloseTo(earlyLoss, 9);
    expect(consumeOpeningArmyBonusLossV2(state, grl, earlyLoss)).toBeCloseTo(earlyLoss, 9);
    const afterCasualty = deployedV2(state, grl);
    expect(afterCasualty).toBeCloseTo(beforeCasualty - earlyLoss, 8);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 8);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2 - 1;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(deployedV2(state, grl)).toBeCloseTo(afterCasualty, 9);

    state.tick += 1;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(deployedV2(state, grl)).toBeCloseTo(afterCasualty, 9);

    state.tick += 1;
    const firstCalendarRetirement = processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2);
    expect(firstCalendarRetirement).toBeGreaterThan(0);
    expect(deployedV2(state, grl)).toBeCloseTo(
      afterCasualty - firstCalendarRetirement,
      6,
    );
  });

  it('uses temporary capacity for paid recruitment without refilling the free bonus pool', () => {
    const engine = createOpeningEngineV2(86_005);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;
    const openingCapacity = selectTotalManpowerV2(state, grl).capacity;
    const ordinaryCapacity = openingCapacity
      / openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, grl);
    const paidDeployed = deployedV2(state, grl) - initial;
    addPhysicalManpowerV2(state, grl, ordinaryCapacity - paidDeployed);

    const casualty = round(initial / 2, 9);
    expect(removePhysicalManpowerV2(state, grl, casualty)).toBeCloseTo(casualty, 8);
    expect(consumeOpeningArmyBonusLossV2(state, grl, casualty)).toBeCloseTo(casualty, 8);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 8);
    expect(deployedV2(state, grl)).toBeLessThan(openingCapacity);
    expect(deployedV2(state, grl) - selectOpeningArmyBonusRemainingV2(state, grl))
      .toBeCloseTo(ordinaryCapacity, 6);
    const paidThroughput = selectRecruitmentThroughputV2(
      state,
      WORLD_CONTENT_V2,
      grl,
    );
    expect(paidThroughput).toBeGreaterThan(0);

    const beforeStep = deployedV2(state, grl);
    state.aiEscalation.lastWarStartTick = state.tick;
    engine.step();
    expect(deployedV2(state, grl)).toBeGreaterThan(beforeStep);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 8);

    // Casualties permanently removed half the free opening force. Calendar
    // retirement therefore has nothing left to remove until its entitlement
    // curve falls below that surviving half; it must not double-count losses.
    const afterStep = deployedV2(state, grl);
    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(deployedV2(state, grl)).toBeCloseTo(afterStep, 8);

    state.tick += 1;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBeGreaterThan(0);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeLessThan(initial / 2);
  });

  it('lets a sub-1x capacity grow back to normal without deleting existing paid troops', () => {
    const engine = createOpeningEngineV2(86_009, usa);
    const state = engine.state;
    const normalCapacity = capacityAtOneXHumanOpeningV2(state, usa);
    expect(openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, usa)).toBe(0.05);
    expect(selectTotalManpowerV2(state, usa).capacity)
      .toBeCloseTo(normalCapacity * 0.05, 6);

    const paidTroopTarget = normalCapacity * 0.8;
    addPhysicalManpowerV2(state, usa, paidTroopTarget - deployedV2(state, usa));
    expect(deployedV2(state, usa)).toBeCloseTo(paidTroopTarget, 6);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, usa)).toBe(0.525);
    expect(selectTotalManpowerV2(state, usa).capacity)
      .toBeCloseTo(normalCapacity * 0.525, 6);
    expect(deployedV2(state, usa)).toBeCloseTo(paidTroopTarget, 6);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectTotalManpowerV2(state, usa).capacity).toBeCloseTo(normalCapacity, 6);
    expect(deployedV2(state, usa)).toBeCloseTo(paidTroopTarget, 6);
  });

  it('round-trips week-137 metadata and stays hash-identical on subsequent deterministic steps', () => {
    const uninterrupted = createOpeningEngineV2(86_006);
    uninterrupted.state.tick = 137;
    processOpeningArmyBonusDecayV2(uninterrupted.state, WORLD_CONTENT_V2);
    synchronizeArmyCapacityV2(uninterrupted.state, WORLD_CONTENT_V2);
    const beforeSave = structuredClone(uninterrupted.state.players[grl]!.openingArmyBonus);
    expect(beforeSave).not.toBeNull();
    expect(beforeSave!.remainingManpower).toBeCloseTo(
      beforeSave!.initialManpower * (OPENING_ARMY_BONUS_DURATION_TICKS_V2 - 137)
        / OPENING_ARMY_BONUS_DURATION_TICKS_V2,
      8,
    );

    const resumed = WorldEngineV2.fromSave(uninterrupted.save(), WORLD_CONTENT_V2);
    expect(resumed.state.players[grl]!.openingArmyBonus).toEqual(beforeSave);
    expect(resumed.canonicalHash()).toBe(uninterrupted.canonicalHash());

    for (let offset = 1; offset <= 3; offset += 1) {
      uninterrupted.step();
      resumed.step();
      expect(resumed.canonicalHash(), `post-load hash +${offset}`)
        .toBe(uninterrupted.canonicalHash());
    }
  }, 30_000);

  it.each([
    ['USA', usa, 0.5, 86_007],
    ['Belgium', bel, 1.272802404207363, 86_008],
    ['Greenland', grl, 12, 86_009],
  ] as const)('reconstructs the frozen v2.61 %s opening without multiplying its roster again', (
    _country,
    playerId,
    legacyMultiplier,
    seed,
  ) => {
    const engine = createOpeningEngineV2(seed, playerId);
    const currentMultiplier = humanStartingArmyMultiplierForContentV2(
      WORLD_CONTENT_V2,
      playerId,
    );
    expect(legacyV261HumanStartingArmyMultiplierForContentV2(
      WORLD_CONTENT_V2,
      playerId,
    )).toBeCloseTo(legacyMultiplier, 12);
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner !== playerId) continue;
      territory.army.manpower = round(
        territory.army.manpower * legacyMultiplier / currentMultiplier,
        9,
      );
    }
    engine.state.players[playerId]!.openingArmyBonus = null;
    const boostedBeforeSave = deployedV2(engine.state, playerId);
    const legacy = structuredClone(
      createSaveV2(engine.state, WORLD_CONTENT_V2),
    ) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.61-random-world';
    delete legacy.commanderForces;
    delete legacy.firstIntegrationDiscountUsedBy;
    delete legacy.polarEndgame;
    delete legacy.runProgression;
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.openingArmyBonus;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const reconstructed = loaded.players[playerId]!.openingArmyBonus;
    expect(deployedV2(loaded, playerId)).toBeCloseTo(boostedBeforeSave, 9);
    if (legacyMultiplier <= 1) {
      expect(reconstructed).toBeNull();
    } else {
      expect(reconstructed).not.toBeNull();
      expect(reconstructed!.initialManpower).toBeCloseTo(
        boostedBeforeSave - boostedBeforeSave / legacyMultiplier,
        6,
      );
      expect(reconstructed!.remainingManpower).toBe(reconstructed!.initialManpower);
      expect(reconstructed!.startedTick).toBe(0);
      expect(reconstructed!.expiresTick).toBe(OPENING_ARMY_BONUS_DURATION_TICKS_V2);
    }
  });
});
