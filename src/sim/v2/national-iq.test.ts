import { describe, expect, it } from 'vitest';
import {
  NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
  NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
  NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN,
  NATIONAL_IQ_EFFECTIVE_SCORE_MAX,
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
  NATIONAL_QUALITY_GDP_WEIGHT,
  NATIONAL_QUALITY_IQ_WEIGHT,
} from './balance';
import { selectDefensiveAidAssessmentV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import {
  calibratedMilitaryRatingsV2,
  calibratedNationalIqScoreV2,
  nationalCombatSystemQualityMultiplierV2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import {
  selectEffectiveAttackV2,
  selectWarAccessTypeV2,
  selectGlobalRankingV2,
  selectNationalIqViewV2,
  selectNationalCombatQualityV2,
  selectPopulationDynamicsV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type PlayerId } from './types';
import { logisticsThroughputShareV2, projectCombatExchangeV2 } from './war';
import { countryTraitFactorV2 } from './traits';

function contentWithIq(playerId: PlayerId, iqScore: number): WorldContentV2 {
  return {
    ...WORLD_CONTENT_V2,
    nations: {
      ...WORLD_CONTENT_V2.nations,
      [playerId]: {
        ...WORLD_CONTENT_V2.nations[playerId],
        iqScore,
      },
    },
  };
}

describe('national IQ gameplay proxy', () => {
  it('makes GDP per capita the clear primary input for army ATK and DEF quality', () => {
    expect(NATIONAL_QUALITY_GDP_WEIGHT).toBe(0.65);
    expect(NATIONAL_QUALITY_IQ_WEIGHT).toBe(0.35);
    expect(NATIONAL_QUALITY_GDP_WEIGHT + NATIONAL_QUALITY_IQ_WEIGHT).toBe(1);
    expect(NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN).toBe(1.3);
    expect(nationalCombatSystemQualityMultiplierV2(
      NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
      NATIONAL_IQ_SCORE_MIN,
    )).toBe(0.35);
    expect(nationalCombatSystemQualityMultiplierV2(
      NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
      NATIONAL_IQ_SCORE_MAX,
    )).toBe(1.65);
    expect(nationalCombatSystemQualityMultiplierV2(
      NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
      NATIONAL_IQ_EFFECTIVE_SCORE_MAX,
    )).toBe(1.715);
  });

  it('assigns every country one bounded, deterministic gameplay score', () => {
    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const view = selectNationalIqViewV2(WORLD_CONTENT_V2, playerId);
      expect(view.source).toBe('country-learning-gameplay-baseline');
      expect(view.score).toBeCloseTo(
        Math.min(
          NATIONAL_IQ_SCORE_MAX,
          WORLD_CONTENT_V2.nations[playerId].iqScore
            * countryTraitFactorV2(playerId, 'national-iq'),
        ),
        2,
      );
      expect(view.score).toBeGreaterThanOrEqual(NATIONAL_IQ_SCORE_MIN);
      expect(view.score).toBeLessThanOrEqual(NATIONAL_IQ_SCORE_MAX);
    }
    expect(calibratedNationalIqScoreV2(80_000, 16))
      .toBeGreaterThan(calibratedNationalIqScoreV2(2_000, 4));
  });

  it('puts the East-Asian learning leaders ahead of the United States', () => {
    const ranked = [...WORLD_CONTENT_V2.nationIds].sort((left, right) => (
      WORLD_CONTENT_V2.nations[right].iqScore - WORLD_CONTENT_V2.nations[left].iqScore
        || String(left).localeCompare(String(right))
    ));

    expect(ranked.slice(0, 5)).toEqual([
      nationIdV2('sgp'),
      nationIdV2('twn'),
      nationIdV2('jpn'),
      nationIdV2('kor'),
      nationIdV2('chn'),
    ]);
    expect(WORLD_CONTENT_V2.nations[nationIdV2('usa')].iqScore).toBe(99.1);
    expect(WORLD_CONTENT_V2.nations[nationIdV2('usa')].iqScore)
      .toBeLessThan(WORLD_CONTENT_V2.nations[nationIdV2('sgp')].iqScore);
  });

  it('keeps unknown-country regional fallbacks bounded and gently differentiated', () => {
    const lowCapacity = calibratedNationalIqScoreV2(
      700, 0.5, 'future-low', 'Western Africa',
    );
    const highCapacity = calibratedNationalIqScoreV2(
      70_000, 15, 'future-high', 'Western Africa',
    );

    expect(lowCapacity).toBeGreaterThanOrEqual(NATIONAL_IQ_SCORE_MIN);
    expect(highCapacity).toBeLessThanOrEqual(NATIONAL_IQ_SCORE_MAX);
    expect(highCapacity).toBeGreaterThan(lowCapacity);
    expect(highCapacity - lowCapacity).toBeLessThanOrEqual(3);
  });

  it('preserves the calibrated opening military-power order', () => {
    const ranking = selectGlobalRankingV2(createWorldStateV2(2026), WORLD_CONTENT_V2);
    expect(ranking.slice(0, 10).map((entry) => entry.player.id)).toEqual([
      nationIdV2('usa'),
      nationIdV2('chn'),
      nationIdV2('rus'),
      nationIdV2('ind'),
      nationIdV2('kor'),
      nationIdV2('fra'),
      nationIdV2('jpn'),
      nationIdV2('gbr'),
      nationIdV2('tur'),
      nationIdV2('ita'),
    ]);
  });

  it('lets GDP per capita and IQ directly form opening ATK and DEF', () => {
    const low = calibratedMilitaryRatingsV2(80, 200, 0.40, 500, 80);
    const richer = calibratedMilitaryRatingsV2(80, 200, 0.40, 100_000, 80);
    const higherIq = calibratedMilitaryRatingsV2(80, 200, 0.40, 500, 108);
    const lowSystem = nationalCombatSystemQualityMultiplierV2(500, 80);
    const richSystem = nationalCombatSystemQualityMultiplierV2(100_000, 80);
    const highIqSystem = nationalCombatSystemQualityMultiplierV2(500, 108);

    expect(richSystem).toBeGreaterThan(lowSystem);
    expect(highIqSystem).toBeGreaterThan(lowSystem);
    expect(richer.attack).toBeGreaterThan(low.attack);
    expect(richer.defense).toBeGreaterThan(low.defense);
    expect(higherIq.attack).toBeGreaterThan(low.attack);
    expect(higherIq.defense).toBeGreaterThan(low.defense);
  });

  it('applies bounded IQ effects to economy, research, logistics and population growth', () => {
    const belgium = nationIdV2('bel');
    const state = createWorldStateV2(8_201);
    const lowContent = contentWithIq(belgium, NATIONAL_IQ_SCORE_MIN);
    const highContent = contentWithIq(belgium, NATIONAL_IQ_SCORE_MAX);
    const lowView = selectNationalIqViewV2(lowContent, belgium);
    const highView = selectNationalIqViewV2(highContent, belgium);

    expect(highView.economyGrowthMultiplier).toBeGreaterThan(lowView.economyGrowthMultiplier);
    expect(highView.researchMultiplier).toBeGreaterThan(lowView.researchMultiplier);
    expect(highView.logisticsMultiplier).toBeGreaterThan(lowView.logisticsMultiplier);
    expect(highView.populationGrowthMultiplier).toBeLessThan(lowView.populationGrowthMultiplier);

    const lowFinance = selectWeeklyFinanceBreakdownV2(state, lowContent, belgium);
    const highFinance = selectWeeklyFinanceBreakdownV2(state, highContent, belgium);
    expect(highFinance.annualEconomyGrowthRate).toBeGreaterThan(lowFinance.annualEconomyGrowthRate);
    expect(selectResearchOutputV2(state, highContent, belgium, lowFinance, 1))
      .toBeGreaterThan(selectResearchOutputV2(state, lowContent, belgium, lowFinance, 1));
    expect(logisticsThroughputShareV2(0.25, 0, highView.logisticsMultiplier))
      .toBeGreaterThan(logisticsThroughputShareV2(0.25, 0, lowView.logisticsMultiplier));
    expect(selectPopulationDynamicsV2(state, highContent, belgium, 0).annualNetRate)
      .toBeLessThan(selectPopulationDynamicsV2(state, lowContent, belgium, 0).annualNetRate);
  });

  it('turns costly education research into a diminishing, hard-capped live IQ gain', () => {
    const belgium = nationIdV2('bel');
    const state = createWorldStateV2(8_205);
    const baseline = selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium].research.effectLevels['iq-increase'] = 5;
    const developed = selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium].research.effectLevels['iq-increase'] = 1_000_000;
    const capped = selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium);

    expect(developed.baselineScore).toBe(baseline.score);
    expect(developed.researchBonus).toBeGreaterThan(0);
    expect(developed.score).toBeGreaterThan(baseline.score);
    expect(developed.researchMultiplier).toBeGreaterThan(baseline.researchMultiplier);
    expect(capped.score).toBeLessThanOrEqual(NATIONAL_IQ_EFFECTIVE_SCORE_MAX);
    expect(capped.researchBonus).toBeLessThanOrEqual(8);
  });

  it('reuses an unchanged live IQ view and invalidates it for research or content changes', () => {
    const belgium = nationIdV2('bel');
    const state = createWorldStateV2(8_206);
    const baseline = selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium);

    expect(selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium)).toBe(baseline);

    state.players[belgium].research.effectLevels['iq-increase'] = 1;
    const researched = selectNationalIqViewV2(state, WORLD_CONTENT_V2, belgium);
    expect(researched).not.toBe(baseline);
    expect(researched.score).toBeGreaterThan(baseline.score);

    const alternateContent = contentWithIq(belgium, NATIONAL_IQ_SCORE_MIN);
    const alternate = selectNationalIqViewV2(state, alternateContent, belgium);
    expect(alternate).not.toBe(researched);
    expect(alternate.baselineScore).toBe(NATIONAL_IQ_SCORE_MIN);
  });

  it('uses the same bounded IQ-driven defensive coordination for every country', () => {
    const attacker = nationIdV2('bel');
    const defender = nationIdV2('nld');
    const state = createWorldStateV2(8_203);
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('nld');
    const lowContent = contentWithIq(defender, NATIONAL_IQ_SCORE_MIN);
    const highContent = contentWithIq(defender, NATIONAL_IQ_SCORE_MAX);
    const low = projectCombatExchangeV2(
      state, lowContent, attacker, defender, sourceId, targetId, 'land', 1, 1,
    )!;
    const high = projectCombatExchangeV2(
      state, highContent, attacker, defender, sourceId, targetId, 'land', 1, 1,
    )!;

    expect(high.defenseShield).toBeGreaterThan(low.defenseShield);
    expect(high.counterPressure).toBeGreaterThan(low.counterPressure);
    expect(high.defenderLosses).toBeLessThan(low.defenderLosses);
    expect(high.attackerLosses).toBeGreaterThan(low.attackerLosses);

  });

  it('keeps national-IQ traits modest for AI control and bounded for players', () => {
    const germany = nationIdV2('deu');
    const state = createWorldStateV2(8_207);
    state.humanPlayerId = nationIdV2('bel');
    state.humanPlayerIds = [nationIdV2('bel')];
    const ordinary = selectNationalIqViewV2(state, WORLD_CONTENT_V2, germany);

    expect(countryTraitFactorV2(germany, 'national-iq')).toBeGreaterThan(1);
    expect(countryTraitFactorV2(germany, 'national-iq')).toBeLessThanOrEqual(1.02);
    state.humanPlayerId = germany;
    state.humanPlayerIds = [germany];
    const human = selectNationalIqViewV2(state, WORLD_CONTENT_V2, germany);

    expect(human.score).toBeGreaterThan(ordinary.score);
    expect(countryTraitFactorV2(germany, 'national-iq', { humanControlled: true }))
      .toBeLessThanOrEqual(1.15);
  });

  it('keeps selection neutral while higher IQ narrows defensive-aid intelligence error', () => {
    const defender = nationIdV2('bel');
    const supporter = nationIdV2('nld');
    const attacker = nationIdV2('fra');
    const state = createWorldStateV2(8_204);
    state.tick = 40;
    const war = {
      id: 'shared-defensive-aid', attackerId: attacker, defenderId: defender,
      startedTick: 10, lastBattleTick: 40, warScore: 0, battles: 8,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    };
    state.wars = [war];
    const access = selectWarAccessTypeV2(state, WORLD_CONTENT_V2, supporter, attacker);
    expect(access).not.toBe('none');
    if (access === 'none') throw new Error('Expected supporter access to aggressor.');

    const powerSnapshot = {
      byNation: new Map<PlayerId, number>([
        [attacker, 100], [defender, 35], [supporter, 70],
      ]),
      leaderPower: 100,
      leaderBreakthroughs: 0,
    };
    const unselected = selectDefensiveAidAssessmentV2(
      state, WORLD_CONTENT_V2, supporter, war, access, powerSnapshot,
    );
    state.humanPlayerId = defender;
    const selected = selectDefensiveAidAssessmentV2(
      state, WORLD_CONTENT_V2, supporter, war, access, powerSnapshot,
    );
    expect(selected).toEqual(unselected);
    expect(selected).toBeDefined();

    const low = selectDefensiveAidAssessmentV2(
      state, contentWithIq(supporter, NATIONAL_IQ_SCORE_MIN), supporter, war, access,
      powerSnapshot,
    )!;
    const high = selectDefensiveAidAssessmentV2(
      state, contentWithIq(supporter, NATIONAL_IQ_SCORE_MAX), supporter, war, access,
      powerSnapshot,
    )!;
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect(high.intelligenceErrorBound).toBeLessThan(low.intelligenceErrorBound);
  });

  it('keeps base quality and research as separate multipliers', () => {
    const belgium = nationIdV2('bel');
    const state = createWorldStateV2(8_202);
    const army = state.territories[territoryIdV2('bel')].army;
    const base = calibratedMilitaryRatingsV2(80, 200, 0.40, 100_000, 108).attack;
    army.baseAttack = base;
    state.players[belgium].research.effectLevels.attack = 10;
    const nationalQuality = selectNationalCombatQualityV2(state, WORLD_CONTENT_V2, belgium);

    expect(selectEffectiveAttackV2(state, WORLD_CONTENT_V2, belgium, army))
      .toBeCloseTo(base * nationalQuality.combinedMultiplier
        * (1 + 0.10 * nationalQuality.researchConversion), 6);
  });
});
