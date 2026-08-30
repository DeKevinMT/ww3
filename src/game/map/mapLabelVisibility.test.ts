import { describe, expect, it } from 'vitest';
import {
  DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE,
  DEEP_MAP_LABEL_MIN_SCREEN_SPAN,
  DEEP_MAP_LABEL_MIN_ZOOM,
  PASSIVE_POWER_LABEL_LIMIT,
  hasDeepMapLabelSlot,
  mapCountryLabelDecision,
  type MapCountryLabelSignals,
} from './mapLabelVisibility';

const quietCountry = (overrides: Partial<MapCountryLabelSignals> = {}): MapCountryLabelSignals => ({
  hovered: false,
  selected: false,
  topPowerRealm: false,
  humanRealm: false,
  warRealm: false,
  frontTerritory: false,
  integrating: false,
  openingMobilisation: false,
  projectedSpan: 120,
  zoom: 1,
  ...overrides,
});

describe('map country label visibility', () => {
  it('limits passive overview namecards to the five strongest powers', () => {
    expect(PASSIVE_POWER_LABEL_LIMIT).toBe(5);
    expect(mapCountryLabelDecision(quietCountry({ zoom: DEEP_MAP_LABEL_MIN_ZOOM - 0.01 })))
      .toMatchObject({ tier: 'hidden', visible: false, showDetail: false });
  });

  it('shows a member of the top-power cohort at every zoom but reserves details for activity', () => {
    expect(mapCountryLabelDecision(quietCountry({ zoom: 0.78, topPowerRealm: true })))
      .toMatchObject({ tier: 'top-power', visible: true, showDetail: false, collisionProtected: true });
  });

  it.each([
    'selected',
    'humanRealm',
    'warRealm',
    'frontTerritory',
    'integrating',
    'openingMobilisation',
  ] as const)('keeps %s labels active and detailed independently of zoom', (signal) => {
    expect(mapCountryLabelDecision(quietCountry({ zoom: 0.78, [signal]: true })))
      .toMatchObject({ tier: 'active', visible: true, active: true, showDetail: true, collisionProtected: true });
  });

  it('shows an ordinary country on hover without promoting it to persistent activity', () => {
    expect(mapCountryLabelDecision(quietCountry({ hovered: true })))
      .toMatchObject({ tier: 'hover', visible: true, active: false, showDetail: true, collisionProtected: true });
  });

  it('drops a label as soon as its live activity signal clears', () => {
    expect(mapCountryLabelDecision(quietCountry({ frontTerritory: true })).visible).toBe(true);
    expect(mapCountryLabelDecision(quietCountry()).visible).toBe(false);
  });

  it('admits ordinary labels only at deep zoom and only for legible landmasses', () => {
    expect(mapCountryLabelDecision(quietCountry({
      zoom: DEEP_MAP_LABEL_MIN_ZOOM,
      projectedSpan: DEEP_MAP_LABEL_MIN_SCREEN_SPAN,
    }))).toMatchObject({ tier: 'deep', visible: true, ordinaryDeepLabel: true, collisionProtected: false });
    expect(mapCountryLabelDecision(quietCountry({
      zoom: DEEP_MAP_LABEL_MIN_ZOOM,
      projectedSpan: DEEP_MAP_LABEL_MIN_SCREEN_SPAN - 0.01,
    })).visible).toBe(false);
  });

  it('hard-caps only the ordinary deep-zoom labels', () => {
    expect(hasDeepMapLabelSlot(DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE - 1)).toBe(true);
    expect(hasDeepMapLabelSlot(DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE)).toBe(false);
    expect(hasDeepMapLabelSlot(DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE + 10)).toBe(false);
  });
});
