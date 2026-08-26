export const DEEP_MAP_LABEL_MIN_ZOOM = 8;
export const DEEP_MAP_LABEL_MIN_SCREEN_SPAN = 16;
export const DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE = 8;

export interface MapCountryLabelSignals {
  hovered: boolean;
  selected: boolean;
  topTenRealm: boolean;
  humanRealm: boolean;
  warRealm: boolean;
  frontTerritory: boolean;
  integrating: boolean;
  openingMobilisation: boolean;
  projectedSpan: number;
  zoom: number;
}

export type MapCountryLabelTier = 'hover' | 'active' | 'top-ten' | 'deep' | 'hidden';

export interface MapCountryLabelDecision {
  tier: MapCountryLabelTier;
  visible: boolean;
  active: boolean;
  showDetail: boolean;
  collisionProtected: boolean;
  ordinaryDeepLabel: boolean;
}

/**
 * Country names are strategic map information, not a zoom-dependent data dump.
 * The global top ten and live gameplay state stay visible at every zoom. An
 * otherwise quiet country receives a label only while hovered or at genuinely
 * deep zoom, where a separate hard cap is enforced by the placement pass.
 */
export function mapCountryLabelDecision(
  signals: Readonly<MapCountryLabelSignals>,
): MapCountryLabelDecision {
  const active = signals.selected
    || signals.humanRealm
    || signals.warRealm
    || signals.frontTerritory
    || signals.integrating
    || signals.openingMobilisation;
  const deepEligible = signals.zoom >= DEEP_MAP_LABEL_MIN_ZOOM
    && signals.projectedSpan >= DEEP_MAP_LABEL_MIN_SCREEN_SPAN;
  const tier: MapCountryLabelTier = signals.hovered ? 'hover'
    : active ? 'active'
      : signals.topTenRealm ? 'top-ten'
        : deepEligible ? 'deep' : 'hidden';
  const visible = tier !== 'hidden';
  const ordinaryDeepLabel = tier === 'deep';
  return {
    tier,
    visible,
    active,
    showDetail: signals.hovered || active,
    collisionProtected: visible && !ordinaryDeepLabel,
    ordinaryDeepLabel,
  };
}

/** The cap counts only ordinary deep-zoom labels that found collision-free room. */
export function hasDeepMapLabelSlot(visibleOrdinaryDeepLabels: number): boolean {
  return visibleOrdinaryDeepLabels < DEEP_MAP_LABEL_MAX_ORDINARY_VISIBLE;
}
