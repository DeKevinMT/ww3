export interface ForcePresentationSets {
  moved: ReadonlySet<string>;
  active: ReadonlySet<string>;
  strongest: ReadonlySet<string>;
}

const stableSetSignature = (values: ReadonlySet<string>): string => (
  [...values].sort((left, right) => left.localeCompare(right)).join(',')
);

/** Order-independent identity for the three sets that control local-force HUD visibility. */
export function forcePresentationSignature(sets: ForcePresentationSets): string {
  return [sets.moved, sets.active, sets.strongest].map(stableSetSignature).join('|');
}

export function compactMapCombatPower(power: number): string {
  const value = Math.max(0, power);
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

/** One map-tag line: no ATK/DEF noise, just one prominent comparable value. */
export function mapCombatPowerLabel(power: number, controllerLabel = ''): string {
  const prefix = controllerLabel ? `${controllerLabel} · ` : '';
  return `${prefix}⚔ ${compactMapCombatPower(power)}`;
}
