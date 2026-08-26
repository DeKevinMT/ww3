import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { nationIdV2 } from './types';
import { previewWarLogisticsV2 } from './warLogisticsPreview';

describe('attack review logistics preview', () => {
  it('quotes a naval campaign through the real declaration and finance models', () => {
    const state = createWorldStateV2(9_118_201);
    state.wars = [];
    const belgium = nationIdV2('bel');
    const unitedKingdom = nationIdV2('gbr');
    state.players[belgium]!.treasury = 10_000;

    const preview = previewWarLogisticsV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      unitedKingdom,
    );

    expect(preview.access).toBe('naval');
    expect(preview.distanceKm).toBeGreaterThan(0);
    expect(preview.mobilizationCost).toBe(0);
    expect(preview.routeOperationMultiplier).toBeGreaterThanOrEqual(1.35);
    expect(preview.routeOperationMultiplier).toBeLessThanOrEqual(2.15);
    expect(preview.routeSupplyMultiplier).toBeLessThanOrEqual(0.98);
    expect(preview.routeSupplyMultiplier).toBeGreaterThanOrEqual(0.90);
    expect(preview.projectedWeeklyWarOperations).toBeGreaterThan(
      preview.currentWeeklyWarOperations,
    );
    expect(preview.additionalWeeklyWarOperations).toBeGreaterThan(0);
    expect(preview.campaignsBefore).toBe(0);
    expect(preview.campaignsAfter).toBe(1);
    expect(state.wars).toHaveLength(0);
  });

  it('keeps land previews free of naval distance pressure', () => {
    const state = createWorldStateV2(9_118_202);
    state.wars = [];
    const preview = previewWarLogisticsV2(
      state,
      WORLD_CONTENT_V2,
      nationIdV2('bel'),
      nationIdV2('nld'),
    );

    expect(preview.access).toBe('land');
    expect(preview.distanceKm).toBeUndefined();
    expect(preview.routeOperationMultiplier).toBe(1);
    expect(preview.routeSupplyMultiplier).toBe(1);
    expect(preview.routeDistancePressure).toBe(0);
    expect(preview.projectedWeeklyWarOperations).toBeGreaterThan(
      preview.currentWeeklyWarOperations,
    );
    expect(preview.additionalWeeklyWarOperations).toBeGreaterThan(0);
    expect(preview.campaignsBefore).toBe(0);
    expect(preview.campaignsAfter).toBe(1);
    expect(state.wars).toHaveLength(0);
  });
});
