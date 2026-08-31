import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  SURINAME_OPENING_FORCE_MULTIPLIER_V2,
  WORLD_CONTENT_V2,
  normalOpeningForceQuoteV2,
  normalOpeningManpowerMultiplierV2,
} from './content';
import { selectArmyStrengthV2, selectCurrentPowerV2 } from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

describe('Suriname opening force balance', () => {
  it('keeps real opening manpower, live capacity and power at 80% of calibration', () => {
    const state = createWorldStateV2(20_260_831);
    const repeated = createWorldStateV2(20_260_831);
    const suriname = nationIdV2('sur');
    const army = state.territories[territoryIdV2('sur')]!.army;
    const repeatedArmy = repeated.territories[territoryIdV2('sur')]!.army;
    const strength = selectArmyStrengthV2(state, WORLD_CONTENT_V2, suriname);

    // Frozen neutral calibration before Suriname's country-specific factor.
    const authoredManpower = 0.016349007;
    const authoredPower = 166.843006;
    const quote = normalOpeningForceQuoteV2(
      'sur', authoredManpower, WORLD_CONTENT_V2.nations[suriname]!.real.population,
    );
    expect(SURINAME_OPENING_FORCE_MULTIPLIER_V2).toBe(0.80);
    expect(quote.initialManpower / quote.authoredInitialManpower).toBeCloseTo(0.80, 7);
    expect(quote.openingCapacity / quote.authoredOpeningCapacity).toBeCloseTo(0.80, 8);
    expect(WORLD_CONTENT_V2.nations[suriname]!.balance.initialManpower)
      .toBeCloseTo(authoredManpower * 0.80, 9);
    expect(army.manpower / quote.authoredInitialManpower).toBeCloseTo(0.80, 4);
    expect(army.manpower).toBe(0.013079);
    // Sovereign live capacity is normalized to the neutral authored opening
    // force before this country factor is applied.
    expect(army.capacity / quote.authoredInitialManpower).toBeCloseTo(0.80, 4);
    expect(army.capacity).toBe(0.013079);
    expect(strength.capacityTarget).toBe(0.013079);
    expect(selectCurrentPowerV2(state, WORLD_CONTENT_V2, suriname) / authoredPower)
      .toBeCloseTo(0.80, 4);

    // The power drop comes from fewer troops, not a hidden quality downgrade.
    expect(army.baseAttack).toBeCloseTo(9.811895849, 8);
    expect(army.baseDefense).toBeCloseTo(10.685658843, 8);
    expect(repeatedArmy).toEqual(army);
  });

  it('does not apply Suriname\'s structural factor to other countries', () => {
    expect(normalOpeningManpowerMultiplierV2('sur')).toBe(0.80);
    for (const controlId of ['guy', 'gmb', 'grl', 'isl', 'bel', 'usa']) {
      expect(normalOpeningManpowerMultiplierV2(controlId), controlId).toBe(1);
    }
  });
});
