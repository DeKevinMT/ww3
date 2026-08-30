import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  initializeCommanderForceV2,
  reconcileCoopApexClaimsV2,
  selectApexTerritoryClaimOwnerV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type CommanderFrontAssignmentV2,
} from './types';

const ACCOUNT_APEX: CommanderForceInitializationV2 = {
  manpower: 0.00048,
  capacity: 0.0009,
  trainedReserves: 0.00008,
  baseAttack: 125,
  baseDefense: 125,
  treasury: 0,
  annualOutput: 0.015,
  supplyStock: 0.006,
};

function twoSeatApex(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const belgium = nationIdV2('bel');
  const netherlands = nationIdV2('nld');
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium, netherlands];
  expect(initializeCommanderForceV2(
    state, WORLD_CONTENT_V2, belgium, ACCOUNT_APEX,
  )).toEqual({ accepted: true });
  expect(initializeCommanderForceV2(
    state, WORLD_CONTENT_V2, netherlands, ACCOUNT_APEX,
  )).toEqual({ accepted: true });
  return { state, belgium, netherlands };
}

describe('co-op APEX claim invariant', () => {
  it('deploys one independent APEX per human seat on distinct territories', () => {
    const { state, belgium, netherlands } = twoSeatApex(97_001);
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');

    expect(state.commanderForces[belgium]?.locationId).toBe(bel);
    expect(state.commanderForces[netherlands]?.locationId).toBe(nld);
    expect(selectApexTerritoryClaimOwnerV2(state, bel)).toBe(belgium);
    expect(selectApexTerritoryClaimOwnerV2(state, nld)).toBe(netherlands);
    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('repairs a duplicate arrival deterministically and remains stable after reconnect reconciliation', () => {
    const { state, belgium, netherlands } = twoSeatApex(97_002);
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    state.commanderForces[netherlands]!.transit = {
      path: [nld, bel],
      edgeProgress: 0.9,
      routeProgress: 0.45,
      access: 'land',
    };

    expect(reconcileCoopApexClaimsV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(state.commanderForces[belgium]?.locationId).toBe(bel);
    expect(state.commanderForces[netherlands]).toMatchObject({
      locationId: nld,
      transit: null,
      mission: 'standby',
    });
    expect(selectApexTerritoryClaimOwnerV2(state, bel)).toBe(belgium);
    expect(selectApexTerritoryClaimOwnerV2(state, nld)).toBe(netherlands);
    expect(reconcileCoopApexClaimsV2(state, WORLD_CONTENT_V2)).toBe(false);
    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('never stacks two domes on one canonical front', () => {
    const { state, belgium, netherlands } = twoSeatApex(97_003);
    const sharedFront: CommanderFrontAssignmentV2 = {
      warId: 'coop-front',
      sourceId: territoryIdV2('bel'),
      targetId: territoryIdV2('deu'),
    };
    state.commanderForces[belgium]!.front = { ...sharedFront };
    state.commanderForces[belgium]!.mission = 'assault-support';
    state.commanderForces[netherlands]!.front = { ...sharedFront };
    state.commanderForces[netherlands]!.mission = 'assault-support';

    expect(reconcileCoopApexClaimsV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(state.commanderForces[belgium]?.front).toEqual(sharedFront);
    expect(state.commanderForces[netherlands]).toMatchObject({
      front: null,
      mission: 'standby',
    });
    const assigned = Object.values(state.commanderForces)
      .filter((force) => force.front?.warId === sharedFront.warId);
    expect(assigned).toHaveLength(1);
  });
});
