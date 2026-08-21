import { describe, expect, it } from 'vitest';
import {
  BATTLE_INTERVAL_TICKS,
  CEASEFIRE_PAYEE_WEEKLY_REVENUE_CAP_SHARE,
  CEASEFIRE_PAYER_WEEKLY_REVENUE_SHARE,
  CEASEFIRE_PAYMENT_WEEKS,
  CEASEFIRE_POST_PAYMENT_TRUCE_TICKS,
  PEACE_OFFER_DURATION_TICKS,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  WAR_MOBILIZATION_TICKS,
  WAR_RECRUITMENT_THROUGHPUT_FACTOR,
} from './balance';
import { planAiCommandsV2 } from './ai';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import { invalidateTerritoryIndexV2, selectRecruitmentThroughputV2 } from './selectors';
import type { PlayerId } from './types';
import { processWarsV2, requestCeasefireV2, respondToOfferV2 } from './war';

const id = (value: string) => value as PlayerId;

function isolatedEngine(seed: number, humanId: string): WorldEngineV2 {
  const engine = new WorldEngineV2(seed);
  expect(engine.chooseCountry(humanId).accepted).toBe(true);
  engine.state.wars = [];
  engine.state.offers = [];
  engine.state.truces = [];
  engine.state.aiEscalation.lastWarStartTick = 1_000_000;
  return engine;
}

