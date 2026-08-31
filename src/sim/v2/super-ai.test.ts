import { describe, expect, it } from 'vitest';
import {
  activeAutonomousAiVsAiWarsV2,
  planAiCommandsV2,
  selectAiResearchAllocationsV2,
  selectAiResearchFocusV2,
  selectDefensiveAidAssessmentV2,
} from './ai';
import {
  AI_FIRST_WAR_TICK,
  DEFAULT_BUDGET_V2,
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  aiActiveWarCapV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2,
  INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2,
  nationalArmyCapacityTargetV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationProgramsV2,
  FEDERATION_INTEGRATION_DURATION_FACTOR_V2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { invariantErrorsV2 } from './invariants';
import {
  moveBudgetTowardTargetV2,
  moveResearchTowardTargetV2,
  nationalAiAllocationStepLimitV2,
  nationalAiEfficiencyV2,
  optimizeNationalAiPlanV2,
} from './nationalAi';
import {
  absorbFederationMemberV2,
  coalitionWillingnessV2,
  defensiveFederationNameV2,
  resistanceCombatMultiplierV2,
  selectDefensiveFederationPolicyV2,
  selectGlobalResistanceV2,
  updateGlobalResistanceV2,
} from './resistance';
import {
  invalidateTerritoryIndexV2,
  createPowerSnapshotV2,
  selectNationalAggressivenessV2,
  selectNationalAiPlanV2,
  selectResearchBranchCostV2,
  selectResearchFundingSharesV2,
  selectRecruitmentUnitCostV2,
  selectTerritoriesOfV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { declareWarV2, warDeclarationStatusV2 } from './war';
import { humanStartingArmyMultiplierV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

describe('V2 shared national AI', () => {
  it('keeps capped Education out of AI focus without inventing passive funding', () => {
    const state = createWorldStateV2(8_230_001);
    const singapore = nationIdV2('sgp');
    state.players[singapore]!.research.effectLevels['iq-increase'] = 1_000_000;
    state.players[singapore]!.research.allocations = {
      ...DEFAULT_RESEARCH_ALLOCATIONS_V2,
      'military-industry': 0,
      'economy-science': 0,
      'education-intelligence': 100,
    };
    state.players[singapore]!.research.activeProgram = 'education-intelligence';
    const shares = selectResearchFundingSharesV2(
      state, WORLD_CONTENT_V2, singapore,
    );
    expect(shares['education-intelligence']).toBe(0);
    expect(Object.values(shares).reduce((sum, share) => sum + share, 0)).toBe(0);

    const allocation = selectAiResearchAllocationsV2(
      state,
      WORLD_CONTENT_V2,
      singapore,
      createPowerSnapshotV2(state, WORLD_CONTENT_V2),
    );
    expect(allocation['education-intelligence']).toBe(0);
    expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(100);
    const focus = selectAiResearchFocusV2(
      state,
      WORLD_CONTENT_V2,
      singapore,
      createPowerSnapshotV2(state, WORLD_CONTENT_V2),
    );
    expect(focus).toBeDefined();
    expect(focus).not.toBe('education-intelligence');
  });

  it('combines a recent military-posture baseline with live national readiness', () => {
    const state = createWorldStateV2(8_230_002);
    const country = nationIdV2('usa');
    const ready = selectNationalAggressivenessV2(state, WORLD_CONTENT_V2, country);
    const player = state.players[country]!;
    player.treasury = -1_000;
    player.foodSecurity = 0.15;
    player.warFatigue = 95;
    for (const territory of selectTerritoriesOfV2(state, country)) {
      territory.army.manpower = territory.army.capacity * 0.05;
    }
    const strained = selectNationalAggressivenessV2(state, WORLD_CONTENT_V2, country);
    expect(ready).toBeGreaterThan(strained);
    expect(ready - strained).toBeGreaterThan(20);
  });

  it('shows the chosen country opening-force curve in the forecast without a hidden layer', () => {
    const ordinary = new WorldEngineV2(699);
    ordinary.stopClock();
    const defended = new WorldEngineV2(699);
    defended.stopClock();
    const russia = nationIdV2('rus');
    const ukraine = nationIdV2('ukr');
    ordinary.chooseCountry(nationIdV2('usa'));
    defended.chooseCountry(ukraine);

    const openingMultiplier = humanStartingArmyMultiplierV2(ukraine);
    expect(openingMultiplier).toBeGreaterThan(1);
    expect(openingMultiplier).toBeLessThan(1.1);
    expect(defended.totalManpower(ukraine).deployed).toBeCloseTo(
      ordinary.totalManpower(ukraine).deployed * openingMultiplier,
      6,
    );
    const ordinaryForecast = ordinary.warForecast(russia, ukraine);
    const defendedForecast = defended.warForecast(russia, ukraine);
    expect(Math.abs(defendedForecast.winChance - ordinaryForecast.winChance)).toBeLessThan(1);
    expect(defendedForecast.projectedDefenderLosses)
      .toBe(ordinaryForecast.projectedDefenderLosses);
  });

  it('keeps the opening readable without attributing rival wars to the player', () => {
    const engine = new WorldEngineV2(700);
    expect(engine.chooseCountry(nationIdV2('usa'))).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.tick = AI_FIRST_WAR_TICK;
    expect(engine.state.wars).toHaveLength(0);
    const seenWars = new Set<string>();
    let maximumActiveWars = 0;
    let maximumBackgroundWars = 0;
    const horizonTick = AI_FIRST_WAR_TICK + 50;
    while (engine.state.tick < horizonTick) {
      engine.step();
      maximumActiveWars = Math.max(maximumActiveWars, engine.state.wars.length);
      maximumBackgroundWars = Math.max(
        maximumBackgroundWars,
        activeAutonomousAiVsAiWarsV2(engine.state, WORLD_CONTENT_V2),
      );
      for (const war of engine.state.wars) {
        seenWars.add(`${war.attackerId}:${war.defenderId}`);
        expect(war.attackerId).not.toBe(engine.state.humanPlayerId);
      }
    }
    expect(maximumBackgroundWars).toBe(1);
    expect(maximumActiveWars).toBeLessThanOrEqual(2);
    expect(seenWars.size).toBeGreaterThanOrEqual(1);
    expect(seenWars.size).toBeLessThanOrEqual(2);
    updateGlobalResistanceV2(engine.state, WORLD_CONTENT_V2);
    expect(selectGlobalResistanceV2(engine.state).threat).toBe(0);
    expect(selectGlobalResistanceV2(engine.state).members).toBe(0);
  }, 20_000);

  it('turns a national intent into an exact adaptive target plan', () => {
    const intent = { military: 35, research: 15, development: 50 } as const;
    const peace = optimizeNationalAiPlanV2({
      intent, activeWars: 0, fillRatio: 1,
      researchGap: 0, treasuryWeeks: 8, iqScore: 100,
    });
    expect(peace.mode).toBe('growth');
    expect(peace.activeBudget).toEqual(intent);
    expect(peace.efficiency).toBe(nationalAiEfficiencyV2(100));

    const war = optimizeNationalAiPlanV2({
      intent, activeWars: 2, fillRatio: 0.45,
      researchGap: 8, treasuryWeeks: 1, iqScore: 100,
    });
    expect(war.mode).toBe('war');
    expect(war.activeBudget.military).toBeGreaterThan(intent.military);
    expect(Object.values(war.activeBudget).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Object.values(war.activeBudget).every((value) => value >= 10 && value <= 70)).toBe(true);
  });

  it('never changes a country\'s AI efficiency when it becomes the selected nation', () => {
    const state = createWorldStateV2(701);
    const netherlands = nationIdV2('nld');
    const defaultCost = selectRecruitmentUnitCostV2(state, netherlands);
    const defaultPlan = selectNationalAiPlanV2(state, WORLD_CONTENT_V2, netherlands);
    state.humanPlayerId = netherlands;
    const selectedCost = selectRecruitmentUnitCostV2(state, netherlands);
    const selectedPlan = selectNationalAiPlanV2(state, WORLD_CONTENT_V2, netherlands);
    expect(selectedPlan.efficiency).toBe(defaultPlan.efficiency);
    expect(selectedCost).toBe(defaultCost);
    expect(nationalAiEfficiencyV2(108)).toBeGreaterThan(nationalAiEfficiencyV2(80));
  });

  it('moves every exact-100 allocation only a small IQ-scaled step per review', () => {
    const budgetTarget = { military: 70, research: 20, development: 10 } as const;
    const lowBudget = moveBudgetTowardTargetV2({ ...DEFAULT_BUDGET_V2 }, budgetTarget, 80);
    const highBudget = moveBudgetTowardTargetV2({ ...DEFAULT_BUDGET_V2 }, budgetTarget, 108);
    const moved = (before: object, after: object) => {
      const from = before as Record<string, number>;
      const to = after as Record<string, number>;
      return Object.keys(from).reduce((sum, key) => sum + Math.max(0, to[key]! - from[key]!), 0);
    };
    expect(moved(DEFAULT_BUDGET_V2, lowBudget)).toBe(nationalAiAllocationStepLimitV2(80));
    expect(moved(DEFAULT_BUDGET_V2, highBudget)).toBe(nationalAiAllocationStepLimitV2(108));
    expect(Object.values(lowBudget).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Object.values(highBudget).reduce((sum, value) => sum + value, 0)).toBe(100);

    const researchTarget = {
      'population-recruitment': 20,
      'military-industry': 20,
      'advanced-weapons': 15,
      'defensive-systems': 15,
      'logistics-medicine': 15,
      'economy-science': 15,
      'food-systems': 0,
      'reserve-doctrine': 0,
      'public-administration': 0,
      'education-intelligence': 0,
    } as const;
    const research = moveResearchTowardTargetV2(
      { ...DEFAULT_RESEARCH_ALLOCATIONS_V2 }, researchTarget, 100,
    );
    expect(moved(DEFAULT_RESEARCH_ALLOCATIONS_V2, research))
      .toBe(nationalAiAllocationStepLimitV2(100));
    expect(Object.values(research).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(moveResearchTowardTargetV2(
      { ...DEFAULT_RESEARCH_ALLOCATIONS_V2 }, researchTarget, 100,
    )).toEqual(research);
  });

  it('makes enemy AI repair weak armies and select a research focus automatically', () => {
    const state = createWorldStateV2(702);
    const belgium = nationIdV2('nld');
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === belgium) territory.army.manpower = territory.army.capacity * 0.25;
    }
    state.tick = 32;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2).filter((command) => (
      ('playerId' in command && command.playerId === belgium)
    ));
    const budgetCommand = commands.find((command) => command.type === 'set-budget-policy');
    expect(budgetCommand).toBeDefined();
    if (budgetCommand?.type === 'set-budget-policy') {
      expect(budgetCommand.playerId).toBe(belgium);
      expect(budgetCommand.budget.military).toBeGreaterThanOrEqual(state.players[belgium].budget.military);
      const movedPoints = Object.keys(budgetCommand.budget).reduce((sum, domain) => (
        sum + Math.max(0, budgetCommand.budget[domain as keyof typeof budgetCommand.budget]
          - state.players[belgium].budget[domain as keyof typeof budgetCommand.budget])
      ), 0);
      expect(movedPoints).toBeLessThanOrEqual(nationalAiAllocationStepLimitV2(
        WORLD_CONTENT_V2.nations[belgium].iqScore,
      ));
      expect(Object.values(budgetCommand.budget).reduce((sum, value) => sum + value, 0)).toBe(100);
    }
    const research = commands.find((command) => command.type === 'set-research-focus');
    expect(research?.type).toBe('set-research-focus');
    if (research?.type === 'set-research-focus') {
      expect(research.branch).toBe(selectAiResearchFocusV2(
        state,
        WORLD_CONTENT_V2,
        belgium,
        createPowerSnapshotV2(state, WORLD_CONTENT_V2),
      ));
    }
  });

  it('selects different research focuses for different national needs', () => {
    const state = createWorldStateV2(704);
    state.tick = 32;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2)
      .filter((command) => command.type === 'set-research-focus');
    const focuses = new Map(commands.map((command) => [command.playerId, command.branch]));
    const selected = [
      focuses.get(nationIdV2('lux')),
      focuses.get(nationIdV2('ind')),
      focuses.get(nationIdV2('bdi')),
      focuses.get(nationIdV2('usa')),
    ];
    expect(selected.every((focus) => focus !== undefined && focus !== null)).toBe(true);
    expect(new Set(selected).size).toBeGreaterThanOrEqual(2);
  });

  it('uses different national budgets for a food-and-debt crisis and an army rebuild', () => {
    const state = createWorldStateV2(712);
    const burundi = nationIdV2('bdi');
    const usa = nationIdV2('usa');
    state.tick = 32;
    state.players[burundi].foodSecurity = 0.35;
    state.players[burundi].treasury = -10;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === usa) territory.army.manpower = territory.army.capacity * 0.25;
    }
    const budgets = new Map(planAiCommandsV2(state, WORLD_CONTENT_V2)
      .filter((command) => command.type === 'set-budget-policy')
      .map((command) => [command.playerId, command.budget]));
    expect(budgets.get(burundi)!.development).toBeGreaterThan(state.players[burundi].budget.development);
    expect(budgets.get(usa)!.military).toBeGreaterThanOrEqual(state.players[usa].budget.military);
    expect(budgets.get(burundi)).not.toEqual(budgets.get(usa));
  });

  it('optimizes the player budget without choosing its research or wars', () => {
    const state = createWorldStateV2(705);
    const human = state.humanPlayerId;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === human) territory.army.manpower = territory.army.capacity * 0.2;
    }
    state.tick = 32;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2);
    expect(commands.some((command) => command.type === 'set-budget-policy' && command.playerId === human)).toBe(true);
    expect(commands.some((command) => 'playerId' in command && command.playerId === human && (
      command.type === 'set-research-allocations'
        || command.type === 'set-research-focus'
        || command.type === 'choose-research-breakthrough'
    ))).toBe(false);
    expect(commands.some((command) => command.type === 'declare-war' && command.attackerId === human)).toBe(false);
  });

  it('reviews rival research on cadence without taking over the human choice', () => {
    const state = createWorldStateV2(711);
    const human = state.humanPlayerId;
    const rival = nationIdV2('nld');
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === human || territory.owner === rival) {
        territory.army.manpower = territory.army.capacity * 0.2;
      }
    }
    state.tick = 8;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2);
    expect(commands.some((command) => 'playerId' in command && command.playerId === human && (
      command.type === 'set-research-focus'
        || command.type === 'choose-research-breakthrough'
    ))).toBe(false);
    expect(commands.some((command) => command.type === 'set-research-focus' && command.playerId === rival)).toBe(true);
  });

  it('claims AI breakthroughs deterministically while leaving human choices ready', () => {
    const state = createWorldStateV2(713);
    const human = state.humanPlayerId;
    const rival = nationIdV2('nld');
    state.tick = 8;
    for (const playerId of [human, rival]) {
      state.players[playerId]!.research.activeProgram = 'advanced-weapons';
      state.players[playerId]!.research.progress['advanced-weapons'] = selectResearchBranchCostV2(
        state,
        WORLD_CONTENT_V2,
        playerId,
        'advanced-weapons',
      );
    }
    const left = planAiCommandsV2(state, WORLD_CONTENT_V2);
    const right = planAiCommandsV2(structuredClone(state), WORLD_CONTENT_V2);
    expect(left).toEqual(right);
    expect(left.some((command) => command.type === 'choose-research-breakthrough'
      && command.playerId === human)).toBe(false);
    const rivalChoice = left.find((command) => command.type === 'choose-research-breakthrough'
      && command.playerId === rival);
    expect(rivalChoice).toMatchObject({
      type: 'choose-research-breakthrough',
      playerId: rival,
      branch: 'advanced-weapons',
      effect: 'attack',
    });
  });

  it('allows multiple simultaneous fronts and charges each one', () => {
    const state = createWorldStateV2(706);
    enterPostBlackoutCampaignForTestV2(state);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const luxembourg = nationIdV2('lux');
    state.players[belgium].treasury = 10_000;
    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, netherlands).accepted).toBe(true);
    const oneFrontCost = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).warOperations;
    const status = warDeclarationStatusV2(state, WORLD_CONTENT_V2, belgium, luxembourg);
    expect(status.allowed).toBe(true);
    expect(status.warning).toMatch(/front 2/i);
    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, luxembourg).accepted).toBe(true);
    expect(state.wars.filter((war) => war.attackerId === belgium || war.defenderId === belgium)).toHaveLength(2);
    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).warOperations).toBeGreaterThan(oneFrontCost);
  });

  it('unlocks one canonical empire name after the first absorbed country', () => {
    const belgium = nationIdV2('bel');
    const untouched = new WorldEngineV2(707);
    expect(untouched.setEmpireName(untouched.state.humanPlayerId, 'North Sea Union').accepted).toBe(false);
    const engine = new WorldEngineV2(708);
    engine.state.territories[territoryIdV2('lux')].owner = belgium;
    engine.state.territories[territoryIdV2('lux')].coreOwner = belgium;
    engine.state.territories[territoryIdV2('lux')].integration = 1;
    delete engine.state.territories[territoryIdV2('lux')].integrationProgram;
    invalidateTerritoryIndexV2(engine.state);
    engine.chooseCountry(belgium);
    engine.stopClock();
    expect(engine.setEmpireName(belgium, 'North Sea Union').accepted).toBe(true);
    engine.step();
    expect(engine.state.players[belgium].empireName).toBe('North Sea Union');
    expect(engine.player(belgium)?.name).toBe('North Sea Union');
    expect(JSON.parse(engine.save()).players.bel.empireName).toBe('North Sea Union');
  });
});

