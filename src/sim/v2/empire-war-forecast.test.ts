import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { initializeCommanderForceV2 } from './commanderForce';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { invalidateTerritoryIndexV2, selectWarAccessTypeV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type PlayerId,
  type TerritoryId,
  type WorldStateV2,
} from './types';
import { forecastWarV2 } from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const lux = nationIdV2('lux');
const aus = nationIdV2('aus');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const luxTerritory = territoryIdV2('lux');
const ausTerritory = territoryIdV2('aus');
const nationIds = [bel, nld, lux, aus] as const;
const territoryIds = [belTerritory, nldTerritory, luxTerritory, ausTerritory] as const;

type EdgeSpec = readonly [TerritoryId, TerritoryId, 'land' | 'sea', number?];

function contentWithEdges(edges: readonly EdgeSpec[]): WorldContentV2 {
  const connections = new Map<TerritoryId, Array<{
    targetId: TerritoryId;
    kind: 'land' | 'sea';
    distanceKm?: number;
  }>>(territoryIds.map((id) => [id, []]));
  for (const [left, right, kind, distanceKm] of edges) {
    const details = distanceKm === undefined ? {} : { distanceKm };
    connections.get(left)!.push({ targetId: right, kind, ...details });
    connections.get(right)!.push({ targetId: left, kind, ...details });
  }
  return {
    nationIds,
    territoryIds,
    nations: Object.fromEntries(nationIds.map((id) => [
      id,
      WORLD_CONTENT_V2.nations[id]!,
    ])) as WorldContentV2['nations'],
    territories: Object.fromEntries(territoryIds.map((id) => [
      id,
      {
        ...WORLD_CONTENT_V2.territories[id]!,
        id,
        initialOwnerId: id as unknown as PlayerId,
        connections: connections.get(id)!,
      },
    ])) as WorldContentV2['territories'],
  };
}

function forecastContent(
  supportAccess: 'land' | 'sea' = 'land',
): WorldContentV2 {
  return contentWithEdges([
    [belTerritory, nldTerritory, 'land'],
    [luxTerritory, belTerritory, supportAccess, supportAccess === 'sea' ? 3_200 : undefined],
  ]);
}

function setArmy(
  state: WorldStateV2,
  id: TerritoryId,
  manpower: number,
  capacity: number,
): void {
  const army = state.territories[id]!.army;
  army.manpower = manpower;
  army.capacity = capacity;
  army.baseAttack = 1.2;
  army.baseDefense = 1.2;
}

function forecastState(
  supportAccess: 'land' | 'sea' = 'land',
  connectedManpower = 0,
  disconnectedManpower = 0,
): { state: WorldStateV2; content: WorldContentV2 } {
  const content = forecastContent(supportAccess);
  const state = createWorldStateV2(74_201, content);
  state.humanPlayerId = bel;
  state.humanPlayerIds = [bel];
  state.territories[belTerritory]!.owner = bel;
  state.territories[luxTerritory]!.owner = bel;
  state.territories[ausTerritory]!.owner = bel;
  state.territories[nldTerritory]!.owner = nld;
  state.players[bel]!.capitalId = belTerritory;
  state.players[nld]!.capitalId = nldTerritory;
  state.players[bel]!.treasury = 10;
  state.players[nld]!.treasury = 10;
  setArmy(state, belTerritory, 0.10, 0.40);
  setArmy(state, luxTerritory, connectedManpower, 0.40);
  // Capacity is held constant so this disconnected test changes only the
  // available formation, never the global hit-cap calibration.
  setArmy(state, ausTerritory, disconnectedManpower, 0.40);
  setArmy(state, nldTerritory, 0.18, 0.40);
  invalidateTerritoryIndexV2(state);
  return { state, content };
}

const apexProfile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.001,
    maxIntegrity: 0.001,
    rechargeBuffer: 0.00008,
    rechargeMultiplier: 1,
    pulseAttack: 0,
  },
  attackMultiplier: 1.25,
  defenseMultiplier: 1.20,
  treasury: 1,
  annualOutput: 0,
  supplyStock: 0.002,
  capabilities: { forceMultiplier: true },
};

