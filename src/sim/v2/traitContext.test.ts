import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  composeTraitContextV2,
  isTraitHomelandV2,
  traitContextForTerritoryOwnerV2,
  traitNationContextV2,
  traitOperationContextV2,
  traitTerritoryContextV2,
  traitWarContextV2,
} from './traitContext';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarAccessV2,
  type WarStateV2,
} from './types';

const bel = nationIdV2('bel');
const deu = nationIdV2('deu');
const nld = nationIdV2('nld');
const belTerritory = territoryIdV2('bel');
const deuTerritory = territoryIdV2('deu');
const nldTerritory = territoryIdV2('nld');

const operation = (
  commanderId: typeof bel,
  sourceId: typeof belTerritory,
  targetId: typeof belTerritory,
  access: Exclude<WarAccessV2, 'none'>,
): FrontOperationV2 => ({
  commanderId,
  sourceId,
  targetId,
  doctrine: 'pressure',
  access,
  startedTick: 1,
  lastBattleTick: 1,
  holdUntilTick: 1,
  momentum: 0,
});

const war = (
  attackerOperations: FrontOperationV2[] = [],
  defenderOperations: FrontOperationV2[] = [],
): WarStateV2 => ({
  id: 'trait-context-war',
  attackerId: nld,
  defenderId: bel,
  startedTick: 1,
  lastBattleTick: 1,
  warScore: 0,
  battles: 0,
  attackerLosses: 0,
  defenderLosses: 0,
  lastPeaceOfferTick: 0,
  attackerOperations,
  defenderOperations,
});