describe('V2 serious every-nation-for-itself routing and legacy Alternative helpers', () => {
  it('keeps the legacy Alternative cooperation curve deterministic', () => {
    const cautious = coalitionWillingnessV2(20);
    const moderate = coalitionWillingnessV2(50);
    const aggressive = coalitionWillingnessV2(85);

    expect(cautious).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(aggressive);
    expect(cautious).toBeGreaterThan(0.60);
    expect(aggressive).toBeLessThan(0.05);
  });

  function firstConquestThreat(humanId: string, capturedId: string): ReturnType<typeof selectGlobalResistanceV2> {
    const state = createWorldStateV2(709);
    const human = nationIdV2(humanId);
    state.humanPlayerId = human;
    state.wars = [];
    state.aiEscalation = {
      lastWarStartTick: -1_000_000,
      openingConflictsStarted: 0,
      lastFederationTick: -1_000_000,
      resistanceLevel: 0,
      globalThreat: 0,
      coalitionMembers: [],
      lastHumanTerritoryCount: 1,
      lastHumanPower: 0,
    };
    state.territories[territoryIdV2(capturedId)].owner = human;
    updateGlobalResistanceV2(state, WORLD_CONTENT_V2);
    return selectGlobalResistanceV2(state);
  }

  it('keeps obsolete global suspicion at zero for small and major Campaign powers', () => {
    const belgium = firstConquestThreat('bel', 'nld');
    const unitedStates = firstConquestThreat('usa', 'can');
    expect(belgium.level).toBe(0);
    expect(belgium.members).toBe(0);
    expect(belgium.threat).toBe(0);
    expect(unitedStates.threat).toBe(0);
  });

  it('reacts to live military rank so any current top-five power triggers faster federations', () => {
    const ordinary = createWorldStateV2(715);
    const dominant = createWorldStateV2(715);
    const belgium = nationIdV2('bel');
    ordinary.humanPlayerId = belgium;
    dominant.humanPlayerId = belgium;
    const belgianArmy = dominant.territories[territoryIdV2('bel')].army;
    belgianArmy.manpower = 50;
    belgianArmy.capacity = 50;

    const ordinaryPolicy = selectDefensiveFederationPolicyV2(ordinary, WORLD_CONTENT_V2);
    const dominantPolicy = selectDefensiveFederationPolicyV2(dominant, WORLD_CONTENT_V2);
    expect(dominantPolicy.threshold).toBeLessThan(ordinaryPolicy.threshold);
    expect(dominantPolicy.cooldown).toBeLessThan(ordinaryPolicy.cooldown);
    expect(dominantPolicy.maxParticipants).toBeGreaterThan(ordinaryPolicy.maxParticipants);
  });

  it('keeps Belgium outside a containment coalition after its first real conquest', () => {
    const resistance = firstConquestThreat('bel', 'lux');
    expect(resistance.level).toBe(0);
    expect(resistance.members).toBeLessThan(3);
    expect(resistance.threat).toBeLessThan(12);
  });

  it('clears legacy coalition membership instead of forming a Campaign bloc', () => {
    const state = createWorldStateV2(703);
    state.aiEscalation.globalThreat = 100;
    for (let wave = 0; wave < 6; wave += 1) {
      state.tick = 156 + wave * 52;
      updateGlobalResistanceV2(state, WORLD_CONTENT_V2);
    }
    const formed = selectGlobalResistanceV2(state);
    expect(formed.members).toBe(0);
    expect(formed.level).toBe(0);
    expect(state.aiEscalation.coalitionMembers).toEqual([]);

    state.aiEscalation.globalThreat = 0;
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(selectGlobalResistanceV2(state).members).toBe(0);
  });

  it('normalizes stale coalition saves without granting any combat multiplier', () => {
    const state = createWorldStateV2(704);
    state.aiEscalation.globalThreat = 80;
    state.aiEscalation.coalitionMembers = WORLD_CONTENT_V2.nationIds
      .filter((id) => id !== state.humanPlayerId).slice(0, 40);
    const human = state.humanPlayerId;
    const enemy = state.aiEscalation.coalitionMembers[0]!;
    const third = WORLD_CONTENT_V2.nationIds.find((id) => id !== human && id !== enemy
      && !state.aiEscalation.coalitionMembers.includes(id))!;
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    expect(resistanceCombatMultiplierV2(state, human, enemy)).toEqual({ attacker: 1, defender: 1 });
    expect(resistanceCombatMultiplierV2(state, enemy, human).attacker).toBe(1);
    expect(resistanceCombatMultiplierV2(state, enemy, third)).toEqual({ attacker: 1, defender: 1 });

    state.players[enemy].empireName = 'European Defense Federation';
    expect(resistanceCombatMultiplierV2(state, enemy, human)).toEqual({ attacker: 1, defender: 1 });
    expect(selectGlobalResistanceV2(state)).toMatchObject({ defenseBonus: 0, offensiveBonus: 0 });
  });

  it('gives each founding pair a stable, varied federation identity without adding bonuses', () => {
    const lowCountries = defensiveFederationNameV2(
      WORLD_CONTENT_V2,
      [nationIdV2('lux'), nationIdV2('nld')],
    );
    const balticPair = defensiveFederationNameV2(
      WORLD_CONTENT_V2,
      [nationIdV2('est'), nationIdV2('lva')],
    );
    expect(defensiveFederationNameV2(
      WORLD_CONTENT_V2,
      [nationIdV2('nld'), nationIdV2('lux')],
    )).toBe(lowCountries);
    expect(lowCountries).toMatch(/^LUX–NLD .* Defense Federation$/);
    expect(balticPair).toMatch(/^EST–LVA .* Defense Federation$/);
    expect(balticPair).not.toBe(lowCountries);

    const allPairNames: string[] = [];
    for (let left = 0; left < WORLD_CONTENT_V2.nationIds.length; left += 1) {
      for (let right = left + 1; right < WORLD_CONTENT_V2.nationIds.length; right += 1) {
        allPairNames.push(defensiveFederationNameV2(
          WORLD_CONTENT_V2,
          [WORLD_CONTENT_V2.nationIds[left]!, WORLD_CONTENT_V2.nationIds[right]!],
        ));
      }
    }
    expect(allPairNames.every((name) => (
      name.length <= 36
      && !/[<>\r\n]/.test(name)
      && name.endsWith('Defense Federation')
    ))).toBe(true);
    expect(new Set(allPairNames).size).toBe(allPairNames.length);

    const state = createWorldStateV2(704_001);
    const centralAfrica = nationIdV2('caf');
    state.players[centralAfrica].empireName = defensiveFederationNameV2(
      WORLD_CONTENT_V2,
      [centralAfrica, nationIdV2('cod')],
    );
    expect(invariantErrorsV2(state, WORLD_CONTENT_V2)).toEqual([]);
  });

  it('does not turn every loose coalition member into an automatic player attacker', () => {
    const state = createWorldStateV2(714);
    enterPostBlackoutCampaignForTestV2(state);
    state.wars = [];
    state.tick = 80;
    state.aiEscalation.lastWarStartTick = -1_000_000;
    state.aiEscalation.globalThreat = 80;
    state.aiEscalation.resistanceLevel = 2;
    state.aiEscalation.coalitionMembers = WORLD_CONTENT_V2.nationIds
      .filter((id) => id !== state.humanPlayerId);
    for (const id of state.aiEscalation.coalitionMembers) state.players[id].treasury = 100_000;

    const declarations = planAiCommandsV2(state, WORLD_CONTENT_V2)
      .filter((command) => command.type === 'declare-war');
    expect(declarations).toHaveLength(0);
  });

  it('never uses regional escalation to exceed the global simultaneous-war cap', () => {
    const mainWar = {
      id: 'war-regional',
      attackerId: nationIdV2('deu'),
      defenderId: nationIdV2('nld'),
      startedTick: 0,
      lastBattleTick: 96,
      warScore: 24,
      battles: 24,
      attackerLosses: 0.1,
      defenderLosses: 0.2,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    };
    const state = createWorldStateV2(720);
    state.tick = 96;
    const activeWarCap = aiActiveWarCapV2(WORLD_CONTENT_V2.nationIds.length, state.tick);
    const fillerIds = WORLD_CONTENT_V2.nationIds.filter((id) => (
      id !== state.humanPlayerId && id !== mainWar.attackerId && id !== mainWar.defenderId
    )).slice(0, (activeWarCap - 1) * 2);
    state.wars = [mainWar, ...Array.from({ length: activeWarCap - 1 }, (_, index) => ({
      ...mainWar,
      id: `war-filler-${index}`,
      attackerId: fillerIds[index * 2]!,
      defenderId: fillerIds[index * 2 + 1]!,
      startedTick: 96,
      battles: 0,
      warScore: 0,
    }))];
    state.aiEscalation.lastWarStartTick = -1_000_000;
    for (const player of Object.values(state.players)) player.treasury = 100_000;
    expect(planAiCommandsV2(state, WORLD_CONTENT_V2).some((command) => (
      command.type === 'declare-war'
    ))).toBe(false);
  });

  it('keeps the legacy Alternative defensive-aid assessment bounded', () => {
    const human = nationIdV2('bel');
    const aggressor = nationIdV2('deu');
    const supporter = nationIdV2('nld');
    const state = createWorldStateV2(52_001);
    state.humanPlayerId = human;
    state.humanPlayerIds = [human];
    state.tick = 120;
    const war = {
      id: 'war-human-defense',
      attackerId: aggressor,
      defenderId: human,
      startedTick: 75,
      lastBattleTick: 120,
      warScore: 18,
      battles: 12,
      attackerLosses: 0.02,
      defenderLosses: 0.05,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    };
    state.wars = [war];
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === human) territory.army.manpower *= 0.1;
    }
    const livePowers = createPowerSnapshotV2(state, WORLD_CONTENT_V2);
    const viableJointPowers = {
      ...livePowers,
      byNation: new Map(livePowers.byNation).set(aggressor, 100)
        .set(human, 40)
        .set(supporter, 85),
      leaderPower: Math.max(100, livePowers.leaderPower),
    };
    const assessment = selectDefensiveAidAssessmentV2(
      state, WORLD_CONTENT_V2, supporter, war, 'land', viableJointPowers,
    );
    expect(assessment).toBeDefined();
    expect(assessment!.interventionChance).toBeGreaterThanOrEqual(0.12);
    expect(assessment!.interventionChance).toBeLessThanOrEqual(0.54);
  });

  it('keeps ordinary expansion declarations rare and led by credible military powers', () => {
    const attackers = new Set<string>();
    for (let seed = 800; seed < 920; seed += 1) {
      const state = createWorldStateV2(seed);
      enterPostBlackoutCampaignForTestV2(state);
      state.wars = [];
      state.tick = 184;
      state.aiEscalation.lastWarStartTick = -1_000_000;
      for (const player of Object.values(state.players)) player.treasury = 100_000;
      const declaration = planAiCommandsV2(state, WORLD_CONTENT_V2)
        .find((command) => command.type === 'declare-war');
      if (declaration?.type === 'declare-war') attackers.add(declaration.attackerId);
    }
    expect(attackers.size).toBeGreaterThanOrEqual(1);
    expect(attackers.size).toBeLessThanOrEqual(8);
    expect([...attackers].some((id) => WORLD_CONTENT_V2.nations[nationIdV2(id)].real.powerIndex >= 60)).toBe(true);
  }, 60_000);

  it('makes AI great powers avoid direct peer wars throughout the opening fifty years', () => {
    const directPeerWars: string[] = [];
    for (let seed = 4_500; seed < 4_540; seed += 1) {
      const state = createWorldStateV2(seed);
      enterPostBlackoutCampaignForTestV2(state);
      state.tick = 520;
      state.wars = [];
      state.aiEscalation.lastWarStartTick = -1_000_000;
      for (const player of Object.values(state.players)) player.treasury = 100_000;
      for (const command of planAiCommandsV2(state, WORLD_CONTENT_V2)) {
        if (command.type !== 'declare-war') continue;
        const attackerMajor = (WORLD_CONTENT_V2.nations[command.attackerId]?.real.powerIndex ?? 0) >= 70;
        const defenderMajor = (WORLD_CONTENT_V2.nations[command.defenderId]?.real.powerIndex ?? 0) >= 70;
        if (attackerMajor && defenderMajor) directPeerWars.push(`${command.attackerId}:${command.defenderId}`);
      }
    }
    expect(directPeerWars).toEqual([]);
  }, 10_000);

  it('uses present-day real-world alignments only as soft affinity tags', () => {
    expect(WORLD_CONTENT_V2.nations[nationIdV2('bel')].influenceTags).toEqual(expect.arrayContaining(['bloc:nato', 'bloc:eu']));
    expect(WORLD_CONTENT_V2.nations[nationIdV2('ind')].influenceTags).toContain('bloc:brics');
    expect(WORLD_CONTENT_V2.nations[nationIdV2('che')].influenceTags).not.toContain('bloc:nato');
  });

  it('makes late major-power aggression trigger faster and larger federation waves', () => {
    const belgiumState = createWorldStateV2(713);
    belgiumState.humanPlayerId = nationIdV2('bel');
    belgiumState.tick = 1_040;
    const usaState = createWorldStateV2(713);
    usaState.humanPlayerId = nationIdV2('usa');
    usaState.tick = 1_040;
    const belgiumPolicy = selectDefensiveFederationPolicyV2(belgiumState, WORLD_CONTENT_V2);
    const usaPolicy = selectDefensiveFederationPolicyV2(usaState, WORLD_CONTENT_V2);
    expect(usaPolicy.threshold).toBeLessThan(belgiumPolicy.threshold);
    expect(usaPolicy.cooldown).toBeLessThan(belgiumPolicy.cooldown);
    expect(usaPolicy.maxParticipants).toBeGreaterThan(belgiumPolicy.maxParticipants);
    expect(usaPolicy.maxFederationTerritories).toBeGreaterThan(belgiumPolicy.maxFederationTerritories);
  });

  it('never fuses nearby countries in serious Campaign despite stale coalition data', () => {
    const state = createWorldStateV2(712);
    const human = state.humanPlayerId;
    state.wars = [];
    state.aiEscalation.globalThreat = 90;
    state.aiEscalation.lastFederationTick = 0;
    state.aiEscalation.coalitionMembers = [nationIdV2('lux'), nationIdV2('nld')];
    const livingOwnersBefore = [...new Set(Object.values(state.territories)
      .map((territory) => territory.owner))];
    for (const [index, id] of livingOwnersBefore.entries()) {
      state.players[id].trainedReserves = (index + 1) / 1_000;
    }
    const reservesBefore = new Map(livingOwnersBefore.map((id) => [
      id,
      state.players[id].trainedReserves,
    ]));
    const territoryStatsBefore = new Map(Object.entries(state.territories).map(([id, territory]) => [
      id,
      {
        population: territory.population,
        economy: territory.economy,
        manpower: territory.army.manpower,
        baseAttack: territory.army.baseAttack,
        baseDefense: territory.army.baseDefense,
      },
    ]));
    const livingReservesBefore = livingOwnersBefore
      .reduce((sum, id) => sum + state.players[id].trainedReserves, 0);
    const home = state.territories[state.players[human].capitalId];
    home.army.capacity = 2;
    home.army.manpower = 2;
    const firstEligibleWindow = Math.ceil(
      selectDefensiveFederationPolicyV2(state, WORLD_CONTENT_V2).cooldown / 104,
    ) * 104;
    state.tick = firstEligibleWindow + 52;
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(new Set(Object.values(state.territories).map((territory) => territory.owner)).size)
      .toBe(livingOwnersBefore.length);
    state.tick = firstEligibleWindow + 104;
    const livingBefore = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    const rivalTreasuryBefore = Object.entries(state.players)
      .filter(([id]) => id !== human)
      .reduce((sum, [, nation]) => sum + nation.treasury, 0);

    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    const livingAfter = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    expect(livingAfter).toBe(livingBefore);
    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    return;
    const federation = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== human
      && state.players[id].empireName.endsWith('Defense Federation')
      && selectTerritoriesOfV2(state, id).length >= 2
    ));
    expect(federation).toBeDefined();
    const livingOwnersAfter = new Set(Object.values(state.territories)
      .map((territory) => territory.owner));
    const livingReservesAfter = Object.values(state.players)
      .reduce((sum, nation) => sum + nation.trainedReserves, 0);
    const absorbedMembers = livingOwnersBefore.filter((id) => !livingOwnersAfter.has(id));
    expect(absorbedMembers).toHaveLength(livingBefore - livingAfter);
    expect(livingReservesAfter).toBeCloseTo(livingReservesBefore, 6);
    for (const id of absorbedMembers) {
      expect(state.players[id].trainedReserves).toBe(reservesBefore.get(id));
    }
    const firstFederationSize = selectTerritoriesOfV2(state, federation!).length;
    expect(firstFederationSize).toBe(2);
    const joiningTerritories = selectTerritoriesOfV2(state, federation!)
      .filter((territory) => absorbedMembers.includes(territory.coreOwner));
    expect(joiningTerritories).not.toHaveLength(0);
    for (const territory of joiningTerritories) {
      expect(territory.integration).toBe(0.10);
      expect(territory.integrationProgram).toBeDefined();
      expect(territory.integrationProgram!.completesTick - territory.integrationProgram!.startedTick).toBe(
        Math.round(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territory.id)
          * FEDERATION_INTEGRATION_DURATION_FACTOR_V2),
      );
      expect({
        population: territory.population,
        economy: territory.economy,
        manpower: territory.army.manpower,
        baseAttack: territory.army.baseAttack,
        baseDefense: territory.army.baseDefense,
      }).toEqual(territoryStatsBefore.get(territory.id));
    }
    const rivalTreasuryAfter = Object.entries(state.players)
      .filter(([id]) => id !== human)
      .reduce((sum, [, nation]) => sum + nation.treasury, 0);
    const federationNationalCap = nationalArmyCapacityTargetV2(
      state,
      WORLD_CONTENT_V2,
      federation!,
    );
    for (const territory of selectTerritoriesOfV2(state, federation!)) {
      const localCapacity = stateTerritoryArmyCapacityTargetV2(
        state,
        WORLD_CONTENT_V2,
        territory.id,
        federation!,
      );
      expect(territory.army.capacity).toBeCloseTo(localCapacity, 8);
      const isFederationHomeland = WORLD_CONTENT_V2.territories[territory.id]?.initialOwnerId
        === federation!;
      expect(stateTerritoryArmySupportCeilingV2(
        state,
        WORLD_CONTENT_V2,
        territory.id,
        federation!,
      )).toBeCloseTo(
        localCapacity + federationNationalCap * (isFederationHomeland
          ? INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2
          : CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2),
        8,
      );
    }
    expect(rivalTreasuryAfter).toBeCloseTo(rivalTreasuryBefore, 8);
    expect(state.events.some((event) => /accelerated integration/i.test(event.message))).toBe(true);

    // A federation cannot absorb another country in the same instant. Growth
    // requires another full cooldown and therefore remains visible/gradual.
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(selectTerritoriesOfV2(state, federation!).length).toBe(firstFederationSize);

    // National stores and identity move exactly once when the last peaceful
    // program completes; until then the former country remains recoverable.
    state.tick = Math.max(...joiningTerritories.map((territory) => (
      territory.integrationProgram!.completesTick
    )));
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    for (const id of absorbedMembers) expect(state.players[id]).toBeUndefined();
    expect(state.players[federation!].trainedReserves).toBeCloseTo(
      (reservesBefore.get(federation!) ?? 0)
        + absorbedMembers.reduce((sum, id) => sum + (reservesBefore.get(id) ?? 0), 0),
      6,
    );
  });

  it('keeps an expanding AI major and its neighbours independent in serious Campaign', () => {
    const state = createWorldStateV2(714);
    const human = nationIdV2('bel');
    const russia = nationIdV2('rus');
    const ukraine = nationIdV2('ukr');
    state.humanPlayerId = human;
    state.wars = [];
    state.tick = 832;
    state.aiEscalation.globalThreat = 0;
    state.aiEscalation.coalitionMembers = [];
    state.aiEscalation.lastFederationTick = 0;
    state.territories[ukraine].owner = russia;
    state.territories[ukraine].integration = 1;
    const livingBefore = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;

    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    const livingAfter = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    expect(livingAfter).toBe(livingBefore);
    expect(state.aiEscalation.coalitionMembers).toHaveLength(0);
    return;
    const federations = WORLD_CONTENT_V2.nationIds.filter((id) => (
      state.players[id].empireName.endsWith('Defense Federation')
    ));
    expect(federations).toHaveLength(1);
    expect(selectTerritoriesOfV2(state, federations[0]!)).toHaveLength(2);
    expect(state.aiEscalation.coalitionMembers).toHaveLength(0);
    expect(state.events.some((event) => /contain Russia|Russia's expansion/i.test(event.message))).toBe(true);
  });

  it('retires an exiled federation member whose only holding is the leader core', () => {
    const state = createWorldStateV2(715);
    const luxembourg = nationIdV2('lux');
    const netherlands = nationIdV2('nld');
    state.wars = [];
    state.aiEscalation.coalitionMembers = [luxembourg, netherlands];
    state.players[netherlands].empireName = 'Low Countries Defense Federation';
    // Luxembourg survives only on the Netherlands core. Its own former core
    // is already permanent Dutch territory, so joining is an immediate core
    // restoration with no integration program to retain a zombie identity.
    state.territories[territoryIdV2('lux')].owner = netherlands;
    state.territories[territoryIdV2('lux')].coreOwner = netherlands;
    state.territories[territoryIdV2('lux')].integration = 1;
    state.territories[territoryIdV2('nld')].owner = luxembourg;
    state.territories[territoryIdV2('nld')].coreOwner = netherlands;
    state.territories[territoryIdV2('nld')].integration = 1;
    invalidateTerritoryIndexV2(state);

    absorbFederationMemberV2(state, WORLD_CONTENT_V2, netherlands, luxembourg);
    expect(state.territories[territoryIdV2('nld')]).toMatchObject({
      owner: netherlands,
      coreOwner: netherlands,
      integration: 1,
    });
    expect(state.players[luxembourg]).toBeUndefined();
  });
});
