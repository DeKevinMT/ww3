import { describe, expect, it } from 'vitest';
import { nationIdV2, territoryIdV2, type TerritoryStateV2 } from '../sim/v2/types';
import { campaignCountrySignalPurgeCompleteV1 } from './countryUnlockEligibility';

function territory(
  owner: string,
  coreOwner: string,
  integration: number,
  integrating = false,
): TerritoryStateV2 {
  return {
    owner: nationIdV2(owner),
    coreOwner: nationIdV2(coreOwner),
    population: 1,
    economy: 1,
    integration,
    ...(integrating ? {
      integrationProgram: {
        fromOwnerId: nationIdV2('target'),
        fromCoreOwnerId: nationIdV2('target'),
        toOwnerId: nationIdV2(owner),
        startedTick: 1,
        completesTick: 10,
        annualCost: 1,
      },
    } : {}),
    army: {
      manpower: 0,
      capacity: 0,
      baseAttack: 1,
      baseDefense: 1,
    },
  };
}

describe('Campaign country unlock eligibility', () => {
  const first = territoryIdV2('target-west');
  const second = territoryIdV2('target-east');
  const other = territoryIdV2('other');
  const content = {
    territoryIds: [first, second, other],
    territories: {
      [first]: { initialOwnerId: nationIdV2('target') },
      [second]: { initialOwnerId: nationIdV2('target') },
      [other]: { initialOwnerId: nationIdV2('other') },
    },
  } as const;

  it('requires every immutable homeland territory to be owned and purged to 100%', () => {
    const state = {
      territories: {
        [first]: territory('human', 'human', 1),
        [second]: territory('human', 'target', 0.999999999999, true),
        [other]: territory('other', 'other', 1),
      },
    };
    expect(campaignCountrySignalPurgeCompleteV1(
      state, content as never, nationIdV2('human'), nationIdV2('target'),
    )).toBe(false);

    state.territories[second] = territory('human', 'human', 1);
    expect(campaignCountrySignalPurgeCompleteV1(
      state, content as never, nationIdV2('human'), nationIdV2('target'),
    )).toBe(true);
  });

  it('rejects a homeland territory lost to another empire and self-unlocks', () => {
    const state = {
      territories: {
        [first]: territory('human', 'human', 1),
        [second]: territory('rival', 'rival', 1),
        [other]: territory('other', 'other', 1),
      },
    };
    expect(campaignCountrySignalPurgeCompleteV1(
      state, content as never, nationIdV2('human'), nationIdV2('target'),
    )).toBe(false);
    expect(campaignCountrySignalPurgeCompleteV1(
      state, content as never, nationIdV2('target'), nationIdV2('target'),
    )).toBe(false);
  });
});
