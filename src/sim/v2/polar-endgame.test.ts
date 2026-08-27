import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2, openingConflictScheduleV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  ANTARCTIC_SECTORS_V2,
  ARCTIC_PROJECTS_V2,
  ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2,
  ARCTIC_RESEARCH_RANK_COST_FACTOR_STRONGEST_V2,
  ARCTIC_RESEARCH_RANK_COST_FACTOR_WEAKEST_V2,
  acknowledgePolarWarningV2,
  applyPolarSuspicionReliefV2,
  arcticResearchAffinityCostModifierV2,
  arcticResearchRankCostFactorV2,
  clonePolarEndgameV2,
  deployAntarcticExpeditionV2,
  processArcticResearchV2,
  processPolarEndgameV2,
  selectAntarcticExpeditionTermsV2,
  selectArcticProjectTermsV2,
  selectPolarVictoryWinnerV2,
  startArcticProjectV2,
} from './polarEndgame';
import { resolveScenarioV2 } from './scenarios';
import {
  SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2,
  updateGlobalResistanceV2,
} from './resistance';
import { openingMilitaryOrderForContentV2 } from './traits';
import {
  nationIdV2,
  type AntarcticSectorIdV2,
  type PlayerId,
  type WorldStateV2,
} from './types';

const EMPTY_POWER_SNAPSHOT = {
  byNation: new Map<PlayerId, number>(),
  leaderPower: 1,
  leaderBreakthroughs: 0,
};

const ARCTIC_GATEWAY_IDS = [
  'can', 'fin', 'grl', 'isl', 'nor', 'rus', 'swe', 'usa',
] as const;

function humanCanada(seed: number): { state: WorldStateV2; canada: PlayerId } {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const canada = nationIdV2('can');
  state.humanPlayerId = canada;
  state.humanPlayerIds = [canada];
  state.players[canada]!.treasury = 100_000;
  state.players[canada]!.trainedReserves = 5_000;
  return { state, canada };
}

function revealGatewaySectors(state: WorldStateV2, playerId: PlayerId): void {
  state.polarEndgame.phase = 'warning';
  state.polarEndgame.revealedBy = playerId;
  state.polarEndgame.warningTick = state.tick;
  for (const sector of ANTARCTIC_SECTORS_V2.filter(({ region }) => region === 'gateway')) {
    state.polarEndgame.sectors[sector.id].status = 'available';
    state.polarEndgame.sectors[sector.id].discoveredTick = state.tick;
  }
}

function secureSector(
  state: WorldStateV2,
  playerId: PlayerId,
  sectorId: AntarcticSectorIdV2,
): void {
  const terms = selectAntarcticExpeditionTermsV2(
    state,
    WORLD_CONTENT_V2,
    playerId,
    sectorId,
  );
  expect(terms.allowed, terms.reason).toBe(true);
  expect(deployAntarcticExpeditionV2(
    state,
    WORLD_CONTENT_V2,
    playerId,
    sectorId,
    Math.max(100, terms.minManpower),
  )).toEqual({ accepted: true });
  state.polarEndgame.nextCounteroffensiveTick = 1_000_000;

  for (let pulse = 0; pulse < 20 && state.polarEndgame.sectors[sectorId].status !== 'secured'; pulse += 1) {
    state.tick += 4;
    processPolarEndgameV2(state, WORLD_CONTENT_V2, EMPTY_POWER_SNAPSHOT);
  }
  expect(state.polarEndgame.sectors[sectorId].status).toBe('secured');
}

