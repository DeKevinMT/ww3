import { describe, expect, it } from 'vitest';
import { selectAiResearchAllocationsV2 } from './ai';
import {
  FOOD_COST_GLOBAL_MULTIPLIER,
  FOOD_DOMESTIC_CAPACITY_RAMP_WEEKS,
  FOOD_DOMESTIC_COST_PER_MILLION,
  FOOD_EXPORT_MARKET_PRICE_LEVEL,
  FOOD_EXPORT_PRICE_MULTIPLIER,
  FOOD_IMPORT_COST_PER_MILLION,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceDomesticFoodCapacityV2,
  createFinancePlansV2,
  processFinanceMilitaryV2,
} from './economy';
import {
  createPowerSnapshotV2,
  selectFoodDomesticCapacityTargetV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

const belgium = nationIdV2('bel');
const burundi = nationIdV2('bdi');
const australia = nationIdV2('aus');

describe('V2 funded food transition and trade', () => {
  it('raises the whole food bill modestly while keeping imports materially dearer', () => {
    expect(FOOD_COST_GLOBAL_MULTIPLIER).toBe(1.20);
    expect(FOOD_IMPORT_COST_PER_MILLION * FOOD_COST_GLOBAL_MULTIPLIER)
      .toBeCloseTo(3 * FOOD_DOMESTIC_COST_PER_MILLION * FOOD_COST_GLOBAL_MULTIPLIER, 10);
  });

  it('redirects Development, never Research, into food for a human or rival shortage', () => {
    for (const humanPlayerId of [burundi, belgium]) {
      const state = createWorldStateV2(7_101);
      state.humanPlayerId = humanPlayerId;
      state.players[burundi]!.treasury = 0;
      state.players[burundi]!.foodStock = 0;
      state.players[burundi]!.foodSecurity = 0.30;
      const first = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, burundi);
      // Keep this fixture wholly domestic so the counterfactual coverage can
      // be reconstructed exactly from one unit price.
      state.players[burundi]!.domesticFoodCapacity = first.foodDemand * 2;
      const savedPolicy = { ...state.players[burundi]!.budget };
      const crisis = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, burundi);

      expect(crisis.foodDevelopmentTransfer).toBeGreaterThan(0);
      if (humanPlayerId === burundi) {
        expect(crisis.development).toBe(0);
        expect(crisis.activeBudget.development).toBe(0);
      } else {
        expect(crisis.development).toBeGreaterThan(0);
        expect(crisis.activeBudget.development).toBeGreaterThan(0);
      }
      expect(crisis.research).toBeGreaterThan(0);
      expect(crisis.activeBudget.research).toBeGreaterThan(0);
      expect(crisis.foodImported).toBe(0);
      expect(state.players[burundi]!.budget).toEqual(savedPolicy);

      const domesticUnitCost = crisis.foodProduction / crisis.foodDomesticProduced;
      const ordinaryFunding = crisis.foodProduction - crisis.foodDevelopmentTransfer;
      const coverageWithoutTransfer = ordinaryFunding / domesticUnitCost / crisis.foodDemand;
      expect(crisis.foodCoverage).toBeGreaterThan(coverageWithoutTransfer);
      expect(crisis.expenses).toBeCloseTo(
        crisis.ceasefirePayment + crisis.integrationCost + crisis.foodProduction
          + crisis.military + crisis.research + crisis.development
          + crisis.warOperations + crisis.debtPremium,
        5,
      );
    }
  });

  it('keeps normal Development and Research funded once food and reserves are safe', () => {
    const state = createWorldStateV2(7_102);
    const opening = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.foodStock = opening.foodStorageCapacity;
    state.players[belgium]!.foodSecurity = 1;
    const healthy = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(healthy.foodDevelopmentTransfer).toBe(0);
    expect(healthy.development).toBeGreaterThan(0);
    expect(healthy.research).toBeGreaterThan(0);
    expect(healthy.activeBudget.development).toBeGreaterThan(0);
  });

  it('uses funded research to focus existing food-recovery programs', () => {
    const healthy = createWorldStateV2(7_103);
    const crisis = structuredClone(healthy);
    healthy.players[burundi]!.foodSecurity = 1;
    healthy.players[burundi]!.foodStock = selectWeeklyFinanceBreakdownV2(
      healthy,
      WORLD_CONTENT_V2,
      burundi,
    ).foodStorageCapacity;
    crisis.players[burundi]!.foodSecurity = 0.30;
    crisis.players[burundi]!.foodStock = 0;
    const healthyAllocations = selectAiResearchAllocationsV2(
      healthy,
      WORLD_CONTENT_V2,
      burundi,
      createPowerSnapshotV2(healthy, WORLD_CONTENT_V2),
    );
    const crisisAllocations = selectAiResearchAllocationsV2(
      crisis,
      WORLD_CONTENT_V2,
      burundi,
      createPowerSnapshotV2(crisis, WORLD_CONTENT_V2),
    );
    expect(crisisAllocations['logistics-medicine'])
      .toBeGreaterThan(healthyAllocations['logistics-medicine']);
    expect(crisisAllocations['economy-science'] + crisisAllocations['logistics-medicine'])
      .toBeGreaterThan(
        healthyAllocations['economy-science'] + healthyAllocations['logistics-medicine'] + 15,
      );
  });

  it('ramps canonical domestic capacity over years and lets imports fill the immediate gap', () => {
    const state = createWorldStateV2(7_104);
    const openingTarget = selectFoodDomesticCapacityTargetV2(state, WORLD_CONTENT_V2, belgium);
    expect(state.players[belgium]!.domesticFoodCapacity).toBeCloseTo(openingTarget, 8);

    state.territories[territoryIdV2('bel')]!.population *= 2;
    const current = state.players[belgium]!.domesticFoodCapacity;
    const raisedTarget = selectFoodDomesticCapacityTargetV2(state, WORLD_CONTENT_V2, belgium);
    expect(raisedTarget).toBeGreaterThan(current);
    const expected = advanceDomesticFoodCapacityV2(current, raisedTarget);
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(state.players[belgium]!.domesticFoodCapacity).toBe(expected);
    expect(state.players[belgium]!.domesticFoodCapacity).toBeLessThan(raisedTarget);
    expect(state.players[belgium]!.domesticFoodCapacity - current)
      .toBeLessThanOrEqual(raisedTarget / FOOD_DOMESTIC_CAPACITY_RAMP_WEEKS + 0.000000001);

    const importState = createWorldStateV2(7_105);
    importState.players[belgium]!.domesticFoodCapacity = 0;
    importState.players[belgium]!.foodStock = 0;
    importState.players[belgium]!.foodSecurity = 0.30;
    const imported = selectWeeklyFinanceBreakdownV2(importState, WORLD_CONTENT_V2, belgium);
    expect(imported.foodDomesticProduced).toBe(0);
    expect(imported.foodImported).toBeGreaterThan(0);
    expect(imported.foodCoverage).toBeGreaterThan(0);
  });

  it('sustains calibrated agricultural exports across weeks without selling imports or reserves', () => {
    const state = createWorldStateV2(7_106);
    let finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, australia);
    state.players[australia]!.foodStock = finance.foodStorageCapacity;
    for (let week = 0; week < 4; week += 1) {
      finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, australia);
      expect(finance.foodExported).toBeGreaterThan(0);
      expect(finance.foodImported).toBe(0);
      expect(finance.foodExported).toBeCloseTo(
        finance.foodDomesticProduced - finance.foodDemand,
        5,
      );
      expect(finance.foodStockChange).toBeCloseTo(0, 6);
      expect(finance.foodExportIncome).toBeGreaterThan(0);
      const exportUnitPrice = FOOD_DOMESTIC_COST_PER_MILLION
        * FOOD_COST_GLOBAL_MULTIPLIER
        * FOOD_EXPORT_MARKET_PRICE_LEVEL
        * FOOD_EXPORT_PRICE_MULTIPLIER;
      expect(finance.foodExportIncome / finance.foodExported)
        .toBeCloseTo(exportUnitPrice, 6);
      // FAOSTAT-calibrated exporters can sustain far more than the old 20%
      // surplus cap, but the fixed market receipt still cannot refund the
      // exporter's complete domestic food bill.
      expect(finance.foodExportIncome).toBeLessThan(finance.foodProduction);
      expect(finance.net).toBeCloseTo(
        finance.revenue + finance.ceasefireIncome + finance.foodExportIncome - finance.expenses,
        5,
      );
      processFinanceMilitaryV2(
        state,
        WORLD_CONTENT_V2,
        createFinancePlansV2(state, WORLD_CONTENT_V2),
      );
      state.tick += 1;
    }

    const belowCap = createWorldStateV2(7_107);
    const full = selectWeeklyFinanceBreakdownV2(belowCap, WORLD_CONTENT_V2, australia);
    belowCap.players[australia]!.foodStock = Math.max(
      0,
      full.foodStorageCapacity - full.foodDemand,
    );
    const storing = selectWeeklyFinanceBreakdownV2(belowCap, WORLD_CONTENT_V2, australia);
    expect(storing.foodStockChange).toBeCloseTo(full.foodDemand, 5);
    expect(storing.foodExported).toBeCloseTo(
      Math.max(0, storing.foodDomesticProduced - storing.foodDemand - full.foodDemand),
      5,
    );

    const importOnly = createWorldStateV2(7_108);
    const importPreview = selectWeeklyFinanceBreakdownV2(importOnly, WORLD_CONTENT_V2, belgium);
    importOnly.players[belgium]!.domesticFoodCapacity = 0;
    importOnly.players[belgium]!.foodStock = importPreview.foodStorageCapacity;
    const imports = selectWeeklyFinanceBreakdownV2(importOnly, WORLD_CONTENT_V2, belgium);
    expect(imports.foodImported).toBeGreaterThan(0);
    expect(imports.foodDomesticProduced).toBe(0);
    expect(imports.foodExported).toBe(0);
    expect(imports.foodExportIncome).toBe(0);

    const efficientState = createWorldStateV2(7_109);
    const efficientExporter = WORLD_CONTENT_V2.nationIds.map((id) => {
      const preview = selectWeeklyFinanceBreakdownV2(efficientState, WORLD_CONTENT_V2, id);
      efficientState.players[id]!.foodStock = preview.foodStorageCapacity;
      const plan = selectWeeklyFinanceBreakdownV2(efficientState, WORLD_CONTENT_V2, id);
      const domesticUnitCost = plan.foodDomesticProduced > 0
        ? plan.foodProduction / plan.foodDomesticProduced : Number.POSITIVE_INFINITY;
      const exportUnitPrice = plan.foodExported > 0
        ? plan.foodExportIncome / plan.foodExported : 0;
      return { plan, domesticUnitCost, exportUnitPrice };
    }).find(({ plan, domesticUnitCost, exportUnitPrice }) => (
      plan.foodExported > 0 && exportUnitPrice > domesticUnitCost
    ));
    expect(efficientExporter).toBeDefined();
    expect(efficientExporter!.exportUnitPrice - efficientExporter!.domesticUnitCost)
      .toBeGreaterThan(0);
  });
});
