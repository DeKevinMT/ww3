import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import {
  createPowerSnapshotV2,
  selectCatchUpFactorV2,
  selectResearchBranchCostV2,
  selectResearchCatchUpFactorV2,
  selectResearchInstitutionalCapacityV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

function selectedCountryCalibration(code: string): { output: number; firstCost: number; science: number } {
  const engine = new WorldEngineV2(77_001);
  engine.chooseCountry(code);
  engine.stopClock();
  const id = nationIdV2(code);
  engine.state.players[id]!.research.activeProgram = 'economy-science';
  const powers = createPowerSnapshotV2(engine.state, WORLD_CONTENT_V2);
  const finance = selectWeeklyFinanceBreakdownV2(engine.state, WORLD_CONTENT_V2, id, powers);
  return {
    output: selectResearchOutputV2(engine.state, WORLD_CONTENT_V2, id, finance),
    firstCost: selectResearchBranchCostV2(
      engine.state, WORLD_CONTENT_V2, id, 'economy-science', powers,
    ),
    science: selectResearchInstitutionalCapacityV2(WORLD_CONTENT_V2, id),
  };
}

describe('V2 cross-country research balance', () => {
  it('keeps a rich frontier leader faster without recreating a runaway cash conveyor belt', () => {
    const usa = selectedCountryCalibration('usa');
    const qatar = selectedCountryCalibration('qat');
    const outputRatio = usa.output / qatar.output;
    const costRatio = qatar.firstCost / usa.firstCost;

    expect(usa.output).toBeGreaterThan(0);
    expect(usa.output).toBeLessThan(0.9);
    expect(qatar.output).toBeGreaterThan(0.07);
    expect(outputRatio).toBeGreaterThanOrEqual(2);
    expect(outputRatio).toBeLessThanOrEqual(8);
    expect(costRatio).toBeGreaterThanOrEqual(0.40);
    expect(costRatio).toBeLessThanOrEqual(0.65);
  });

  it('uses national research capacity as a bounded identity modifier', () => {
    const usa = selectedCountryCalibration('usa');
    const qatar = selectedCountryCalibration('qat');
    expect(usa.science).toBeGreaterThan(qatar.science);
    expect(usa.science - qatar.science).toBeGreaterThan(0.05);
    expect(qatar.science).toBeGreaterThanOrEqual(0.85);
    expect(usa.science).toBeLessThanOrEqual(1.15);
  });

  it('keeps technology catch-up separate from military ambition', () => {
    const engine = new WorldEngineV2(77_002);
    const qatarId = nationIdV2('qat');
    const base = createPowerSnapshotV2(engine.state, WORLD_CONTENT_V2);
    const technologyLeader = { ...base, leaderBreakthroughs: 12 };
    const researchBefore = selectResearchCatchUpFactorV2(
      engine.state, WORLD_CONTENT_V2, qatarId, base,
    );
    const researchAfter = selectResearchCatchUpFactorV2(
      engine.state, WORLD_CONTENT_V2, qatarId, technologyLeader,
    );
    const militaryBefore = selectCatchUpFactorV2(engine.state, WORLD_CONTENT_V2, qatarId, base);
    const militaryAfter = selectCatchUpFactorV2(
      engine.state, WORLD_CONTENT_V2, qatarId, technologyLeader,
    );

    expect(researchAfter - researchBefore).toBeCloseTo(0.35, 3);
    expect(militaryAfter).toBe(militaryBefore);
  });
});
