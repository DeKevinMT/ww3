import { describe, expect, it } from 'vitest';
import { UNDERDOG_VETERAN_MAX_EXPERIENCE, UNDERDOG_VETERAN_MAX_SHARE } from './balance';
import { WorldEngineV2, underdogVeteranTermsV2 } from './WorldEngineV2';
import { nationIdV2 } from './types';
import { veteranBonusScoreV2 } from './veterans';

describe('V2 player underdog veteran core', () => {
  it('gives only the selected low-ranked player a rank-scaled elite subset', () => {
    const engine = new WorldEngineV2(7_401);
    const luxembourg = nationIdV2('lux');
    const ranking = engine.globalRanking();
    const rank = ranking.findIndex((entry) => entry.player.id === luxembourg) + 1;
    const expected = underdogVeteranTermsV2(rank, ranking.length);
    const manpowerBefore = engine.totalManpower(luxembourg).deployed;

    expect(engine.chooseCountry(luxembourg).accepted).toBe(true);
    engine.stopClock();
    const manpowerAfter = engine.totalManpower(luxembourg).deployed;
    const veterans = engine.totalVeterans(luxembourg);

    expect(manpowerAfter).toBe(manpowerBefore);
    expect(veterans.manpower).toBeCloseTo(manpowerAfter * expected.veteranShare, 7);
    expect(veterans.manpower).toBeGreaterThan(0);
    expect(veterans.manpower).toBeLessThanOrEqual(manpowerAfter * UNDERDOG_VETERAN_MAX_SHARE + 1e-9);
    expect(veterans.experience).toBeCloseTo(expected.veteranExperience, 7);
    expect(veterans.experience).toBeLessThanOrEqual(UNDERDOG_VETERAN_MAX_EXPERIENCE);
  });

  it('gives Luxembourg the bounded opening boost without making it a world power', () => {
    const engine = new WorldEngineV2(7_405);
    const luxembourg = nationIdV2('lux');
    const unitedStates = nationIdV2('usa');
    expect(engine.chooseCountry(luxembourg).accepted).toBe(true);
    engine.stopClock();

    const army = engine.totalManpower(luxembourg);
    const veterans = engine.totalVeterans(luxembourg);
    const belgiumForecast = engine.warForecast(luxembourg, nationIdV2('bel'));

    expect(veterans.manpower).toBeCloseTo(army.deployed * UNDERDOG_VETERAN_MAX_SHARE, 9);
    expect(veterans.experience).toBe(UNDERDOG_VETERAN_MAX_EXPERIENCE);
    expect(veterans.rank).toBeGreaterThan(1);
    expect(veterans.rank).toBeLessThan(71);
    expect(engine.warDeclarationStatus(luxembourg, nationIdV2('bel')).allowed).toBe(true);
    expect(belgiumForecast.winChance).toBeGreaterThanOrEqual(5);
    expect(belgiumForecast.winChance).toBeLessThanOrEqual(15);
    expect(engine.currentPower(luxembourg)).toBeLessThan(engine.currentPower(unitedStates) * 0.40);
  });

  it('gives the top twenty no opening veterans and never compounds a repeated selection', () => {
    const top = new WorldEngineV2(7_402);
    const unitedStates = nationIdV2('usa');
    expect(top.chooseCountry(unitedStates).accepted).toBe(true);
    top.stopClock();
    expect(top.totalVeterans(unitedStates).manpower).toBe(0);

    const underdog = new WorldEngineV2(7_403);
    const luxembourg = nationIdV2('lux');
    expect(underdog.chooseCountry(luxembourg).accepted).toBe(true);
    underdog.stopClock();
    const first = underdog.totalVeterans(luxembourg);
    expect(underdog.chooseCountry(luxembourg).accepted).toBe(true);
    underdog.stopClock();
    expect(underdog.totalVeterans(luxembourg)).toEqual(first);
  });

  it('persists the granted veteran subset without adding canonical state fields', () => {
    const engine = new WorldEngineV2(7_404);
    const luxembourg = nationIdV2('lux');
    engine.chooseCountry(luxembourg);
    engine.stopClock();
    const before = engine.totalVeterans(luxembourg);
    const resumed = WorldEngineV2.fromSave(engine.save());
    expect(resumed.totalVeterans(luxembourg)).toEqual(before);
    expect(resumed.totalManpower(luxembourg).deployed).toBe(engine.totalManpower(luxembourg).deployed);
  });

  it('merges a pre-existing cohort into the opening elite by sqrt-XP score', () => {
    const engine = new WorldEngineV2(7_406);
    const luxembourg = nationIdV2('lux');
    const army = engine.territoriesOf(luxembourg)[0]!.army;
    const existingManpower = army.manpower * 0.50;
    army.veteranManpower = existingManpower;
    army.veteranExperience = 100;
    const ranking = engine.globalRanking();
    const rank = ranking.findIndex((entry) => entry.player.id === luxembourg) + 1;
    const terms = underdogVeteranTermsV2(rank, ranking.length);
    const targetVeteranManpower = army.manpower * terms.veteranShare;
    const addedManpower = targetVeteranManpower - existingManpower;
    const expectedScore = (
      existingManpower * veteranBonusScoreV2(100)
        + addedManpower * veteranBonusScoreV2(terms.veteranExperience)
    ) / targetVeteranManpower;

    expect(engine.chooseCountry(luxembourg).accepted).toBe(true);
    engine.stopClock();
    const veterans = engine.totalVeterans(luxembourg);
    expect(veterans.manpower).toBeCloseTo(targetVeteranManpower, 9);
    expect(veteranBonusScoreV2(veterans.experience)).toBeCloseTo(expectedScore, 8);
  });
});
