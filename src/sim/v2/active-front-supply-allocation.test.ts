import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { redistributeArmiesV2 } from './war';

const BEL = nationIdV2('bel');
const DEU = nationIdV2('deu');
const BELGIUM = territoryIdV2('bel');
const NETHERLANDS = territoryIdV2('nld');
const BRITAIN = territoryIdV2('gbr');
const GERMANY = territoryIdV2('deu');

function operation(
  sourceId: TerritoryId,
  access: 'land' | 'naval',
): FrontOperationV2 {
  return {
    commanderId: BEL,
    sourceId,
    targetId: GERMANY,
    doctrine: 'balanced',
    access,
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function supplyState(includeNavalFront: boolean): {
  state: WorldStateV2;
  war: WarStateV2;
} {
  const state = createWorldStateV2(89_401 + Number(includeNavalFront));
  state.humanPlayerId = BEL;
  state.humanPlayerIds = [BEL];
  state.wars = [];
  state.players[BEL]!.treasury = 1_000_000;

  const owned = [NETHERLANDS, ...(includeNavalFront ? [BRITAIN] : [])];
  for (const territoryId of owned) {
    const territory = state.territories[territoryId]!;
    territory.owner = BEL;
    territory.coreOwner = BEL;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  // Make the two fronts deeper than the donor pool so the test measures
  // allocation and garrison policy rather than a tiny front filling early.
  state.territories[BELGIUM]!.population *= 100;
  if (includeNavalFront) state.territories[BRITAIN]!.population *= 100;
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

  const donor = state.territories[NETHERLANDS]!.army;
  donor.manpower = donor.capacity;
  state.territories[BELGIUM]!.army.manpower = 0;
  if (includeNavalFront) state.territories[BRITAIN]!.army.manpower = 0;

  const operations = [
    operation(BELGIUM, 'land'),
    ...(includeNavalFront ? [operation(BRITAIN, 'naval')] : []),
  ];
  const war: WarStateV2 = {
    id: 'active-front-supply-allocation',
    attackerId: BEL,
    defenderId: DEU,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000,
    attackerOperations: operations,
    defenderOperations: [],
    revenge: null,
  };
  state.wars = [war];
  return { state, war };
}

describe('active-front supply allocation', () => {
  it('keeps a stable ten-percent capacity home garrison during ordinary support', () => {
    const { state } = supplyState(false);
    const donor = state.territories[NETHERLANDS]!.army;
    const floor = donor.capacity * 0.10;
    for (let week = 0; week < 30; week += 1) {
      redistributeArmiesV2(state, WORLD_CONTENT_V2);
      state.tick += 1;
    }

    expect(donor.manpower).toBeCloseTo(floor, 8);
    const stopped = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.sourceId === NETHERLANDS);
    expect(stopped).toHaveLength(0);
  });

  it('releases the final garrison only gradually for a demonstrably losing front', () => {
    const { state, war } = supplyState(false);
    const donor = state.territories[NETHERLANDS]!.army;
    const floor = donor.capacity * 0.10;
    for (let week = 0; week < 30; week += 1) {
      redistributeArmiesV2(state, WORLD_CONTENT_V2);
      state.tick += 1;
    }
    expect(donor.manpower).toBeCloseTo(floor, 8);

    war.attackerOperations[0]!.momentum = -0.5;
    for (let week = 0; week < 3; week += 1) {
      const before = donor.manpower;
      redistributeArmiesV2(state, WORLD_CONTENT_V2);
      state.tick += 1;
      const released = before - donor.manpower;
      expect(released).toBeGreaterThan(0);
      expect(released).toBeLessThanOrEqual(donor.capacity * 0.010000001);
    }
    expect(donor.manpower).toBeLessThan(floor);
    expect(donor.manpower).toBeGreaterThanOrEqual(floor - donor.capacity * 0.030000001);
  });

  it('feeds simultaneous land and naval deficits instead of binding the donor forever', () => {
    const { state } = supplyState(true);
    expect(WORLD_CONTENT_V2.territories[NETHERLANDS]!.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: BELGIUM, kind: 'land' }),
        expect.objectContaining({ targetId: BRITAIN, kind: 'sea' }),
      ]),
    );
    const donor = state.territories[NETHERLANDS]!.army;
    const floor = donor.capacity * 0.10;
    let landMoved = 0;
    let navalMoved = 0;
    for (let week = 0; week < 18; week += 1) {
      const movements = redistributeArmiesV2(state, WORLD_CONTENT_V2)
        .filter((movement) => movement.sourceId === NETHERLANDS);
      landMoved += movements
        .filter((movement) => movement.targetId === BELGIUM && movement.access === 'land')
        .reduce((sum, movement) => sum + movement.manpower, 0);
      navalMoved += movements
        .filter((movement) => movement.targetId === BRITAIN && movement.access === 'naval')
        .reduce((sum, movement) => sum + movement.manpower, 0);
      state.tick += 1;
    }

    expect(landMoved).toBeGreaterThan(0);
    expect(navalMoved).toBeGreaterThan(0);
    expect(donor.manpower).toBeGreaterThanOrEqual(floor - 1e-8);
  });
});
