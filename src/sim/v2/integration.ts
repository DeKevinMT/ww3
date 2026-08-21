import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  CONQUEST_INTEGRATION_MAX_YEARS,
  CONQUEST_INTEGRATION_MIN_YEARS,
  WEEKS_PER_YEAR,
  clamp,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import type { TerritoryId } from './types';

interface SizeAxesV2 {
  population: number;
  economy: number;
  area: number;
}

const sizeBoundsCache = new WeakMap<WorldContentV2, { min: SizeAxesV2; max: SizeAxesV2 }>();

function logarithmicSize(value: number): number {
  return Math.log1p(Math.max(0, value));
}

function sizeBoundsV2(content: WorldContentV2): { min: SizeAxesV2; max: SizeAxesV2 } {
  const cached = sizeBoundsCache.get(content);
  if (cached) return cached;
  const axes = content.territoryIds.map((id) => {
    const baseline = content.territories[id]?.baseline;
    return {
      population: logarithmicSize(baseline?.population ?? 0),
      economy: logarithmicSize(baseline?.gdp ?? 0),
      area: logarithmicSize(baseline?.landArea ?? 0),
    };
  });
  const bounds = {
    min: {
      population: Math.min(...axes.map((item) => item.population)),
      economy: Math.min(...axes.map((item) => item.economy)),
      area: Math.min(...axes.map((item) => item.area)),
    },
    max: {
      population: Math.max(...axes.map((item) => item.population)),
      economy: Math.max(...axes.map((item) => item.economy)),
      area: Math.max(...axes.map((item) => item.area)),
    },
  };
  sizeBoundsCache.set(content, bounds);
  return bounds;
}

function normalizeAxis(value: number, min: number, max: number): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/**
 * Immutable country size used by the integration calendar. Live war damage,
 * growth and ownership never shorten or lengthen a conquest after the fact.
 */
export function territoryIntegrationSizeV2(content: WorldContentV2, territoryId: TerritoryId): number {
  const baseline = content.territories[territoryId]?.baseline;
  if (!baseline) return 0;
  const bounds = sizeBoundsV2(content);
  const population = normalizeAxis(
    logarithmicSize(baseline.population), bounds.min.population, bounds.max.population,
  );
  const economy = normalizeAxis(
    logarithmicSize(baseline.gdp), bounds.min.economy, bounds.max.economy,
  );
  const area = normalizeAxis(
    logarithmicSize(baseline.landArea), bounds.min.area, bounds.max.area,
  );
  return round(0.50 * population + 0.30 * economy + 0.20 * area, 12);
}

export function territoryIntegrationDurationWeeksV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  const years = CONQUEST_INTEGRATION_MIN_YEARS
    + (CONQUEST_INTEGRATION_MAX_YEARS - CONQUEST_INTEGRATION_MIN_YEARS)
      * territoryIntegrationSizeV2(content, territoryId);
  return Math.round(years * WEEKS_PER_YEAR);
}

export function territoryIntegrationGainPerWeekV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  return (1 - CONQUEST_INITIAL_INTEGRATION_SHARE)
    / territoryIntegrationDurationWeeksV2(content, territoryId);
}

/** Canonical calendar-only integration step, shared by simulation and tests. */
export function advanceTerritoryIntegrationV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  currentShare: number,
  weeks = 1,
): number {
  return round(clamp(
    currentShare + territoryIntegrationGainPerWeekV2(content, territoryId) * Math.max(0, weeks),
    0,
    1,
  ), 12);
}
