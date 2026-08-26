import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2,
  SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2,
  humanOffensiveWarSuspicionPressureV2,
  scalePoliticalSuspicionGainV2,
} from './resistance';
import { nationIdV2, type WarStateV2 } from './types';

const human = nationIdV2('bel');
const opponents = [nationIdV2('lux'), nationIdV2('nld'), nationIdV2('fra')];

function offensiveWar(index: number, startedTick: number): WarStateV2 {
  return {
    id: `suspicion-war-${index}`,
    attackerId: human,
    defenderId: opponents[index]!,
    startedTick,
    lastBattleTick: startedTick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
    revenge: null,
  };
}

describe('human offensive-war suspicion pressure', () => {
  it('keeps one offensive modest but compounds two and three simultaneous wars', () => {
    const state = createWorldStateV2(92_001);
    state.tick = 100;
    expect(humanOffensiveWarSuspicionPressureV2(state, human)).toEqual({
      activeWars: 0,
      weeklyGain: 0,
      declarationSpike: 0,
    });

    state.wars = [offensiveWar(0, 50)];
    const one = humanOffensiveWarSuspicionPressureV2(state, human);
    state.wars.push(offensiveWar(1, 50));
    const two = humanOffensiveWarSuspicionPressureV2(state, human);
    state.wars.push(offensiveWar(2, 50));
    const three = humanOffensiveWarSuspicionPressureV2(state, human);

    expect(one.weeklyGain).toBe(0.04);
    expect(two.weeklyGain).toBeGreaterThan(one.weeklyGain * 4);
    expect(three.weeklyGain).toBeGreaterThan(two.weeklyGain * 2);
    expect(one.declarationSpike).toBe(0);
    expect(two.declarationSpike).toBe(0);
    expect(three.declarationSpike).toBe(0);
  });

  it('adds a one-time nonlinear spike for clustered declarations but none when spaced', () => {
    const quick = createWorldStateV2(92_002);
    quick.tick = 100;
    quick.wars = [
      offensiveWar(0, 98),
      offensiveWar(1, 99),
    ];
    const quickTwo = humanOffensiveWarSuspicionPressureV2(quick, human);
    quick.wars.push(offensiveWar(2, 99));
    const quickThree = humanOffensiveWarSuspicionPressureV2(quick, human);

    const spaced = createWorldStateV2(92_003);
    spaced.tick = 100;
    spaced.wars = [
      offensiveWar(0, 50),
      offensiveWar(1, 99),
    ];
    const spacedTwo = humanOffensiveWarSuspicionPressureV2(spaced, human);

    expect(quickTwo.declarationSpike).toBe(1);
    expect(quickThree.declarationSpike).toBeGreaterThan(quickTwo.declarationSpike * 3);
    expect(spacedTwo.declarationSpike).toBe(0);
    quick.tick = 102;
    expect(humanOffensiveWarSuspicionPressureV2(quick, human).declarationSpike).toBe(0);
  });

  it('accelerates positive gains uniformly while preserving zero and nonlinear war pressure', () => {
    expect(POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2).toBe(1.15);
    expect(scalePoliticalSuspicionGainV2(0)).toBe(0);
    expect(scalePoliticalSuspicionGainV2(Number.NaN)).toBe(0);

    const state = createWorldStateV2(92_004);
    state.tick = 100;
    state.wars = [offensiveWar(0, 50)];
    const one = humanOffensiveWarSuspicionPressureV2(state, human);
    state.wars.push(offensiveWar(1, 99), offensiveWar(2, 99));
    const clusteredThree = humanOffensiveWarSuspicionPressureV2(state, human);
    const oneGain = one.weeklyGain + one.declarationSpike;
    const clusteredGain = clusteredThree.weeklyGain + clusteredThree.declarationSpike;

    expect(scalePoliticalSuspicionGainV2(oneGain))
      .toBeCloseTo(oneGain * POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2, 9);
    expect(scalePoliticalSuspicionGainV2(clusteredGain))
      .toBeCloseTo(clusteredGain * POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2, 9);
    expect(scalePoliticalSuspicionGainV2(clusteredGain))
      .toBeGreaterThan(scalePoliticalSuspicionGainV2(oneGain) * 20);
  });

  it('lets peaceful suspicion fade over decades rather than disappearing after one war', () => {
    expect(SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2).toBe(0.025);
    expect(52 * SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2).toBeCloseTo(1.30, 6);
  });
});
