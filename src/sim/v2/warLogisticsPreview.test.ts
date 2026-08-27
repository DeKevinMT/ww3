import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { nationIdV2, territoryIdV2 } from './types';
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

  it('quotes steadily higher real weekly costs at 2k, 6k and 12k naval range', () => {
    const belgium = nationIdV2('bel');
    const unitedKingdom = nationIdV2('gbr');
    const belgiumTerritory = territoryIdV2('bel');
    const ukTerritory = territoryIdV2('gbr');
    const contentAtDistance = (distanceKm: number): WorldContentV2 => {
      const replaceRoute = (sourceId: typeof belgiumTerritory, targetId: typeof ukTerritory) => {
        const source = WORLD_CONTENT_V2.territories[sourceId]!;
        const withoutTarget = source.connections.filter((edge) => edge.targetId !== targetId);
        return {
          ...source,
          connections: [...withoutTarget, { targetId, kind: 'sea' as const, distanceKm }],
        };
      };
      return {
        ...WORLD_CONTENT_V2,
        territories: {
          ...WORLD_CONTENT_V2.territories,
          [belgiumTerritory]: replaceRoute(belgiumTerritory, ukTerritory),
          [ukTerritory]: replaceRoute(ukTerritory, belgiumTerritory),
        },
      };
    };
    const quote = (distanceKm: number) => {
      const state = createWorldStateV2(9_118_203);
      state.wars = [];
      state.players[belgium]!.treasury = 10_000;
      return previewWarLogisticsV2(
        state,
        contentAtDistance(distanceKm),
        belgium,
        unitedKingdom,
      );
    };

    const regional = quote(2_000);
    const longRange = quote(6_000);
    const pacific = quote(12_000);
    expect(longRange.routeOperationMultiplier).toBeGreaterThan(regional.routeOperationMultiplier);
    expect(pacific.routeOperationMultiplier).toBeGreaterThan(longRange.routeOperationMultiplier);
    expect(longRange.additionalWeeklyWarOperations)
      .toBeGreaterThan(regional.additionalWeeklyWarOperations);
    expect(pacific.additionalWeeklyWarOperations)
      .toBeGreaterThan(longRange.additionalWeeklyWarOperations);
  });
});
