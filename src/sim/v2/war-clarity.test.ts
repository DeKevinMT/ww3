import { describe, expect, it } from 'vitest';
import {
  BATTLE_INTERVAL_TICKS,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_MOBILIZATION_TICKS,
  WAR_RECRUITMENT_THROUGHPUT_FACTOR,
} from './balance';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import { selectRecruitmentThroughputV2 } from './selectors';
import { humanStartingArmyMultiplierV2 } from './traits';
import { territoryIdV2, type PlayerId } from './types';
import { processWarsV2 } from './war';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

const id = (value: string) => value as PlayerId;

function campaignAt(startedTick: number) {
  return {
    attackerObjective: 1,
    defenderObjective: 1,
    attackerCaptures: 0,
    defenderCaptures: 0,
    consolidationUntilTick: startedTick,
    expiresTick: startedTick + WAR_CAMPAIGN_MAX_TICKS,
  };
}

function isolatedEngine(seed: number, humanId: string): WorldEngineV2 {
  const engine = new WorldEngineV2(seed);
  expect(engine.chooseCountry(humanId).accepted).toBe(true);
  engine.state.wars = [];
  engine.state.offers = [];
  engine.state.truces = [];
  engine.state.aiEscalation.lastWarStartTick = 1_000_000;
  enterPostBlackoutCampaignForTestV2(engine.state);
  return engine;
}

