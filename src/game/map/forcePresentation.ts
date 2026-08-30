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

export interface CommanderShieldSupportSource {
  readonly integrity: number;
  readonly maxIntegrity: number;
  readonly attackMultiplier: number;
  readonly defenseMultiplier: number;
}

/**
 * APEX is not an army and therefore never contributes an independent map power
 * value. This adapter exposes the average national-army bonus while the shield
 * has integrity, which keeps nameplates truthful and directly comparable.
 */
export function commanderShieldMapSupportPercent(
  shield: CommanderShieldSupportSource,
): number {
  const integrity = Number.isFinite(shield.integrity) ? Math.max(0, shield.integrity) : 0;
  const maxIntegrity = Number.isFinite(shield.maxIntegrity)
    ? Math.max(0, shield.maxIntegrity) : 0;
  if (integrity <= 0 || maxIntegrity <= 0) return 0;
  const attackBonus = Math.max(0, (Number.isFinite(shield.attackMultiplier)
    ? shield.attackMultiplier : 1) - 1);
  const defenseBonus = Math.max(0, (Number.isFinite(shield.defenseMultiplier)
    ? shield.defenseMultiplier : 1) - 1);
  return Math.round((0.55 * attackBonus + 0.45 * defenseBonus) * 100_000) / 1_000;
}

/** One map-tag line: no ATK/DEF noise, just one prominent comparable value. */
export function mapCombatPowerLabel(power: number, controllerLabel = ''): string {
  const prefix = controllerLabel ? `${controllerLabel} · ` : '';
  return `${prefix}⚔ ${compactMapCombatPower(power)}`;
}
