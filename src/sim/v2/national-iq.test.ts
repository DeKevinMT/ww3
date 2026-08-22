import { describe, expect, it } from 'vitest';
import {
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  calibratedMilitaryRatingsV2,
  calibratedNationalIqScoreV2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import {
  selectCombatExperienceV2,
  selectEffectiveAttackV2,
  selectGlobalRankingV2,
  selectNationalIqViewV2,
  selectPopulationDynamicsV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type PlayerId } from './types';
import { logisticsThroughputShareV2 } from './war';

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
  it('assigns every country one bounded, deterministic gameplay score', () => {
    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const view = selectNationalIqViewV2(WORLD_CONTENT_V2, playerId);
      expect(view.source).toBe('country-learning-gameplay-baseline');
      expect(view.score).toBe(WORLD_CONTENT_V2.nations[playerId].iqScore);
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

  it('preserves the established opening top-ten power order', () => {
    const ranking = selectGlobalRankingV2(createWorldStateV2(2026), WORLD_CONTENT_V2);
    expect(ranking.slice(0, 10).map((entry) => entry.player.id)).toEqual([
      nationIdV2('usa'),
      nationIdV2('chn'),
      nationIdV2('rus'),
      nationIdV2('ind'),
      nationIdV2('deu'),
      nationIdV2('gbr'),
      nationIdV2('fra'),
      nationIdV2('jpn'),
      nationIdV2('sau'),
      nationIdV2('ita'),
    ]);
  });

  it('raises both opening ATK and DEF independently through GDP per capita and IQ', () => {
    const low = calibratedMilitaryRatingsV2(80, 200, 0.40, 500, 80);
    const richer = calibratedMilitaryRatingsV2(80, 200, 0.40, 100_000, 80);
    const higherIq = calibratedMilitaryRatingsV2(80, 200, 0.40, 500, 108);

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
    expect(logisticsThroughputShareV2(0.25, 0, false, highView.logisticsMultiplier))
      .toBeGreaterThan(logisticsThroughputShareV2(0.25, 0, false, lowView.logisticsMultiplier));
    expect(selectPopulationDynamicsV2(state, highContent, belgium, 0).annualNetRate)
      .toBeLessThan(selectPopulationDynamicsV2(state, lowContent, belgium, 0).annualNetRate);
  });

  it('keeps base quality, research and Combat Experience as separate multipliers', () => {
    const belgium = nationIdV2('bel');
    const state = createWorldStateV2(8_202);
    const army = state.territories[territoryIdV2('bel')].army;
    const base = calibratedMilitaryRatingsV2(80, 200, 0.40, 100_000, 108).attack;
    army.baseAttack = base;
    state.players[belgium].research.effectLevels.attack = 10;
    state.players[belgium].combatExperience = 25;
    const experience = selectCombatExperienceV2(state, belgium);

    expect(selectEffectiveAttackV2(state, WORLD_CONTENT_V2, belgium, army))
      .toBeCloseTo(base * 1.10 * experience.attackMultiplier, 6);
  });
});
