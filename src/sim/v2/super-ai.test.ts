import { describe, expect, it } from 'vitest';
import { planAiCommandsV2 } from './ai';
import { SUPER_AI_EFFICIENCY, aiActiveWarCapV2 } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { stateTerritoryArmyCapacityTargetV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { optimizeNationalAiPlanV2 } from './nationalAi';
import {
  resistanceCombatMultiplierV2,
  selectDefensiveFederationPolicyV2,
  selectGlobalResistanceV2,
  updateGlobalResistanceV2,
} from './resistance';
import {
  invalidateTerritoryIndexV2,
  selectNationalAiPlanV2,
  selectRecruitmentUnitCostV2,
  selectTerritoriesOfV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { declareWarV2, warDeclarationStatusV2 } from './war';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('V2 national Super AI', () => {
  it('usually accepts a ceasefire offer but retains a real chance to refuse', () => {
    let accepted = 0;
    const samples = 40;
    for (let seed = 1_900; seed < 1_900 + samples; seed += 1) {
      const state = createWorldStateV2(seed);
      const human = nationIdV2('bel');
      const rival = nationIdV2('lux');
      state.humanPlayerId = human;
      state.tick = 96;
      state.wars = [{
        id: 'war-peace-choice', attackerId: human, defenderId: rival,
        startedTick: 60, lastBattleTick: 96, warScore: 8, battles: 12,
        attackerLosses: 0.02, defenderLosses: 0.08, lastPeaceOfferTick: 90,
        attackerOperations: [], defenderOperations: [],
      }];
      state.offers = [{
        id: 'offer-peace-choice', fromId: human, toId: rival, warId: 'war-peace-choice',
        settlement: 'ceasefire', createdTick: 95, expiresTick: 103, status: 'pending',
        weeklyCost: 0.1, paymentWeeks: 52,
      }];
      const response = planAiCommandsV2(state, WORLD_CONTENT_V2).find((command) => (
        command.type === 'respond-to-offer' && command.offerId === 'offer-peace-choice'
      ));
      expect(response?.type).toBe('respond-to-offer');
      if (response?.type === 'respond-to-offer' && response.accept) accepted += 1;
    }
    expect(accepted).toBeGreaterThan(samples * 0.5);
    expect(accepted).toBeLessThan(samples * 0.95);
  }, 10_000);

  it('gives an invaded player a visible APEX defense against a stronger aggressor', () => {
    const ordinary = new WorldEngineV2(699);
    ordinary.stopClock();
    const defended = new WorldEngineV2(699);
    defended.stopClock();
    const russia = nationIdV2('rus');
    const ukraine = nationIdV2('ukr');
    ordinary.chooseCountry(nationIdV2('usa'));
    defended.chooseCountry(ukraine);

    const ordinaryForecast = ordinary.warForecast(russia, ukraine);
    const defendedForecast = defended.warForecast(russia, ukraine);
    expect(defendedForecast.winChance).toBeLessThanOrEqual(ordinaryForecast.winChance - 10);
    expect(defendedForecast.estimatedWeeksMax).toBeGreaterThanOrEqual(ordinaryForecast.estimatedWeeksMax);
  });

  it('stages a lightly chaotic first year without attributing those rival wars to the player', () => {
    const engine = new WorldEngineV2(700);
    expect(engine.state.wars).toHaveLength(0);
    const seenWars = new Set<string>();
    for (let week = 0; week < 50; week += 1) {
      engine.step();
      for (const war of engine.state.wars) {
        seenWars.add(`${war.attackerId}:${war.defenderId}`);
        expect(war.attackerId).not.toBe(engine.state.humanPlayerId);
      }
    }
    expect(seenWars.size).toBe(3);
    updateGlobalResistanceV2(engine.state, WORLD_CONTENT_V2);
    expect(selectGlobalResistanceV2(engine.state).threat).toBe(0);
    expect(selectGlobalResistanceV2(engine.state).members).toBe(0);
  });

  it('turns a simple player intent into an exact adaptive weekly plan', () => {
    const intent = { military: 35, research: 15, development: 50 } as const;
    const peace = optimizeNationalAiPlanV2({
      intent, activeWars: 0, fillRatio: 1, averageCondition: 1,
      researchGap: 0, treasuryWeeks: 8, superAi: true,
    });
    expect(peace.mode).toBe('growth');
    expect(peace.activeBudget).toEqual(intent);
    expect(peace.efficiency).toBe(SUPER_AI_EFFICIENCY);

    const war = optimizeNationalAiPlanV2({
      intent, activeWars: 2, fillRatio: 0.45, averageCondition: 0.7,
      researchGap: 8, treasuryWeeks: 1, superAi: true,
    });
    expect(war.mode).toBe('war');
    expect(war.activeBudget.military).toBeGreaterThan(intent.military);
    expect(Object.values(war.activeBudget).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Object.values(war.activeBudget).every((value) => value >= 10 && value <= 70)).toBe(true);
  });

  it('gives the selected nation a real efficiency advantage without changing its base country data', () => {
    const state = createWorldStateV2(701);
    const netherlands = nationIdV2('nld');
    const defaultCost = selectRecruitmentUnitCostV2(state, netherlands);
    const defaultPlan = selectNationalAiPlanV2(state, WORLD_CONTENT_V2, netherlands);
    state.humanPlayerId = netherlands;
    const superCost = selectRecruitmentUnitCostV2(state, netherlands);
    const superPlan = selectNationalAiPlanV2(state, WORLD_CONTENT_V2, netherlands);
    expect(defaultPlan.efficiency).toBe(1);
    expect(superPlan.efficiency).toBe(SUPER_AI_EFFICIENCY);
    expect(superCost).toBeCloseTo(defaultCost / SUPER_AI_EFFICIENCY, 5);
  });

  it('makes enemy AI repair weak armies and redirect research automatically', () => {
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
      expect(budgetCommand.budget.military).toBeGreaterThan(
        Math.max(budgetCommand.budget.research, budgetCommand.budget.development),
      );
      expect(Object.values(budgetCommand.budget).reduce((sum, value) => sum + value, 0)).toBe(100);
    }
    const research = commands.find((command) => command.type === 'set-research-allocations');
    expect(research?.type).toBe('set-research-allocations');
    if (research?.type === 'set-research-allocations') {
      expect(research.allocations['population-recruitment']).toBeGreaterThan(research.allocations['advanced-weapons']);
      expect(Object.values(research.allocations).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(Object.values(research.allocations).every((value) => value >= 5)).toBe(true);
    }
  });

  it('builds different research portfolios for different national needs', () => {
    const state = createWorldStateV2(704);
    state.tick = 32;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2)
      .filter((command) => command.type === 'set-research-allocations');
    const allocations = new Map(commands.map((command) => [command.playerId, command.allocations]));
    const luxembourg = allocations.get(nationIdV2('lux'))!;
    const india = allocations.get(nationIdV2('ind'))!;
    const burundi = allocations.get(nationIdV2('bdi'))!;
    const usa = allocations.get(nationIdV2('usa'))!;
    expect(luxembourg['population-recruitment']).toBeGreaterThan(india['population-recruitment']);
    expect(burundi['economy-science']).toBeGreaterThan(usa['economy-science']);
    expect(new Set([luxembourg, india, burundi, usa].map((mix) => JSON.stringify(mix))).size).toBeGreaterThanOrEqual(3);
    for (const mix of [luxembourg, india, burundi, usa]) {
      expect(Object.values(mix).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(Object.values(mix).every((value) => value >= 5)).toBe(true);
    }
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
    expect(budgets.get(burundi)!.development).toBeGreaterThan(budgets.get(burundi)!.military);
    expect(budgets.get(usa)!.military).toBeGreaterThan(budgets.get(usa)!.development);
    expect(budgets.get(burundi)).not.toEqual(budgets.get(usa));
  });

  it('optimizes the player nation automatically but never chooses its wars', () => {
    const state = createWorldStateV2(705);
    const human = state.humanPlayerId;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === human) territory.army.manpower = territory.army.capacity * 0.2;
    }
    state.tick = 32;
    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2);
    expect(commands.some((command) => command.type === 'set-budget-policy' && command.playerId === human)).toBe(true);
    expect(commands.some((command) => command.type === 'set-research-allocations' && command.playerId === human)).toBe(true);
    expect(commands.some((command) => command.type === 'declare-war' && command.attackerId === human)).toBe(false);
  });

  it('reassesses the player research portfolio four times as often as rival AI', () => {
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
    expect(commands.some((command) => command.type === 'set-research-allocations' && command.playerId === human)).toBe(true);
    expect(commands.some((command) => command.type === 'set-research-allocations' && command.playerId === rival)).toBe(false);
  });

  it('allows multiple simultaneous fronts and charges each one', () => {
    const state = createWorldStateV2(706);
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

describe('V2 dynamic containment coalition', () => {
  function firstConquestThreat(humanId: string, capturedId: string): ReturnType<typeof selectGlobalResistanceV2> {
    const state = createWorldStateV2(709);
    const human = nationIdV2(humanId);
    state.humanPlayerId = human;
    state.wars = [];
    state.aiEscalation = {
      lastWarStartTick: -1_000_000,
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

  it('gives small states a real opening window while major-power aggression draws more suspicion', () => {
    const belgium = firstConquestThreat('bel', 'nld');
    const unitedStates = firstConquestThreat('usa', 'can');
    expect(belgium.level).toBe(0);
    expect(belgium.members).toBe(0);
    expect(belgium.threat).toBeLessThan(4);
    expect(unitedStates.threat).toBeGreaterThan(belgium.threat * 1.7);
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
    const engine = new WorldEngineV2(710);
    const belgium = nationIdV2('bel');
    const luxembourg = nationIdV2('lux');
    engine.chooseCountry(belgium);
    engine.stopClock();
    expect(engine.declareWar(belgium, luxembourg).accepted).toBe(true);
    for (let week = 0; week < 90 && engine.state.territories[territoryIdV2('lux')].owner !== belgium; week += 1) engine.step();
    expect(engine.state.territories[territoryIdV2('lux')].owner).toBe(belgium);
    expect(engine.globalResistance().level).toBe(0);
    expect(engine.globalResistance().members).toBeLessThan(3);
    expect(engine.globalResistance().threat).toBeLessThan(12);
  });

  it('forms from expansion suspicion and affinity rather than a fixed map-share threshold', () => {
    const state = createWorldStateV2(703);
    state.aiEscalation.globalThreat = 80;
    for (let wave = 0; wave < 4; wave += 1) {
      state.tick = 156 + wave * 52;
      expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
      expect(selectGlobalResistanceV2(state).members).toBe(wave + 1);
      expect(selectGlobalResistanceV2(state).level).toBe(0);
    }
    state.tick = 364;
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBe(1);
    const formed = selectGlobalResistanceV2(state);
    expect(formed.level).toBe(1);
    expect(formed.members).toBe(5);
    expect(state.events.at(-1)?.message).toMatch(/containment coalition/i);

    state.aiEscalation.globalThreat = 0;
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(selectGlobalResistanceV2(state).level).toBe(1);
  });

  it('keeps loose containment defensive while a merged federation can coordinate a counteroffensive', () => {
    const state = createWorldStateV2(704);
    state.aiEscalation.globalThreat = 80;
    state.aiEscalation.coalitionMembers = WORLD_CONTENT_V2.nationIds
      .filter((id) => id !== state.humanPlayerId).slice(0, 40);
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBe(2);
    const human = state.humanPlayerId;
    const enemy = state.aiEscalation.coalitionMembers[0]!;
    const third = WORLD_CONTENT_V2.nationIds.find((id) => id !== human && id !== enemy
      && !state.aiEscalation.coalitionMembers.includes(id))!;
    expect(resistanceCombatMultiplierV2(state, human, enemy).defender).toBeGreaterThan(1);
    expect(resistanceCombatMultiplierV2(state, enemy, human).attacker).toBe(1);
    expect(resistanceCombatMultiplierV2(state, enemy, third)).toEqual({ attacker: 1, defender: 1 });

    state.players[enemy].empireName = 'European Defense Federation';
    expect(resistanceCombatMultiplierV2(state, enemy, human).attacker).toBeGreaterThan(1);
  });

  it('does not turn every loose coalition member into an automatic player attacker', () => {
    const state = createWorldStateV2(714);
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

  it('lets a sustained AI war escalate regionally without chaining through a human offensive', () => {
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
    let intervention: Extract<ReturnType<typeof planAiCommandsV2>[number], { type: 'declare-war' }> | undefined;
    let interventionState: ReturnType<typeof createWorldStateV2> | undefined;
    for (let seed = 720; seed < 760 && !intervention; seed += 1) {
      const state = createWorldStateV2(seed);
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
      intervention = planAiCommandsV2(state, WORLD_CONTENT_V2).find((command) => (
        command.type === 'declare-war' && command.escalatedFromWarId === mainWar.id
      ));
      if (intervention) interventionState = state;
    }
    expect(intervention).toBeDefined();
    expect(intervention?.attackerId).not.toBe(mainWar.attackerId);
    expect(intervention?.attackerId).not.toBe(mainWar.defenderId);
    expect(intervention?.attackerId).not.toBe(nationIdV2('bel'));
    expect([mainWar.attackerId, mainWar.defenderId]).toContain(intervention?.defenderId);
    expect(declareWarV2(
      interventionState!, WORLD_CONTENT_V2,
      intervention!.attackerId, intervention!.defenderId, intervention!.escalatedFromWarId,
    ).accepted).toBe(true);
    expect(interventionState!.events.at(-1)?.message).toMatch(/escalated.*intervened/i);

    const humanWar = createWorldStateV2(760);
    humanWar.tick = 96;
    humanWar.aiEscalation.lastWarStartTick = -1_000_000;
    humanWar.wars = [{ ...mainWar, id: 'war-human', attackerId: humanWar.humanPlayerId }];
    for (const player of Object.values(humanWar.players)) player.treasury = 100_000;
    expect(planAiCommandsV2(humanWar, WORLD_CONTENT_V2).some((command) => (
      command.type === 'declare-war' && command.escalatedFromWarId === 'war-human'
    ))).toBe(false);
  });

  it('sometimes lets a neighbouring AI aid the human against a much stronger aggressor', () => {
    const human = nationIdV2('ukr');
    const aggressor = nationIdV2('rus');
    let intervention: Extract<ReturnType<typeof planAiCommandsV2>[number], { type: 'declare-war' }> | undefined;
    for (let seed = 761; seed < 881 && !intervention; seed += 1) {
      const state = createWorldStateV2(seed);
      state.humanPlayerId = human;
      state.tick = 96;
      state.wars = [{
        id: 'war-human-defense',
        attackerId: aggressor,
        defenderId: human,
        startedTick: 70,
        lastBattleTick: 96,
        warScore: 18,
        battles: 12,
        attackerLosses: 0.08,
        defenderLosses: 0.22,
        lastPeaceOfferTick: -1_000_000,
        attackerOperations: [],
        defenderOperations: [],
      }];
      // Model the stated emergency: Ukraine has already lost half its fielded
      // force, making Russia a genuinely overwhelming aggressor under the live
      // mixed-army power model.
      for (const territory of Object.values(state.territories)) {
        if (territory.owner === human) territory.army.manpower *= 0.5;
      }
      // Normal expansion remains on cooldown; only a genuine linked
      // intervention can consume this decision window.
      state.aiEscalation.lastWarStartTick = 70;
      for (const player of Object.values(state.players)) player.treasury = 100_000;
      intervention = planAiCommandsV2(state, WORLD_CONTENT_V2).find((command) => (
        command.type === 'declare-war'
          && command.defenderId === aggressor
          && command.escalatedFromWarId === 'war-human-defense'
      ));
    }
    expect(intervention).toBeDefined();
    expect(intervention?.attackerId).not.toBe(human);
    expect(intervention?.attackerId).not.toBe(aggressor);
  });

  it('rotates expansion initiative across rival countries', () => {
    const attackers = new Set<string>();
    for (let seed = 800; seed < 840; seed += 1) {
      const state = createWorldStateV2(seed);
      state.wars = [];
      state.tick = 56;
      state.aiEscalation.lastWarStartTick = -1_000_000;
      for (const player of Object.values(state.players)) player.treasury = 100_000;
      const declaration = planAiCommandsV2(state, WORLD_CONTENT_V2)
        .find((command) => command.type === 'declare-war');
      if (declaration?.type === 'declare-war') attackers.add(declaration.attackerId);
    }
    expect(attackers.size).toBeGreaterThanOrEqual(3);
    expect([...attackers].some((id) => WORLD_CONTENT_V2.nations[nationIdV2(id)].real.powerIndex >= 60)).toBe(true);
  });

  it('makes AI great powers avoid direct peer wars throughout the opening fifty years', () => {
    const directPeerWars: string[] = [];
    for (let seed = 4_500; seed < 4_540; seed += 1) {
      const state = createWorldStateV2(seed);
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
  });

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

  it('lets nearby small coalition members permanently fuse against rapid expansion', () => {
    const state = createWorldStateV2(712);
    const human = state.humanPlayerId;
    state.wars = [];
    state.aiEscalation.globalThreat = 90;
    state.aiEscalation.lastFederationTick = 0;
    state.aiEscalation.coalitionMembers = [nationIdV2('lux'), nationIdV2('nld')];
    const home = state.territories[state.players[human].capitalId];
    home.army.capacity = 2;
    home.army.manpower = 2;
    state.tick = selectDefensiveFederationPolicyV2(state, WORLD_CONTENT_V2).cooldown;
    const livingBefore = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    const rivalTreasuryBefore = Object.entries(state.players)
      .filter(([id]) => id !== human)
      .reduce((sum, [, nation]) => sum + nation.treasury, 0);

    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeDefined();
    const livingAfter = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    expect(livingAfter).toBeLessThan(livingBefore);
    const federation = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== human
      && state.players[id].empireName.endsWith('Defense Federation')
      && selectTerritoriesOfV2(state, id).length >= 2
    ));
    expect(federation).toBeDefined();
    const firstFederationSize = selectTerritoriesOfV2(state, federation!).length;
    expect(firstFederationSize).toBe(2);
    expect(selectTerritoriesOfV2(state, federation!).every((territory) => territory.integration === 1)).toBe(true);
    const rivalTreasuryAfter = Object.entries(state.players)
      .filter(([id]) => id !== human)
      .reduce((sum, [, nation]) => sum + nation.treasury, 0);
    for (const territory of selectTerritoriesOfV2(state, federation!)) {
      expect(territory.army.capacity).toBeCloseTo(stateTerritoryArmyCapacityTargetV2(
        state,
        WORLD_CONTENT_V2,
        territory.id,
        federation!,
      ), 8);
    }
    expect(rivalTreasuryAfter).toBeCloseTo(rivalTreasuryBefore, 8);
    expect(state.events.some((event) => /permanently merged/i.test(event.message))).toBe(true);

    // A federation cannot absorb another country in the same instant. Growth
    // requires another full cooldown and therefore remains visible/gradual.
    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeUndefined();
    expect(selectTerritoriesOfV2(state, federation!).length).toBe(firstFederationSize);
  });

  it('lets gradual federations contain an expanding AI major power too', () => {
    const state = createWorldStateV2(714);
    const human = nationIdV2('bel');
    const russia = nationIdV2('rus');
    const ukraine = nationIdV2('ukr');
    state.humanPlayerId = human;
    state.wars = [];
    state.tick = 520;
    state.aiEscalation.globalThreat = 0;
    state.aiEscalation.coalitionMembers = [];
    state.aiEscalation.lastFederationTick = 0;
    state.territories[ukraine].owner = russia;
    state.territories[ukraine].integration = 1;
    const livingBefore = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;

    expect(updateGlobalResistanceV2(state, WORLD_CONTENT_V2)).toBeDefined();
    const livingAfter = new Set(Object.values(state.territories).map((territory) => territory.owner)).size;
    expect(livingAfter).toBe(livingBefore - 1);
    const federations = WORLD_CONTENT_V2.nationIds.filter((id) => (
      state.players[id].empireName.endsWith('Defense Federation')
    ));
    expect(federations).toHaveLength(1);
    expect(selectTerritoriesOfV2(state, federations[0]!)).toHaveLength(2);
    expect(state.aiEscalation.coalitionMembers).toHaveLength(0);
    expect(state.events.some((event) => /contain Russia|Russia's expansion/i.test(event.message))).toBe(true);
  });
});
