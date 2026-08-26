import { describe, expect, it } from 'vitest';
import {
  AI_DEFENSIVE_AID_COOLDOWN,
  AI_GLOBAL_WAR_COOLDOWN,
  AI_REGIONAL_ESCALATION_COOLDOWN,
  aiActiveWarCapV2,
} from './balance';
import {
  AI_EXPANSION_ROLLS_PER_DECISION,
  aiExpansionDeclarationChanceV2,
  aiHumanAttackSuspicionFactorV2,
  aiHumanWarStrainOpportunityV2,
  aiConcurrentWarLimitV2,
  aiTargetWarLimitV2,
  aiWarCandidateForecastScoreV2,
  aiWarDisciplineV2,
} from './ai';

describe('quiet but active AI war pacing', () => {
  it('uses one ordinary expansion roll and long global cooldowns', () => {
    expect(AI_EXPANSION_ROLLS_PER_DECISION).toBe(1);
    expect(AI_GLOBAL_WAR_COOLDOWN).toBe(78);
    expect(AI_REGIONAL_ESCALATION_COOLDOWN).toBe(104);
    expect(AI_DEFENSIVE_AID_COOLDOWN).toBe(52);
  });

  it('keeps the commitment roll modest and sharply discourages opportunistic dogpiles', () => {
    const ordinary = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 0,
    });
    const regional = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: true,
      rivalInvaderCount: 0,
    });
    const dogpile = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 1,
    });

    expect(ordinary).toBeCloseTo(0.172, 6);
    expect(regional).toBeCloseTo(0.212, 6);
    expect(dogpile).toBeLessThanOrEqual(0.05);
  });

  it('uses suspicion instead of a fixed calendar shield for human countries', () => {
    expect(aiHumanAttackSuspicionFactorV2(0)).toBe(0);
    expect(aiHumanAttackSuspicionFactorV2(5)).toBeLessThan(0.005);
    expect(aiHumanAttackSuspicionFactorV2(10)).toBeLessThan(0.015);
    expect(aiHumanAttackSuspicionFactorV2(25)).toBeLessThan(0.08);
    expect(aiHumanAttackSuspicionFactorV2(50)).toBeGreaterThan(0.28);
    expect(aiHumanAttackSuspicionFactorV2(80)).toBeGreaterThan(0.80);
    expect(aiHumanAttackSuspicionFactorV2(100)).toBe(1.35);
  });

  it('brakes optional AI wars as the world fills while retaining the human-strain opening', () => {
    const quietWorld = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 0,
      globalWarLoad: 0,
    });
    const busyWorld = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 0,
      globalWarLoad: 1,
    });
    const strainedHuman = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 0,
      humanWarStrainPressure: 1,
      globalWarLoad: 1,
    });

    expect(busyWorld).toBeLessThan(quietWorld * 0.6);
    expect(strainedHuman).toBeGreaterThan(quietWorld * 1.8);
  });

  it('opens a bounded, progressive opportunistic window above controlled war strain', () => {
    const controlled = aiHumanWarStrainOpportunityV2(39);
    const guarded = aiHumanWarStrainOpportunityV2(50);
    const high = aiHumanWarStrainOpportunityV2(70);
    const critical = aiHumanWarStrainOpportunityV2(90);
    const ordinaryDogpile = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 1,
    });
    const strainedDogpile = aiExpansionDeclarationChanceV2({
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 1,
      neighborCounterattackPressure: critical.pressure,
    });

    expect(controlled).toMatchObject({ pressure: 0, targetWarLimit: 1, level: 'none' });
    expect(guarded).toMatchObject({ targetWarLimit: 1, level: 'guarded' });
    expect(high).toMatchObject({ targetWarLimit: 2, level: 'high' });
    expect(critical).toMatchObject({ targetWarLimit: 3, level: 'critical' });
    expect(controlled.pressure).toBeLessThan(guarded.pressure);
    expect(guarded.pressure).toBeLessThan(high.pressure);
    expect(high.pressure).toBeLessThan(critical.pressure);
    expect(critical.rivalCautionMultiplier).toBeGreaterThanOrEqual(0.35);
    expect(strainedDogpile).toBeGreaterThan(ordinaryDogpile * 3);
    expect(strainedDogpile).toBeLessThanOrEqual(0.30);
  });

  it('uses IQ for safer target selection and timing, never for a larger war roll', () => {
    const low = aiWarDisciplineV2(80);
    const high = aiWarDisciplineV2(108);
    const lowForecastEdge = aiWarCandidateForecastScoreV2(70, 1, 80)
      - aiWarCandidateForecastScoreV2(45, 1, 80);
    const highForecastEdge = aiWarCandidateForecastScoreV2(70, 1, 108)
      - aiWarCandidateForecastScoreV2(45, 1, 108);

    expect(high.forecastWeight).toBeGreaterThan(low.forecastWeight);
    expect(high.minimumWinChance).toBeGreaterThan(low.minimumWinChance);
    expect(high.additionalRunwayWeeks).toBeGreaterThan(low.additionalRunwayWeeks);
    expect(highForecastEdge).toBeGreaterThan(lowForecastEdge);
  });

  it('keeps ordinary countries on one front and mature great powers on at most two', () => {
    expect(aiConcurrentWarLimitV2(0.59, 1_000)).toBe(1);
    expect(aiConcurrentWarLimitV2(0.60, 259)).toBe(1);
    expect(aiConcurrentWarLimitV2(0.60, 260)).toBe(2);
    expect(aiConcurrentWarLimitV2(1, 10_000)).toBe(2);
  });

  it('reserves dogpiles for explicit intervention and keeps the world cap small', () => {
    expect(aiTargetWarLimitV2(false, false)).toBe(1);
    expect(aiTargetWarLimitV2(true, false)).toBe(2);
    expect(aiTargetWarLimitV2(true, true)).toBe(4);
    expect(aiActiveWarCapV2(235, 0)).toBe(3);
    expect(aiActiveWarCapV2(235, 520)).toBe(4);
    expect(aiActiveWarCapV2(70, 0)).toBe(2);
  });
});