describe('clear war decisions and attrition', () => {
  it('starts Luxembourg without an artificial underdog bonus', () => {
    const engine = isolatedEngine(1_501, 'lux');
    const forecast = engine.warForecast('lux', 'bel');
    expect(forecast.attackerCombatExperience).toBe(0);
    expect(engine.combatExperience('lux').experience).toBe(0);
    expect(forecast.winChance).toBeGreaterThanOrEqual(5);
    expect(forecast.winChance).toBeLessThanOrEqual(15);

    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    expect(engine.activeWarBetween('lux', 'bel')).toBeDefined();
  }, 15_000);

  it('cuts active-war recruitment to a small fraction of peacetime throughput', () => {
    const engine = isolatedEngine(1_502, 'chn');
    const peace = selectRecruitmentThroughputV2(engine.state, WORLD_CONTENT_V2, id('ind'));
    engine.state.wars.push({
      id: 'war-training', attackerId: id('chn'), defenderId: id('ind'),
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    });
    const war = selectRecruitmentThroughputV2(engine.state, WORLD_CONTENT_V2, id('ind'));
    expect(war).toBeCloseTo(peace * WAR_RECRUITMENT_THROUGHPUT_FACTOR, 5);
  });

  it('locks emergency recruitment while a country has negative cash', () => {
    const engine = isolatedEngine(1_506, 'bel');
    engine.state.players[id('bel')].treasury = -0.01;
    const terms = engine.rapidRecruitmentTerms('bel');
    expect(terms.allowed).toBe(false);
    expect(terms.reason).toMatch(/debt/i);
    expect(engine.rapidRecruitment('bel').accepted).toBe(false);
  });

  it('does not let India regenerate indefinitely while fighting a stronger China', () => {
    const engine = isolatedEngine(1_504, 'chn');
    engine.state.players[id('chn')].treasury = 100_000;
    const indiaStart = engine.totalManpower('ind').deployed;
    const forecast = engine.warForecast('chn', 'ind');
    expect(engine.declareWar('chn', 'ind').accepted).toBe(true);
    engine.step();
    for (let week = 0; week < 520 && engine.activeWarBetween('chn', 'ind'); week += 1) engine.step();
    const indiaEnd = engine.totalManpower('ind').deployed;
    expect(forecast.winChance).toBeGreaterThan(50);
    expect(indiaEnd).toBeLessThan(indiaStart);
    expect(engine.activeWarBetween('chn', 'ind')).toBeUndefined();
    expect(engine.territoriesOf('ind')).toHaveLength(0);
  }, 15_000);

  it('turns one peace request into bounded payments plus a full extra year of mutual peace', () => {
    const engine = isolatedEngine(1_503, 'lux');
    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    const war = engine.activeWarBetween('lux', 'bel')!;
    war.startedTick = engine.state.tick - PEACE_REQUEST_MIN_WAR_AGE_TICKS;
    const terms = engine.ceasefireTerms(war.id, 'lux');
    const treasuryBefore = engine.state.players[id('lux')].treasury;
    expect(terms.allowed).toBe(true);
    expect(terms.paymentWeeks).toBe(CEASEFIRE_PAYMENT_WEEKS);
    expect(terms.postPaymentTruceTicks).toBe(CEASEFIRE_POST_PAYMENT_TRUCE_TICKS);
    expect(terms.truceTicks).toBe(CEASEFIRE_PAYMENT_WEEKS + CEASEFIRE_POST_PAYMENT_TRUCE_TICKS);
    expect(terms.weeklyCost).toBeGreaterThan(0);
    expect(terms.weeklyCost).toBeCloseTo(Math.min(
      engine.nationalEconomy('lux').weeklyRevenue * CEASEFIRE_PAYER_WEEKLY_REVENUE_SHARE,
      engine.nationalEconomy('bel').weeklyRevenue * CEASEFIRE_PAYEE_WEEKLY_REVENUE_CAP_SHARE,
    ), 5);
    expect(terms.totalCost).toBeCloseTo(terms.weeklyCost * 52, 6);
    expect(terms.repeatMultiplier).toBe(1);
    expect(engine.requestCeasefire(war.id, 'lux').accepted).toBe(true);
    engine.step();
    expect(engine.activeWarBetween('lux', 'bel')).toBeDefined();
    const offer = engine.state.offers.find((candidate) => candidate.warId === war.id && candidate.status === 'pending');
    expect(offer?.settlement).toBe('ceasefire');
    expect(offer?.weeklyCost).toBeCloseTo(terms.weeklyCost, 6);
    expect(engine.ceasefireTerms(war.id, 'lux').allowed).toBe(false);
    expect(engine.respondToOffer(offer!.id, true).accepted).toBe(true);
    const acceptedAtTick = engine.state.tick;
    engine.step();
    expect(engine.activeWarBetween('lux', 'bel')).toBeUndefined();
    expect(engine.state.players[id('lux')].treasury).toBeLessThan(treasuryBefore);
    expect(engine.state.ceasefireObligations).toHaveLength(1);
    const obligation = engine.state.ceasefireObligations[0]!;
    const truce = engine.state.truces.find((candidate) => candidate.leftId === id('bel') && candidate.rightId === id('lux'))!;
    expect(obligation.expiresTick).toBe(acceptedAtTick + CEASEFIRE_PAYMENT_WEEKS);
    expect(truce.expiresTick).toBe(acceptedAtTick + CEASEFIRE_PAYMENT_WEEKS + CEASEFIRE_POST_PAYMENT_TRUCE_TICKS);
    expect(engine.weeklyFinanceBreakdown('lux').ceasefirePayment).toBeCloseTo(terms.weeklyCost, 6);
    expect(engine.weeklyFinanceBreakdown('bel').ceasefireIncome).toBeCloseTo(terms.weeklyCost, 6);
    expect(engine.warDeclarationStatus('lux', 'bel').reason).toMatch(/peace treaty/i);
    expect(engine.warDeclarationStatus('bel', 'lux').reason).toMatch(/peace treaty/i);

    // Even a stale/missing truce record cannot bypass active instalments.
    const savedTruces = engine.state.truces;
    engine.state.truces = [];
    expect(engine.warDeclarationStatus('lux', 'bel').reason).toMatch(/payments/i);
    expect(engine.warDeclarationStatus('bel', 'lux').reason).toMatch(/payments/i);
    engine.state.truces = savedTruces;

    // The last instalment is followed by a complete additional year in which
    // neither signatory may restart the same war.
    engine.state.tick = obligation.expiresTick;
    engine.state.ceasefireObligations = [];
    expect(engine.warDeclarationStatus('lux', 'bel').allowed).toBe(false);
    expect(engine.warDeclarationStatus('lux', 'bel').reason).toContain(`${CEASEFIRE_POST_PAYMENT_TRUCE_TICKS} more weeks`);
    engine.state.tick = truce.expiresTick;
    engine.state.players[id('lux')].treasury = 1_000;
    engine.state.players[id('bel')].treasury = 1_000;
    expect(engine.warDeclarationStatus('lux', 'bel').allowed).toBe(true);
    expect(engine.warDeclarationStatus('bel', 'lux').allowed).toBe(true);

    engine.state.truces = [];
    engine.state.ceasefireObligations = [];
    engine.state.wars.push({
      id: 'war-repeat-ceasefire', attackerId: id('lux'), defenderId: id('bel'),
      startedTick: engine.state.tick - PEACE_REQUEST_MIN_WAR_AGE_TICKS,
      lastBattleTick: engine.state.tick, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    });
    expect(engine.ceasefireTerms('war-repeat-ceasefire', 'lux').repeatMultiplier).toBeCloseTo(1.10, 6);
  });

  it('cancels a treaty instead of creating money when either sovereign is absorbed', () => {
    const engine = isolatedEngine(1_509, 'lux');
    engine.state.ceasefireObligations.push({
      warId: 'absorbed-treaty', payerId: id('lux'), payeeId: id('bel'),
      weeklyCost: 3, startsTick: 0, expiresTick: 52,
    });
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner === id('lux')) {
        territory.owner = id('bel');
        territory.coreOwner = id('bel');
        territory.integration = 1;
        delete territory.integrationProgram;
      }
    }
    invalidateTerritoryIndexV2(engine.state);
    expect(engine.weeklyFinanceBreakdown('bel').ceasefireIncome).toBe(0);
    engine.step();
    expect(engine.state.ceasefireObligations).toHaveLength(0);
  });

  it('allows only one rejected peace request during the same war', () => {
    const engine = isolatedEngine(1_507, 'lux');
    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    const war = engine.activeWarBetween('lux', 'bel')!;
    war.startedTick = engine.state.tick - PEACE_REQUEST_MIN_WAR_AGE_TICKS;
    expect(engine.requestCeasefire(war.id, 'lux').accepted).toBe(true);
    engine.step();
    const offer = engine.state.offers.find((candidate) => candidate.warId === war.id && candidate.status === 'pending')!;
    expect(engine.respondToOffer(offer.id, false).accepted).toBe(true);
    expect(engine.activeWarBetween('lux', 'bel')).toBeDefined();
    expect(engine.ceasefireTerms(war.id, 'lux').allowed).toBe(false);
    expect(engine.requestCeasefire(war.id, 'lux').accepted).toBe(false);
  });

  it('keeps every peace channel closed through week 51 and gives offers 26 weeks to answer', () => {
    const engine = isolatedEngine(1_510, 'lux');
    engine.state.players[id('lux')].treasury = 1_000;
    const war = {
      id: 'war-peace-window', attackerId: id('lux'), defenderId: id('bel'),
      startedTick: 0, lastBattleTick: 50, warScore: -100, battles: 10,
      attackerLosses: 0, defenderLosses: 1, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    };
    engine.state.wars = [war];

    engine.state.tick = PEACE_REQUEST_MIN_WAR_AGE_TICKS - 1;
    expect(engine.ceasefireTerms(war.id, 'lux').allowed).toBe(false);
    expect(engine.peaceProposalTerms(war.id, 'lux').allowed).toBe(false);
    engine.state.tick = 48;
    expect(planAiCommandsV2(engine.state, WORLD_CONTENT_V2)
      .some((command) => command.type === 'request-ceasefire')).toBe(false);

    engine.state.tick = PEACE_REQUEST_MIN_WAR_AGE_TICKS;
    expect(engine.ceasefireTerms(war.id, 'lux').allowed).toBe(true);
    expect(engine.peaceProposalTerms(war.id, 'lux').allowed).toBe(true);
    expect(requestCeasefireV2(engine.state, WORLD_CONTENT_V2, war.id, id('lux')).accepted).toBe(true);
    const offer = engine.state.offers.find((candidate) => candidate.warId === war.id && candidate.status === 'pending')!;
    expect(offer.expiresTick - offer.createdTick).toBe(PEACE_OFFER_DURATION_TICKS);

    engine.state.tick = offer.expiresTick - 1;
    expect(respondToOfferV2(engine.state, WORLD_CONTENT_V2, offer.id, false).accepted).toBe(true);
    offer.status = 'pending';
    engine.state.tick = offer.expiresTick;
    expect(respondToOfferV2(engine.state, WORLD_CONTENT_V2, offer.id, false).accepted).toBe(false);
    expect(engine.respondToOffer(offer.id, false).accepted).toBe(false);
  });

  it('does not auto-surrender and requires a final territorial battle after national strength collapses', () => {
    const engine = isolatedEngine(1_508, 'lux');
    engine.state.players[id('lux')].treasury = 1_000;
    expect(engine.declareWar('lux', 'bel').accepted).toBe(true);
    engine.step();
    const war = engine.activeWarBetween('lux', 'bel')!;
    war.startedTick = 0;
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
    const engine = new WorldEngineV2(1_505);
    engine.state.wars = [];
    engine.state.offers = [];
    engine.state.truces = [];
    engine.state.aiEscalation.lastWarStartTick = -1_000_000;
    const majorIds = new Set(WORLD_CONTENT_V2.nationIds
      .filter((nationId) => nationId !== engine.state.humanPlayerId)
      .sort((left, right) => WORLD_CONTENT_V2.nations[right].real.powerIndex
        - WORLD_CONTENT_V2.nations[left].real.powerIndex)
      .slice(0, 8));
    const observed = new Set<string>();
    const majorAttackers = new Set<string>();
    for (let week = 0; week < 260; week += 1) {
      engine.step();
      for (const war of engine.state.wars) {
        if (observed.has(war.id)) continue;
        observed.add(war.id);
        if (majorIds.has(war.attackerId)) majorAttackers.add(war.attackerId);
      }
    }
    expect(majorAttackers.size).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