describe('front-specific Empire war forecast', () => {
  it('raises win chance when a connected backline formation can feed the front', () => {
    const empty = forecastState('land', 0, 0);
    const reinforced = forecastState('land', 0.30, 0);

    const baseline = forecastWarV2(empty.state, empty.content, bel, nld);
    const supported = forecastWarV2(reinforced.state, reinforced.content, bel, nld);

    expect(supported.sourceId).toBe(belTerritory);
    expect(supported.targetId).toBe(nldTerritory);
    expect(supported.winChance).toBeGreaterThan(baseline.winChance);
  });

  it('gives a disconnected formation no free contribution', () => {
    const empty = forecastState('land', 0.30, 0);
    const stranded = forecastState('land', 0.30, 0.30);

    expect(forecastWarV2(stranded.state, stranded.content, bel, nld).winChance)
      .toBe(forecastWarV2(empty.state, empty.content, bel, nld).winChance);
  });

  it('discounts an equivalent naval backline below a land-connected formation', () => {
    const land = forecastState('land', 0.30, 0);
    const naval = forecastState('sea', 0.30, 0);

    const landForecast = forecastWarV2(land.state, land.content, bel, nld);
    const navalForecast = forecastWarV2(naval.state, naval.content, bel, nld);

    expect(landForecast.access).toBe('land');
    expect(navalForecast.access).toBe('land');
    expect(landForecast.winChance).toBeGreaterThan(navalForecast.winChance);
  });

  it('freezes the exact viable front even when owner-level access prefers another route', () => {
    const content = contentWithEdges([
      [belTerritory, nldTerritory, 'land'],
      [luxTerritory, nldTerritory, 'sea', 3_200],
    ]);
    const state = createWorldStateV2(74_202, content);
    state.humanPlayerId = bel;
    state.humanPlayerIds = [bel];
    state.territories[belTerritory]!.owner = bel;
    state.territories[luxTerritory]!.owner = bel;
    state.territories[ausTerritory]!.owner = bel;
    state.territories[nldTerritory]!.owner = nld;
    setArmy(state, belTerritory, 0.001, 0.40);
    setArmy(state, luxTerritory, 0.30, 0.40);
    setArmy(state, ausTerritory, 0, 0.40);
    setArmy(state, nldTerritory, 0.18, 0.40);
    invalidateTerritoryIndexV2(state);

    expect(selectWarAccessTypeV2(state, content, bel, nld)).toBe('land');
    expect(forecastWarV2(state, content, bel, nld)).toMatchObject({
      sourceId: luxTerritory,
      targetId: nldTerritory,
      access: 'naval',
      routeDistanceKm: 3_200,
      routeHopCount: 1,
      routeThroughputMultiplier: 0.5,
    });
  });

  it('includes the live APEX Army modifier and remains deterministic and bounded', () => {
    const { state, content } = forecastState('land', 0.30, 0);
    expect(initializeCommanderForceV2(state, content, bel, apexProfile))
      .toEqual({ accepted: true });
    // Commander initialization normally happens before scenario Army setup.
    // Restore the controlled fixture and then remove only APEX for the blind
    // comparison so both forecasts see byte-identical national formations.
    setArmy(state, belTerritory, 0.10, 0.40);
    setArmy(state, luxTerritory, 0.30, 0.40);
    setArmy(state, ausTerritory, 0, 0.40);
    setArmy(state, nldTerritory, 0.18, 0.40);
    const blindState = structuredClone(state);
    delete blindState.commanderForces[bel];
    const withoutApex = forecastWarV2(blindState, content, bel, nld);

    const first = forecastWarV2(state, content, bel, nld);
    const second = forecastWarV2(state, content, bel, nld);

    expect(first.apexContribution.attackMultiplier).toBeGreaterThan(1);
    expect(first.apexContribution.defenseMultiplier).toBeGreaterThan(1);
    expect(first.winChance).toBeGreaterThan(withoutApex.winChance);
    expect(first).toEqual(second);
    expect(first.winChance).toBeGreaterThanOrEqual(0);
    expect(first.winChance).toBeLessThanOrEqual(100);
  });
});