describe('clear war decisions and attrition', () => {
  it('gives Luxembourg a visible one-shot opening force for a viable first conquest', () => {
    const engine = isolatedEngine(1_501, 'lux');
    const forecast = engine.warForecast('lux', 'bel');
    expect(forecast).not.toHaveProperty('attackerCombatExperience');
    expect(engine.state.players[id('lux')]).not.toHaveProperty('combatExperience');
    expect(humanStartingArmyMultiplierV2('lux')).toBeGreaterThan(1);
    expect(forecast.winChance).toBeGreaterThanOrEqual(80);
    expect(forecast.winChance).toBeLessThanOrEqual(95);

    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    expect(engine.activeWarBetween('lux', 'bel')).toBeDefined();
  }, 15_000);

  it('cuts active-war recruitment to zero for every participant', () => {
    const engine = isolatedEngine(1_502, 'chn');
    // Sovereign countries now start full, so author a real peacetime gap before
    // comparing it with the wartime freeze.
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner === id('nld')) {
        territory.army.manpower = territory.army.capacity * 0.50;
      }
    }
    const peace = selectRecruitmentThroughputV2(engine.state, WORLD_CONTENT_V2, id('nld'));
    engine.state.wars.push({
      id: 'war-training', attackerId: id('chn'), defenderId: id('nld'),
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerCivilianLosses: 0, defenderCivilianLosses: 0,
      revenge: null, campaign: campaignAt(0),
      attackerOperations: [], defenderOperations: [],
    });
    const war = selectRecruitmentThroughputV2(engine.state, WORLD_CONTENT_V2, id('nld'));
    expect(peace).toBeGreaterThan(0);
    expect(WAR_RECRUITMENT_THROUGHPUT_FACTOR).toBe(0);
    expect(war).toBe(0);
  });

  it('locks emergency recruitment while a country has negative cash', () => {
    const engine = isolatedEngine(1_506, 'bel');
    engine.state.players[id('bel')].treasury = -0.01;
    const terms = engine.rapidRecruitmentTerms('bel');
    expect(terms.allowed).toBe(false);
    expect(terms.reason).toMatch(/debt/i);
    expect(engine.rapidRecruitment('bel').accepted).toBe(false);
  });

  it('blocks every new war declaration while the attacker is in debt', () => {
    const engine = isolatedEngine(1_507, 'bel');
    const belgium = id('bel');
    const netherlands = id('nld');
    engine.state.players[belgium].treasury = -0.001;

    expect(engine.warDeclarationStatus(belgium, netherlands)).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/repay.*debt/i),
    });
    expect(engine.declareWar(belgium, netherlands)).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/repay.*debt/i),
    });

    engine.state.players[belgium].treasury = 0;
    expect(engine.warDeclarationStatus(belgium, netherlands).allowed).toBe(true);
  });

  it('drains India’s active army before China’s disadvantaged opening ends without conquest', () => {
    const engine = isolatedEngine(1_504, 'chn');
    engine.state.players[id('chn')].treasury = 100_000;
    const indiaStart = engine.totalManpower('ind').deployed;
    const indiaReserveStart = engine.state.players[id('ind')].trainedReserves;
    const forecast = engine.warForecast('chn', 'ind');
    expect(engine.declareWar('chn', 'ind').accepted).toBe(true);
    engine.step();
    let elapsedWeeks = 1;
    while (elapsedWeeks < 80 && engine.activeWarBetween('chn', 'ind')) {
      engine.step();
      elapsedWeeks += 1;
    }
    const indiaEnd = engine.totalManpower('ind').deployed;
    const indiaReserveEnd = engine.state.players[id('ind')].trainedReserves;
    // China sits near the strongest-country floor, so this is now a deliberately
    // desperate human opening rather than a near-even matchup.
    expect(humanStartingArmyMultiplierV2('chn')).toBeGreaterThan(0);
    expect(humanStartingArmyMultiplierV2('chn')).toBeLessThan(0.25);
    expect(forecast.winChance).toBe(5);
    expect(elapsedWeeks).toBeLessThanOrEqual(80);
    expect(engine.activeWarBetween('chn', 'ind')).toBeUndefined();
    expect(engine.state.territories[territoryIdV2('ind')].owner).toBe(id('ind'));
    expect(engine.territoriesOf('ind').length).toBeGreaterThanOrEqual(1);
    expect(indiaEnd).toBeGreaterThan(0);
    expect(indiaReserveStart).toBe(0);
    expect(indiaReserveEnd).toBe(0);
    expect(indiaEnd).toBeLessThan(indiaStart);
  }, 90_000);

  it('does not auto-surrender and requires a final territorial battle after national strength collapses', () => {
    const engine = isolatedEngine(1_508, 'lux');
    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    const war = engine.activeWarBetween('lux', 'bel')!;
    war.startedTick = 0;
    war.campaign!.consolidationUntilTick = 0;
    war.campaign!.expiresTick = WAR_CAMPAIGN_MAX_TICKS;
    war.battles = 8;
    war.warScore = 60;
    war.attackerLosses = 0.001;
    war.defenderLosses = 0.2;
    engine.state.tick = 20;
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner !== id('bel')) continue;
      territory.army.manpower = territory.army.capacity * 0.11;
    }
    engine.state.tick = 21;
    processWarsV2(engine.state, WORLD_CONTENT_V2);
    expect(engine.territoriesOf('bel').length).toBeGreaterThan(0);
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner !== id('bel')) continue;
      territory.army.manpower = 0;
    }
    processWarsV2(engine.state, WORLD_CONTENT_V2);
    expect(engine.territoriesOf('bel')).toHaveLength(1);
    do engine.state.tick += 1;
    while ((engine.state.tick - WAR_MOBILIZATION_TICKS) % BATTLE_INTERVAL_TICKS !== 0);
    processWarsV2(engine.state, WORLD_CONTENT_V2);
    expect(engine.territoriesOf('bel')).toHaveLength(0);
    expect(engine.state.events.some((event) => event.kind === 'conquest'
      && /Luxembourg defeated Belgium and conquered its land/i.test(event.message))).toBe(true);
  });

  it('gives major powers recurring initiative instead of letting minors consume every war window', () => {
    // Opening scenarios have their own pacing coverage. Use an equivalent
    // content object here so this test isolates the ordinary global scheduler
    // instead of spending three of its four slots on staged campaigns.
    const content = {
      ...WORLD_CONTENT_V2,
      metadata: { ...WORLD_CONTENT_V2.metadata!, openingProfile: 'none' as const },
    };
    const engine = new WorldEngineV2(1_505, content);
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.wars = [];
    engine.state.offers = [];
    engine.state.truces = [];
    engine.state.aiEscalation.lastWarStartTick = -1_000_000;
    const majorIds = new Set(content.nationIds
      .filter((nationId) => nationId !== engine.state.humanPlayerId)
      .sort((left, right) => content.nations[right].real.powerIndex
        - content.nations[left].real.powerIndex)
      .slice(0, 8));
    const observed = new Set<string>();
    const majorAttackers = new Set<string>();
    for (let week = 0; week < 520; week += 1) {
      engine.step();
      for (const war of engine.state.wars) {
        if (observed.has(war.id)) continue;
        observed.add(war.id);
        if (majorIds.has(war.attackerId)) majorAttackers.add(war.attackerId);
      }
    }
    expect(majorAttackers.size).toBeGreaterThanOrEqual(1);
  }, 180_000);
});
