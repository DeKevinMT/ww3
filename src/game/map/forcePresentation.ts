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
