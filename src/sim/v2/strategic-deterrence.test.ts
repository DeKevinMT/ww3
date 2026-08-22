import { describe, expect, it } from 'vitest';
import {
  NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL,
  NUCLEAR_POWER_BREAKTHROUGHS_PER_LEVEL,
  NUCLEAR_POWER_MAX_LEVEL,
  nuclearPowerTierCostV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  selectEffectiveAttackV2,
  selectNationalCombatQualityV2,
  selectNuclearPowerV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';
import { nuclearRivalryPenaltyV2 } from './ai';

describe('V2 strategic deterrence', () => {
  it('makes nuclear rivals softer AI targets without ever creating a hard block', () => {
    const earlyPeer = nuclearRivalryPenaltyV2(3, 3, 52, 1);
    const latePeer = nuclearRivalryPenaltyV2(3, 3, 780, 1);
    const weakNuclearTarget = nuclearRivalryPenaltyV2(3, 1, 52, 5);
    expect(earlyPeer).toBeGreaterThan(latePeer);
    expect(earlyPeer).toBeGreaterThan(weakNuclearTarget);
    expect(latePeer).toBeGreaterThan(0);
    expect(nuclearRivalryPenaltyV2(3, 0, 52, 1)).toBe(0);
  });
  it('starts the 2026 nuclear powers in broad strategic tiers without enabling nuclear strikes', () => {
    const state = createWorldStateV2(3_001);
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2('usa')).level).toBe(3);
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2('usa')).maxed).toBe(false);
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2('rus')).level).toBe(3);
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2('chn')).level).toBe(2);
    for (const id of ['ind', 'pak', 'prk', 'isr']) {
      expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2(id)).level).toBe(1);
    }
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, nationIdV2('deu')).level).toBe(0);
  });

  it('applies the tier only to ATK while global rank still combines power and economy', () => {
    const state = createWorldStateV2(3_002);
    const russia = nationIdV2('rus');
    const army = state.territories[territoryIdV2('rus')].army;
    const nationalQuality = selectNationalCombatQualityV2(state, WORLD_CONTENT_V2, russia);
    const attack = selectEffectiveAttackV2(state, WORLD_CONTENT_V2, russia, army);
    expect(attack).toBeCloseTo(
      WORLD_CONTENT_V2.nations[russia].militaryAttackRating!
        * nationalQuality.combinedMultiplier
        * (1 + 3 * NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL),
      6,
    );
    const engine = new WorldEngineV2(3_002);
    expect(engine.currentPower(russia)).toBeGreaterThan(engine.currentPower('ind'));
    const entry = engine.globalRanking().find((candidate) => candidate.player.id === russia)!;
    expect(entry.score).toBeCloseTo(Math.sqrt(
      engine.currentPower(russia) * engine.nationalEconomy(russia).controlledOutput,
    ), 6);
  });

  it('requires a long chain of increasingly expensive Advanced Weapons breakthroughs to unlock', () => {
    const state = createWorldStateV2(3_003);
    const germany = nationIdV2('deu');
    state.players[germany].research.breakthroughs['advanced-weapons'] = NUCLEAR_POWER_BREAKTHROUGHS_PER_LEVEL - 1;
    expect(selectNuclearPowerV2(state, WORLD_CONTENT_V2, germany).level).toBe(0);
    state.players[germany].research.breakthroughs['advanced-weapons'] += 1;
    const unlocked = selectNuclearPowerV2(state, WORLD_CONTENT_V2, germany);
    expect(unlocked.level).toBe(1);
    expect(unlocked.attackBonus).toBe(NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL);
  });

  it('lets tier-three powers progress to tiers four and five on a steep cumulative curve', () => {
    const state = createWorldStateV2(3_004);
    const usa = nationIdV2('usa');
    const tierFourCost = nuclearPowerTierCostV2(4);
    const tierFiveCost = nuclearPowerTierCostV2(5);
    const baseline = selectNuclearPowerV2(state, WORLD_CONTENT_V2, usa);
    expect(baseline.level).toBe(3);
    expect(baseline.nextLevelAt).toBe(tierFourCost);

    state.players[usa].research.breakthroughs['advanced-weapons'] = tierFourCost;
    const tierFour = selectNuclearPowerV2(state, WORLD_CONTENT_V2, usa);
    expect(tierFour.level).toBe(4);
    expect(tierFour.nextLevelAt).toBe(tierFourCost + tierFiveCost);
    expect(tierFour.maxed).toBe(false);

    state.players[usa].research.breakthroughs['advanced-weapons'] = tierFourCost + tierFiveCost;
    const tierFive = selectNuclearPowerV2(state, WORLD_CONTENT_V2, usa);
    expect(tierFive.level).toBe(NUCLEAR_POWER_MAX_LEVEL);
    expect(tierFive.maxed).toBe(true);
  });
});