describe('V2 trait hook context', () => {
  it('marks every configured multiplayer human seat without marking AI countries', () => {
    const state = createWorldStateV2(81_000);
    state.humanPlayerId = bel;
    state.humanPlayerIds = [bel, nld].sort((left, right) => left.localeCompare(right));

    expect(traitNationContextV2(state, bel).humanControlled).toBe(true);
    expect(traitNationContextV2(state, nld).humanControlled).toBe(true);
    expect(traitNationContextV2(state, deu).humanControlled).toBe(false);
  });

  it('keeps homeland tied to immutable opening ownership after conquest and integration', () => {
    const state = createWorldStateV2(81_001);
    state.wars = [];
    state.territories[belTerritory].owner = nld;
    state.territories[belTerritory].coreOwner = nld;
    state.territories[belTerritory].integration = 1;
    delete state.territories[belTerritory].integrationProgram;

    expect(isTraitHomelandV2(WORLD_CONTENT_V2, nld, belTerritory)).toBe(false);
    expect(traitTerritoryContextV2(state, WORLD_CONTENT_V2, nld, belTerritory))
      .toMatchObject({
        terrain: WORLD_CONTENT_V2.territories[belTerritory].terrain,
        homeland: false,
      });

    const ownerHook = traitContextForTerritoryOwnerV2(
      state, WORLD_CONTENT_V2, belTerritory,
    );
    expect(ownerHook?.playerId).toBe(nld);
    expect(ownerHook?.context.homeland).toBe(false);
    expect(Object.isFrozen(ownerHook)).toBe(true);
    expect(Object.isFrozen(ownerHook?.context)).toBe(true);

    // Opening identity stays immutable even while the original territory is occupied.
    state.territories[nldTerritory].owner = bel;
    state.territories[nldTerritory].coreOwner = bel;
    expect(isTraitHomelandV2(WORLD_CONTENT_V2, nld, nldTerritory)).toBe(true);
    expect(traitContextForTerritoryOwnerV2(state, WORLD_CONTENT_V2, nldTerritory))
      .toMatchObject({ playerId: bel, context: { homeland: false } });
  });

  it('never inherits national context or trait identity from an absorbed country', () => {
    const state = createWorldStateV2(81_002);
    state.wars = [];
    state.players[nld].treasury = 12.5;
    state.players[nld].foodSecurity = 0.87;
    state.players[bel].treasury = 9_999;
    state.players[bel].foodSecurity = 0.11;

    // A conquered territory still has Belgium as sovereign core until integration.
    state.territories[belTerritory].owner = nld;
    state.territories[belTerritory].coreOwner = bel;
    state.territories[belTerritory].integration = 0.5;

    // Belgium's separate live land war must not leak into the Dutch empire context.
    const belgianLandOperation = operation(bel, belTerritory, deuTerritory, 'land');
    state.wars = [{
      ...war([belgianLandOperation]),
      attackerId: bel,
      defenderId: deu,
    }];

    const occupied = traitContextForTerritoryOwnerV2(
      state, WORLD_CONTENT_V2, belTerritory,
    );
    expect(occupied).toMatchObject({
      playerId: nld,
      context: {
        treasury: 12.5,
        foodSecurity: 0.87,
        atWar: false,
        hasLandFront: false,
        bothFronts: false,
        homeland: false,
      },
    });

    // Completing integration/fusion still does not transfer Belgium's context.
    state.territories[belTerritory].coreOwner = nld;
    state.territories[belTerritory].integration = 1;
    expect(traitContextForTerritoryOwnerV2(state, WORLD_CONTENT_V2, belTerritory))
      .toMatchObject({
        playerId: nld,
        context: { treasury: 12.5, foodSecurity: 0.87, atWar: false, homeland: false },
      });
  });

  it('derives land, naval and both-front flags from live operations', () => {
    const state = createWorldStateV2(81_003);
    const land = operation(nld, nldTerritory, belTerritory, 'land');
    const naval = operation(nld, nldTerritory, belTerritory, 'naval');
    const belgianLand = operation(bel, belTerritory, nldTerritory, 'land');
    const belgianNaval = operation(bel, belTerritory, nldTerritory, 'naval');
    const activeWar = war([land, naval], [belgianLand, belgianNaval]);
    state.wars = [activeWar];

    expect(traitNationContextV2(state, nld)).toMatchObject({
      atWar: true,
      hasLandFront: true,
      bothFronts: true,
    });
    expect(traitNationContextV2(state, bel)).toMatchObject({
      atWar: true,
      hasLandFront: true,
      bothFronts: true,
    });
    expect(traitWarContextV2(activeWar, nld)).toMatchObject({
      role: 'attacker',
      bothFronts: true,
    });
    expect(traitWarContextV2(activeWar, nld).access).toBeUndefined();

    activeWar.attackerOperations = [land];
    expect(traitNationContextV2(state, nld)).toMatchObject({
      hasLandFront: true,
      bothFronts: false,
    });
    expect(traitWarContextV2(activeWar, nld).access).toBe('land');

    activeWar.attackerOperations = [
      operation(nld, nldTerritory, belTerritory, 'naval'),
    ];
    expect(traitNationContextV2(state, nld)).toMatchObject({
      hasLandFront: false,
      bothFronts: false,
    });
    expect(traitWarContextV2(activeWar, nld).access).toBe('naval');
  });

  it('does not activate front flags from opponent-only access', () => {
    const state = createWorldStateV2(81_005);
    const ownNaval = operation(nld, nldTerritory, belTerritory, 'naval');
    const opponentLand = operation(bel, belTerritory, nldTerritory, 'land');
    const activeWar = war([ownNaval], [opponentLand]);
    state.wars = [activeWar];

    expect(traitNationContextV2(state, nld)).toMatchObject({
      atWar: true,
      hasLandFront: false,
      bothFronts: false,
    });
    expect(traitWarContextV2(activeWar, nld)).toMatchObject({
      access: 'naval',
      hasLandFront: false,
      bothFronts: false,
    });
    expect(traitNationContextV2(state, bel)).toMatchObject({
      atWar: true,
      hasLandFront: true,
      bothFronts: false,
    });
    expect(traitWarContextV2(activeWar, bel)).toMatchObject({
      access: 'land',
      hasLandFront: true,
      bothFronts: false,
    });
  });

  it('uses local operation role and the correct actor territory during counteroffensives', () => {
    const state = createWorldStateV2(81_004);
    state.wars = [];
    const counteroffensive = operation(bel, belTerritory, nldTerritory, 'naval');
    const activeWar = war([], [counteroffensive]);
    state.wars = [activeWar];

    // Belgium is the formal defender, but locally attacks from Belgian homeland.
    expect(traitOperationContextV2(
      state, WORLD_CONTENT_V2, activeWar, counteroffensive, bel,
    )).toMatchObject({
      atWar: true,
      role: 'attacker',
      access: 'naval',
      terrain: WORLD_CONTENT_V2.territories[belTerritory].terrain,
      homeland: true,
    });

    // The Netherlands is the formal attacker, but locally defends Dutch homeland.
    expect(traitOperationContextV2(
      state, WORLD_CONTENT_V2, activeWar, counteroffensive, nld,
    )).toMatchObject({
      atWar: true,
      role: 'defender',
      access: 'naval',
      terrain: WORLD_CONTENT_V2.territories[nldTerritory].terrain,
      homeland: true,
    });
  });

  it('composes deterministically without mutating or erasing concrete inputs', () => {
    const nation = Object.freeze({ atWar: false, treasury: 0, hasLandFront: false });
    const local = Object.freeze({ atWar: true, role: 'attacker' as const, access: undefined });
    const context = composeTraitContextV2(nation, local, { access: 'land' });

    expect(context).toEqual({
      atWar: true,
      treasury: 0,
      hasLandFront: false,
      role: 'attacker',
      access: 'land',
    });
    expect(nation).toEqual({ atWar: false, treasury: 0, hasLandFront: false });
    expect(local).toEqual({ atWar: true, role: 'attacker', access: undefined });
    expect(Object.isFrozen(context)).toBe(true);
  });
});
