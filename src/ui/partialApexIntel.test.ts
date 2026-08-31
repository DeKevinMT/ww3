import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';
import { resolveApexTerritoryIntelModeV2 } from './partialApexIntel';

describe('open country information', () => {
  it('never redacts country information because of fog, reach or account unlock state', () => {
    const visibilityInputs = [
      { fogEnabled: false, exactIntelVisible: true, mapClear: true, accountCharted: false },
      { fogEnabled: true, exactIntelVisible: true, mapClear: false, accountCharted: false },
      { fogEnabled: true, exactIntelVisible: false, mapClear: false, accountCharted: true },
      { fogEnabled: true, exactIntelVisible: false, mapClear: false, accountCharted: false },
    ];
    for (const input of visibilityInputs) {
      expect(resolveApexTerritoryIntelModeV2(input)).toBe('full');
    }
  });

  it('keeps exact power, army and economy in the normal country UI', () => {
    expect(worldUiSource).not.toContain('PARTIAL EONSCAR INTEL');
    expect(worldUiSource).not.toContain('LIVE SIGNAL UNAVAILABLE');
    expect(worldUiSource).not.toContain('NO VERIFIED SIGNAL');
    expect(worldUiSource).not.toContain('ALL LIVE STATS · UNVERIFIED');
    expect(worldUiSource).toContain('this.engine.territoryPower(territoryId)');
    expect(worldUiSource).toContain('territory.army.manpower');
    expect(worldUiSource).toContain('territory.economy');
  });
});