describe('V2 polar endgame', () => {
  it('keeps the four canonical Arctic projects at their exact base durations and costs', () => {
    expect(ARCTIC_PROJECTS_V2.map(({ durationTicks, baseCost }) => ({
      durationTicks,
      baseCost,
    }))).toEqual([
      { durationTicks: 156, baseCost: 80 },
      { durationTicks: 260, baseCost: 180 },
      { durationTicks: 416, baseCost: 385 },
      { durationTicks: 780, baseCost: 760 },
    ]);
  });

  it('derives the exact raw Arctic affinity table without human amplification', () => {
    expect(ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2).toEqual({
      grl: -0.125,
      isl: -0.35,
      nor: -0.30,
      can: -0.25,
      fin: -0.22,
      swe: -0.18,
      rus: -0.12,
      usa: 0.15,
    });
    for (const [playerId, modifier] of Object.entries(
      ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2,
    )) {
      expect(arcticResearchAffinityCostModifierV2(playerId)).toBe(modifier);
    }
    expect(arcticResearchAffinityCostModifierV2('bra')).toBe(0);
  });

  it('prices opening military rank smoothly from x10 to x0.5 in every scenario', () => {
    const alternativeContent = resolveScenarioV2({
      mode: 'random-world',
      seed: 72_030,
    }).content;

    for (const content of [WORLD_CONTENT_V2, alternativeContent]) {
      const order = openingMilitaryOrderForContentV2(content);
      const factors = order.map((playerId) => (
        arcticResearchRankCostFactorV2(content, playerId)
      ));

      expect(factors[0]).toBe(ARCTIC_RESEARCH_RANK_COST_FACTOR_STRONGEST_V2);
      expect(factors.at(-1)).toBe(ARCTIC_RESEARCH_RANK_COST_FACTOR_WEAKEST_V2);
      for (let index = 1; index < factors.length; index += 1) {
        expect(factors[index]).toBeLessThanOrEqual(factors[index - 1]!);
      }
    }

    const standardOrder = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2);
    expect(standardOrder[0]).toBe(nationIdV2('usa'));
    expect(standardOrder.at(-1)).toBe(nationIdV2('grl'));
  });

  it('quotes price from base cost, opening rank and affinity only, never current economy', () => {
    const { state, canada } = humanCanada(72_031);
    const projectId = ARCTIC_PROJECTS_V2[0]!.id;
    const before = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      projectId,
    );
    const expectedCost = Math.round(
      before.baseCost
        * before.openingMilitaryRankCostFactor
        * before.affinityCostMultiplier
        * 1_000,
    ) / 1_000;

    expect(before.economyCostScale).toBe(1);
    expect(before.affinityCostModifier).toBe(-0.25);
    expect(before.quotedCost).toBe(expectedCost);
    expect(before.cost).toBe(expectedCost);

    for (const territory of Object.values(state.territories)) {
      if (territory.owner === canada) territory.economy *= 100;
    }
    const after = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      projectId,
    );
    expect(after.economyCostScale).toBe(1);
    expect(after.quotedCost).toBe(before.quotedCost);
    expect(after.cost).toBe(before.cost);
  });

  it('reduces duration by five points per extra Arctic access up to 35%, then applies research speed multiplicatively', () => {
    const { state, canada } = humanCanada(72_032);
    const otherOwner = nationIdV2('bra');
    const project = ARCTIC_PROJECTS_V2[0]!;
    state.players[canada]!.research.effectLevels['research-speed'] = 0;
    for (const territoryId of ARCTIC_GATEWAY_IDS) {
      state.territories[territoryId]!.owner = otherOwner;
    }

    let previousDuration = Number.POSITIVE_INFINITY;
    for (let count = 1; count <= ARCTIC_GATEWAY_IDS.length; count += 1) {
      state.territories[ARCTIC_GATEWAY_IDS[count - 1]!]!.owner = canada;
      const terms = selectArcticProjectTermsV2(
        state,
        WORLD_CONTENT_V2,
        canada,
        project.id,
      );
      const expectedAccessReduction = Math.min(0.35, (count - 1) * 0.05);
      expect(terms.accessPointCount).toBe(count);
      expect(terms.accessDurationReduction).toBeCloseTo(expectedAccessReduction, 12);
      expect(terms.researchSpeedDurationReduction).toBe(0);
      expect(terms.quotedDurationTicks).toBe(Math.ceil(
        project.durationTicks * (1 - expectedAccessReduction),
      ));
      expect(terms.quotedDurationTicks).toBeLessThanOrEqual(previousDuration);
      previousDuration = terms.quotedDurationTicks;
    }

    state.players[canada]!.research.effectLevels['research-speed'] = 10;
    const researched = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      project.id,
    );
    expect(researched.accessDurationReduction).toBe(0.35);
    expect(researched.researchSpeedDurationReduction).toBe(0.06);
    expect(researched.quotedDurationTicks).toBe(Math.ceil(
      project.durationTicks * (1 - 0.35) * (1 - 0.06),
    ));
  });

  it('freezes an active project at its stored paid cost and completes-minus-start duration', () => {
    const { state, canada } = humanCanada(72_033);
    const project = ARCTIC_PROJECTS_V2[0]!;
    const quotedAtStart = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      project.id,
    );
    expect(quotedAtStart.accessPointCount).toBe(1);
    expect(startArcticProjectV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      project.id,
    )).toEqual({ accepted: true });
    const stored = state.polarEndgame.arcticPrograms[canada]!.activeProject!;

    for (const territoryId of ARCTIC_GATEWAY_IDS) {
      state.territories[territoryId]!.owner = canada;
      state.territories[territoryId]!.economy *= 100;
    }
    state.players[canada]!.research.effectLevels['research-speed'] = 30;
    const active = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      project.id,
    );

    expect(active.status).toBe('active');
    expect(active.cost).toBe(stored.costPaid);
    expect(active.cost).toBe(quotedAtStart.cost);
    expect(active.durationTicks).toBe(stored.completesTick - stored.startedTick);
    expect(active.durationTicks).toBe(quotedAtStart.durationTicks);
    expect(active.quotedDurationTicks).toBe(Math.ceil(
      project.durationTicks * (1 - 0.35) * (1 - 0.18),
    ));
    expect(active.quotedDurationTicks).toBeLessThan(active.durationTicks);
  });

  it('runs Arctic projects sequentially, charges the quoted cost, grants rewards and opens three gates', () => {
    const { state, canada } = humanCanada(72_001);

    expect(selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      ARCTIC_PROJECTS_V2[1]!.id,
    )).toMatchObject({ allowed: false, status: 'locked' });

    for (const project of ARCTIC_PROJECTS_V2) {
      const terms = selectArcticProjectTermsV2(state, WORLD_CONTENT_V2, canada, project.id);
      const treasuryBefore = state.players[canada]!.treasury;
      const effectsBefore = Object.fromEntries(project.rewards.map(({ effect }) => [
        effect,
        state.players[canada]!.research.effectLevels[effect],
      ]));

      expect(terms).toMatchObject({ allowed: true, status: 'available' });
      expect(startArcticProjectV2(state, WORLD_CONTENT_V2, canada, project.id))
        .toEqual({ accepted: true });
      expect(state.players[canada]!.treasury).toBeCloseTo(treasuryBefore - terms.cost, 6);
      expect(state.polarEndgame.arcticPrograms[canada]?.activeProject).toMatchObject({
        projectId: project.id,
        startedTick: state.tick,
        completesTick: state.tick + terms.durationTicks,
        costPaid: terms.cost,
      });

      state.tick += terms.durationTicks - 1;
      expect(processArcticResearchV2(state, WORLD_CONTENT_V2)).toEqual([]);
      state.tick += 1;
      expect(processArcticResearchV2(state, WORLD_CONTENT_V2)).toContainEqual({
        kind: 'project-complete',
        playerId: canada,
        projectId: project.id,
      });
      for (const reward of project.rewards) {
        expect(state.players[canada]!.research.effectLevels[reward.effect])
          .toBe(effectsBefore[reward.effect]! + reward.levels);
      }
    }

    expect(state.polarEndgame.phase).toBe('warning');
    expect(state.polarEndgame.warningTick).toBe(state.tick);
    expect(state.polarEndgame.revealedBy).toBe(canada);
    expect(ANTARCTIC_SECTORS_V2.filter(({ region }) => region === 'gateway')
      .map(({ id }) => state.polarEndgame.sectors[id].status)).toEqual([
      'available', 'available', 'available',
    ]);
    expect(ANTARCTIC_SECTORS_V2.filter(({ region }) => region !== 'gateway')
      .every(({ id }) => state.polarEndgame.sectors[id].status === 'hidden')).toBe(true);
    expect(acknowledgePolarWarningV2(state, canada)).toEqual({ accepted: true });
    expect(state.polarEndgame.warningAcknowledgedBy).toEqual([canada]);
  });

  it('offers all three entry gates and turns the first reserve deployment into first contact', () => {
    const { state, canada } = humanCanada(72_002);
    revealGatewaySectors(state, canada);
    const unitedStates = nationIdV2('usa');
    state.aiEscalation.coalitionMembers = [unitedStates];
    state.aiEscalation.resistanceLevel = 2;

    for (const sectorId of ['drake-entry', 'maud-entry', 'ross-entry'] as const) {
      expect(selectAntarcticExpeditionTermsV2(
        state,
        WORLD_CONTENT_V2,
        canada,
        sectorId,
      )).toMatchObject({ allowed: true, sector: { id: sectorId, region: 'gateway' } });
    }

    const terms = selectAntarcticExpeditionTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'drake-entry',
    );
    const reservesBefore = state.players[canada]!.trainedReserves;
    const manpower = Math.max(1, terms.minManpower);
    expect(deployAntarcticExpeditionV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'drake-entry',
      manpower,
    )).toEqual({ accepted: true });

    expect(state.players[canada]!.trainedReserves).toBeCloseTo(reservesBefore - manpower, 6);
    expect(state.polarEndgame.expeditions).toContainEqual(expect.objectContaining({
      playerId: canada,
      sectorId: 'drake-entry',
      initialManpower: manpower,
    }));
    expect(state.polarEndgame.sectors['drake-entry'].status).toBe('contested');
    expect(state.polarEndgame.phase).toBe('contact');
    expect(state.polarEndgame.contactTick).toBe(state.tick);
    expect(state.polarEndgame.earthDefenseMembers).toEqual(
      [canada, unitedStates].sort((left, right) => left.localeCompare(right)),
    );
    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    expect(state.aiEscalation.resistanceLevel).toBe(0);
    expect(state.polarEndgame.nextCounteroffensiveTick).toBeGreaterThan(state.tick);
  });

  it('keeps peaceful suspicion decay but disables containment after first contact', () => {
    const { state, canada } = humanCanada(72_005);
    const unitedStates = nationIdV2('usa');
    state.polarEndgame.phase = 'counteroffensive';
    state.polarEndgame.revealedBy = canada;
    state.polarEndgame.warningTick = 0;
    state.polarEndgame.contactTick = 0;
    state.polarEndgame.earthDefenseMembers = [canada];
    state.polarEndgame.nextCounteroffensiveTick = 13;
    state.aiEscalation.globalThreat = 80;
    state.aiEscalation.coalitionMembers = [unitedStates];
    state.aiEscalation.resistanceLevel = 2;
    state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
      .filter((territory) => territory.owner === canada).length;
    state.aiEscalation.lastHumanPower = 0;

    expect(updateGlobalResistanceV2(
      state,
      WORLD_CONTENT_V2,
      EMPTY_POWER_SNAPSHOT,
    )).toBeUndefined();

    expect(state.aiEscalation.globalThreat).toBeCloseTo(
      80 - SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2,
      9,
    );
    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    expect(state.aiEscalation.resistanceLevel).toBe(0);
  });

  it('keeps containment disabled after the Antarctic victory transition', () => {
    const { state, canada } = humanCanada(72_007);
    state.polarEndgame.phase = 'victory';
    state.polarEndgame.revealedBy = canada;
    state.polarEndgame.warningTick = 0;
    state.polarEndgame.contactTick = 0;
    state.polarEndgame.victoryTick = 0;
    state.polarEndgame.earthDefenseMembers = [canada];
    state.aiEscalation.globalThreat = 80;
    state.aiEscalation.coalitionMembers = [nationIdV2('usa')];
    state.aiEscalation.resistanceLevel = 2;
    state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
      .filter((territory) => territory.owner === canada).length;
    state.aiEscalation.lastHumanPower = 0;

    expect(updateGlobalResistanceV2(
      state,
      WORLD_CONTENT_V2,
      EMPTY_POWER_SNAPSHOT,
    )).toBeUndefined();
    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    expect(state.aiEscalation.resistanceLevel).toBe(0);
    expect(state.aiEscalation.globalThreat).toBeLessThan(80);
  });

  it('suppresses a seeded opening conflict while Earth unity is active', () => {
    const seed = 72_006;
    const scenario = openingConflictScheduleV2(seed, WORLD_CONTENT_V2)[0]!;
    const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
    const humanId = WORLD_CONTENT_V2.nationIds.find((playerId) => (
      playerId !== scenario.attackerId && playerId !== scenario.defenderId
    ))!;
    state.humanPlayerId = humanId;
    state.humanPlayerIds = [humanId];
    state.tick = scenario.tick - 1;
    state.polarEndgame.phase = 'contact';
    state.polarEndgame.revealedBy = humanId;
    state.polarEndgame.warningTick = 0;
    state.polarEndgame.contactTick = 0;
    state.polarEndgame.earthDefenseMembers = [humanId];
    state.polarEndgame.nextCounteroffensiveTick = state.tick + 13;

    const engine = new WorldEngineV2(seed, WORLD_CONTENT_V2, state);
    engine.step();

    expect(engine.state.tick).toBe(scenario.tick);
    expect(engine.state.wars).toEqual([]);
  });

  it('allows the full trained reserve pool and rejects only deployments above it', () => {
    const { state, canada } = humanCanada(72_021);
    revealGatewaySectors(state, canada);
    state.players[canada]!.trainedReserves = 5_000;

    const terms = selectAntarcticExpeditionTermsV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'drake-entry',
    );
    expect(terms.maxManpower).toBe(5_000);
    expect(deployAntarcticExpeditionV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'drake-entry',
      5_000.001,
    )).toMatchObject({ accepted: false });
    expect(deployAntarcticExpeditionV2(
      state,
      WORLD_CONTENT_V2,
      canada,
      'drake-entry',
      5_000,
    )).toEqual({ accepted: true });
    expect(state.players[canada]!.trainedReserves).toBe(0);
  });

  it('resolves identical combat identically without consuming the canonical RNG and converts damage to suspicion relief', () => {
    const prepared = humanCanada(72_003);
    revealGatewaySectors(prepared.state, prepared.canada);
    prepared.state.aiEscalation.globalThreat = 60;
    expect(deployAntarcticExpeditionV2(
      prepared.state,
      WORLD_CONTENT_V2,
      prepared.canada,
      'ross-entry',
      2,
    )).toEqual({ accepted: true });
    prepared.state.polarEndgame.nextCounteroffensiveTick = 1_000_000;
    prepared.state.tick += 4;

    const left = structuredClone(prepared.state);
    const right = structuredClone(prepared.state);
    const rngBefore = prepared.state.rngState;
    const leftResult = processPolarEndgameV2(left, WORLD_CONTENT_V2, EMPTY_POWER_SNAPSHOT);
    const rightResult = processPolarEndgameV2(right, WORLD_CONTENT_V2, EMPTY_POWER_SNAPSHOT);

    expect(leftResult).toEqual(rightResult);
    expect(left.polarEndgame).toEqual(right.polarEndgame);
    expect(left.rngState).toBe(rngBefore);
    expect(right.rngState).toBe(rngBefore);
    expect(leftResult.suspicionRelief).toBeGreaterThan(0);
    expect(left.polarEndgame.sectors['ross-entry'].integrity).toBeLessThan(100);

    const threatBefore = left.aiEscalation.globalThreat;
    const applied = applyPolarSuspicionReliefV2(left, leftResult.suspicionRelief);
    expect(applied).toBe(leftResult.suspicionRelief);
    expect(left.aiEscalation.globalThreat).toBeCloseTo(threatBefore - applied, 6);
    expect(left.polarEndgame.suspicionReliefEarned).toBe(applied);
  });

  it('unlocks the fixed sector topology and requires all three core phases for victory', () => {
    const { state, canada } = humanCanada(72_004);
    revealGatewaySectors(state, canada);

    secureSector(state, canada, 'drake-entry');
    expect(state.polarEndgame.sectors['weddell-forge'].status).toBe('available');
    expect(state.polarEndgame.sectors['sentinel-labyrinth'].status).toBe('hidden');
    secureSector(state, canada, 'maud-entry');
    secureSector(state, canada, 'ross-entry');
    secureSector(state, canada, 'weddell-forge');
    expect(state.polarEndgame.sectors['sentinel-labyrinth'].status).toBe('hidden');
    secureSector(state, canada, 'queen-maud-grid');
    expect(state.polarEndgame.sectors['sentinel-labyrinth'].status).toBe('available');
    expect(state.polarEndgame.sectors['transantarctic-vault'].status).toBe('hidden');
    secureSector(state, canada, 'ross-array');
    expect(state.polarEndgame.sectors['transantarctic-vault'].status).toBe('available');
    secureSector(state, canada, 'sentinel-labyrinth');
    expect(state.polarEndgame.sectors['zero-point-core'].status).toBe('hidden');
    secureSector(state, canada, 'transantarctic-vault');
    expect(state.polarEndgame.phase).toBe('core-exposed');
    expect(state.polarEndgame.sectors['zero-point-core'].status).toBe('available');

    secureSector(state, canada, 'zero-point-core');
    expect(state.polarEndgame.phase).toBe('victory');
    expect(state.polarEndgame.bossPhase).toBe(3);
    expect(state.polarEndgame.bossIntegrity).toBe(0);
    expect(state.polarEndgame.victoryTick).toBe(state.tick);
    expect(state.polarEndgame.victoryCommanderId).toBe(canada);
    expect(state.polarEndgame.sectors['zero-point-core'].securedBy).toBe(canada);
    expect(selectPolarVictoryWinnerV2(state)).toBe(canada);

    const preCommanderSave = structuredClone(state.polarEndgame) as Record<string, unknown>;
    delete preCommanderSave.victoryCommanderId;
    expect(clonePolarEndgameV2(preCommanderSave as unknown as WorldStateV2['polarEndgame'])
      .victoryCommanderId).toBe(canada);
  });
});
