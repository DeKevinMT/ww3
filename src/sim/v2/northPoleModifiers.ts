import type { PlayerId, WorldStateV2 } from './types';

export interface NorthPoleModifiersV2 {
  researchOutputMultiplier: number;
  supplyThroughputMultiplier: number;
  signalPurgeDurationMultiplier: number;
  recoveryMultiplier: number;
  attackVsRogueMultiplier: number;
  defenseVsRogueMultiplier: number;
  antarcticSupplyMultiplier: number;
  antarcticOperationMultiplier: number;
  rogueWarningLeadTicks: number;
  primeTracking: boolean;
}

/** Exact, derived-only investigation effects; nothing leaks into account meta. */
export function selectNorthPoleModifiersV2(
  state: WorldStateV2,
  playerId: PlayerId,
): NorthPoleModifiersV2 {
  const complete = new Set(
    state.polarEndgame.arcticPrograms[playerId]?.completedProjects ?? [],
  );
  const researchBonus = (complete.has('polar-demography') ? 0.001 : 0)
    + (complete.has('baseline-calibration') ? 0.0015 : 0);
  const supplyBonus = (complete.has('polar-relay-mesh') ? 0.0025 : 0)
    + (complete.has('anomaly-filtering') ? 0.0025 : 0);
  const purgeReduction = (complete.has('neural-signature-map') ? 0.02 : 0)
    + (complete.has('command-verification') ? 0.02 : 0)
    + (complete.has('cryogenic-logistics') ? 0.04 : 0);
  const recoveryBonus = (complete.has('recovery-routing') ? 0.01 : 0)
    + (complete.has('cryogenic-logistics') ? 0.01 : 0);
  const rogueAttackBonus = (complete.has('rogue-ballistics') ? 0.02 : 0)
    + (complete.has('strategic-mobilisation') ? 0.02 : 0);
  const rogueDefenseBonus = (complete.has('cryogenic-logistics') ? 0.02 : 0)
    + (complete.has('predictive-defense') ? 0.02 : 0)
    + (complete.has('strategic-mobilisation') ? 0.02 : 0);
  const antarcticSupplyBonus = (complete.has('polar-supply-model') ? 0.04 : 0)
    + (complete.has('ice-theatre-simulation') ? 0.04 : 0);
  const antarcticOperationBonus = (complete.has('ice-theatre-simulation') ? 0.025 : 0)
    + (complete.has('deep-ice-signals') ? 0.025 : 0);
  return {
    researchOutputMultiplier: 1 + researchBonus,
    supplyThroughputMultiplier: 1 + supplyBonus,
    signalPurgeDurationMultiplier: 1 - purgeReduction,
    recoveryMultiplier: 1 + recoveryBonus,
    attackVsRogueMultiplier: 1 + rogueAttackBonus,
    defenseVsRogueMultiplier: 1 + rogueDefenseBonus,
    antarcticSupplyMultiplier: 1 + antarcticSupplyBonus,
    antarcticOperationMultiplier: 1 + antarcticOperationBonus,
    rogueWarningLeadTicks: complete.has('polar-demography') ? 1 : 0,
    primeTracking: complete.has('deep-ice-signals'),
  };
}
