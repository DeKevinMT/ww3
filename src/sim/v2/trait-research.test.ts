import { describe, expect, it } from 'vitest';
import { RESEARCH_BRANCHES, round } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { processResearchV2 } from './research';
import {
  createPowerSnapshotV2,
  selectResearchCatchUpFactorV2,
  selectResearchFundingSharesV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { applyResearchProgressTraitV2 } from './traitResearch';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2, type ResearchAllocationsV2 } from './types';

const germany = nationIdV2('deu');
const czechia = nationIdV2('cze');

const militaryIndustryOnly = Object.fromEntries(
  RESEARCH_BRANCHES.map((branch) => [branch, branch === 'military-industry' ? 100 : 0]),
) as ResearchAllocationsV2;

describe('retired V2 research-progress country traits', () => {
  it('keeps every research branch at its neutral progress', () => {
    expect(applyResearchProgressTraitV2(germany, 'military-industry', 2.5)).toBe(
      round(2.5 * countryTraitFactorV2(germany, 'research-progress', {
        researchBranch: 'military-industry',
      })),
    );
    expect(applyResearchProgressTraitV2(germany, 'economy-science', 2.5)).toBe(
      round(2.5 * countryTraitFactorV2(germany, 'research-progress', {
        researchBranch: 'economy-science',
      })),
    );
  });

  it('leaves non-matching branches and empty progress unchanged', () => {
    expect(applyResearchProgressTraitV2(germany, 'advanced-weapons', 2.5)).toBe(2.5);
    expect(applyResearchProgressTraitV2(germany, 'military-industry', 0)).toBe(0);
  });

  it('cannot inherit an archived research modifier from an absorbed foreign core', () => {
    const state = createWorldStateV2(82_101);
    const czechTerritory = territoryIdV2('cze');
    state.players[germany].research.allocations = { ...militaryIndustryOnly };
    state.players[germany].research.activeProgram = 'military-industry';

    // The territory keeps Czechia as its immutable opening identity for save
    // compatibility, but neither archived country modifier can affect progress.
    state.territories[czechTerritory].owner = germany;
    state.territories[czechTerritory].coreOwner = germany;
    state.territories[czechTerritory].integration = 1;
    delete state.territories[czechTerritory].integrationProgram;

    const powerSnapshot = createPowerSnapshotV2(state, WORLD_CONTENT_V2);
    const finance = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, germany, powerSnapshot,
    );
    const catchUp = selectResearchCatchUpFactorV2(
      state, WORLD_CONTENT_V2, germany, powerSnapshot,
    );
    const poolOutput = selectResearchOutputV2(
      state, WORLD_CONTENT_V2, germany, finance, catchUp,
    );
    const fundingShare = selectResearchFundingSharesV2(
      state, WORLD_CONTENT_V2, germany,
    )['military-industry'];
    const baseProgress = round(poolOutput * fundingShare, 9);
    const expectedGermanProgress = round(applyResearchProgressTraitV2(
      germany, 'military-industry', baseProgress,
    ));
    expect(countryTraitFactorV2(germany, 'research-progress', {
      researchBranch: 'military-industry',
    })).toBe(1);
    expect(countryTraitFactorV2(czechia, 'research-progress', {
      researchBranch: 'military-industry',
    })).toBe(1);

    processResearchV2(
      state,
      WORLD_CONTENT_V2,
      new Map([[germany, finance]]),
      powerSnapshot,
    );

    expect(state.players[germany].research.progress['military-industry'])
      .toBe(expectedGermanProgress);
  });
});
