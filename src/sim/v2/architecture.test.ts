import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET_V2, RESEARCH_BRANCH_EFFECTS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import { COUNTRIES, TERRITORIES, isSeaConnection, validateMap } from '../../game/data/worldMap';
import { assertInvariantsV2 } from './invariants';
import { canonicalStateHashV2, createSaveV2, loadSaveV2, type SaveGameV2 } from './persistence';
import {
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_DIRECTIONS,
  researchDirectionIsValidV2,
} from './researchDirections';
import { nationIdV2, territoryIdV2 } from './types';

describe('V2 canonical architecture', () => {
  it('boots every currently exported map nation through explicit initial ownership', () => {
    const state = createWorldStateV2(17);
    expect(WORLD_CONTENT_V2.nationIds).toHaveLength(COUNTRIES.length + 1);
    expect(WORLD_CONTENT_V2.territoryIds).toHaveLength(
      TERRITORIES.length + ANTARCTIC_TERRITORY_IDS_V2.length,
    );
    expect(WORLD_CONTENT_V2.nationIds).toContain(ROGUE_AI_NATION_ID_V2);
    for (const territoryId of WORLD_CONTENT_V2.territoryIds) {
      expect(state.territories[territoryId].owner).toBe(WORLD_CONTENT_V2.territories[territoryId].initialOwnerId);
    }
    expect(state.territories[territoryIdV2('bel')].owner).toBe(nationIdV2('bel'));
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('keeps Greenland separate from Denmark without enabling other microstates', () => {
    const state = createWorldStateV2(18);
    const denmark = COUNTRIES.find((country) => country.id === 'dnk');
    const greenland = COUNTRIES.find((country) => country.id === 'grl');
    const denmarkTerritory = TERRITORIES.find((territory) => territory.id === 'dnk');
    const greenlandTerritory = TERRITORIES.find((territory) => territory.id === 'grl');
    const denmarkContent = WORLD_CONTENT_V2.nations[nationIdV2('dnk')];
    const greenlandContent = WORLD_CONTENT_V2.nations[nationIdV2('grl')];

    expect(COUNTRIES.filter((country) => country.population < 0.25).map((country) => country.id)).toEqual(['grl']);
    expect(denmark).toMatchObject({ iso3: 'DNK', population: 6.009, gdp: 462.527, military: 9.959 });
    expect(greenland).toMatchObject({ iso3: 'GRL', population: 0.057, gdp: 3.327, military: 0.063 });
    expect(denmark?.rings).toHaveLength(12);
    expect(greenland?.rings).toHaveLength(17);
    expect(denmarkTerritory).toBeDefined();
    expect(greenlandTerritory).toBeDefined();
    expect(isSeaConnection('can', 'grl')).toBe(true);
    expect(isSeaConnection('grl', 'can')).toBe(true);
    expect(isSeaConnection('grl', 'isl')).toBe(true);
    expect(isSeaConnection('isl', 'grl')).toBe(true);
    expect(greenlandTerritory?.seaNeighbors).toEqual(expect.arrayContaining(['can', 'isl']));
    expect(WORLD_CONTENT_V2.nationIds).toEqual(expect.arrayContaining([nationIdV2('dnk'), nationIdV2('grl')]));
    expect(WORLD_CONTENT_V2.territoryIds).toEqual(expect.arrayContaining([territoryIdV2('dnk'), territoryIdV2('grl')]));
    expect(WORLD_CONTENT_V2.territories[territoryIdV2('grl')].connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: territoryIdV2('can'), kind: 'sea' }),
      expect.objectContaining({ targetId: territoryIdV2('isl'), kind: 'sea' }),
    ]));
    expect(WORLD_CONTENT_V2.territories[territoryIdV2('can')].connections).toContainEqual(
      expect.objectContaining({ targetId: territoryIdV2('grl'), kind: 'sea' }),
    );
    expect(WORLD_CONTENT_V2.territories[territoryIdV2('isl')].connections).toContainEqual(
      expect.objectContaining({ targetId: territoryIdV2('grl'), kind: 'sea' }),
    );
    expect(greenlandContent.real.taxRevenueSource).toBe('sovereign-proxy');
    expect(greenlandContent.real.taxRevenueShare).toBe(denmarkContent.real.taxRevenueShare);
    expect(state.territories[territoryIdV2('dnk')].owner).toBe(nationIdV2('dnk'));
    expect(state.territories[territoryIdV2('grl')].owner).toBe(nationIdV2('grl'));
    expect(validateMap()).toEqual([]);
  });

  it('keeps nation and territory payloads on the exact canonical key allowlist', () => {
    const state = createWorldStateV2(2);
    const nation = state.players[nationIdV2('bel')];
    const territory = state.territories[territoryIdV2('bel')];
    expect(state.schemaVersion).toBe(22);
    expect(Object.keys(nation).sort()).toEqual(['budget', 'capitalId', 'ceasefiresRequested', 'domesticFoodCapacity', 'empireName', 'foodSecurity', 'foodStock', 'manualActionUses', 'openingArmyBonus', 'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick', 'research', 'researchSurgeAvailableTick', 'trainedReserves', 'treasury', 'warFatigue']);
    expect(Object.keys(territory).sort()).toEqual(['army', 'coreOwner', 'economy', 'integration', 'owner', 'population']);
    expect(Object.keys(territory.army).sort()).toEqual([
      'baseAttack', 'baseDefense', 'capacity', 'manpower',
    ]);
    expect(Object.keys(nation.research).sort()).toEqual([
      'activeProgram', 'allocations', 'breakthroughs', 'categoryDirections', 'effectLevels', 'progress',
    ]);
    expect(nation.research.activeProgram).toBeNull();
    expect(Object.keys(nation.research.categoryDirections).sort())
      .toEqual([...RESEARCH_CATEGORIES].sort());
    for (const category of RESEARCH_CATEGORIES) {
      expect(RESEARCH_CATEGORY_DIRECTIONS[category]).toHaveLength(3);
      expect(researchDirectionIsValidV2(
        category,
        nation.research.categoryDirections[category],
      )).toBe(true);
    }
    expect(nation.budget).toEqual(DEFAULT_BUDGET_V2);
  });

  it('uses only the normative research pools and omits derived/UI state from saves', () => {
    expect(RESEARCH_BRANCH_EFFECTS).toEqual({
      'population-recruitment': ['population-growth', 'training', 'research-speed'],
      'military-industry': ['force-capacity', 'reinforcement-efficiency'],
      'advanced-weapons': ['attack', 'reinforcement-efficiency'],
      'defensive-systems': ['defense', 'casualty-reduction'],
      'logistics-medicine': ['recovery', 'supply'],
      'economy-science': ['economy-growth', 'research-speed', 'research-efficiency'],
      'food-systems': ['supply', 'recovery', 'operating-efficiency'],
      'reserve-doctrine': ['training', 'force-capacity'],
      'public-administration': ['tax-efficiency', 'operating-efficiency'],
      'education-intelligence': ['iq-increase'],
    });
    const save = createSaveV2(createWorldStateV2(3), WORLD_CONTENT_V2) as unknown as Record<string, unknown>;
    expect(save).not.toHaveProperty('speed');
    expect(save).not.toHaveProperty('events');
    expect(save).not.toHaveProperty('winnerId');
    expect(save).not.toHaveProperty('gameOver');
    expect(save).not.toHaveProperty('content');
    expect(save).toHaveProperty('canonicalStateHash');
  });

  it('rejects extra nested canonical keys even when a tampered save is rehashed', () => {
    const mutations: Array<(save: SaveGameV2) => void> = [
      (save) => Object.assign(save.players[nationIdV2('bel')].budget, { legacyFund: 1 }),
      (save) => Object.assign(save.players[nationIdV2('bel')].research.effectLevels, { resilience: 1 }),
      (save) => Object.assign(save.players[nationIdV2('bel')].research.breakthroughs, { industry: 1 }),
      (save) => Object.assign(save.territories[territoryIdV2('bel')].army, { readiness: 1 }),
    ];
    for (const mutate of mutations) {
      const save = structuredClone(createSaveV2(createWorldStateV2(4), WORLD_CONTENT_V2));
      mutate(save);
      save.canonicalStateHash = canonicalStateHashV2(save);
      expect(() => loadSaveV2(save, WORLD_CONTENT_V2)).toThrow(/non-canonical/);
    }
  });

  it('rejects invalid nested references even with a matching hash', () => {
    const save = structuredClone(createSaveV2(createWorldStateV2(5), WORLD_CONTENT_V2));
    save.truces.push({ leftId: nationIdV2('missing'), rightId: nationIdV2('bel'), expiresTick: 12 });
    save.canonicalStateHash = canonicalStateHashV2(save);
    expect(() => loadSaveV2(save, WORLD_CONTENT_V2)).toThrow(/invalid references/);
  });

  it('rejects a revived single focus or a cross-category research direction', () => {
    const focused = structuredClone(createSaveV2(createWorldStateV2(6), WORLD_CONTENT_V2));
    focused.players[nationIdV2('bel')].research.activeProgram = 'advanced-weapons';
    focused.canonicalStateHash = canonicalStateHashV2(focused);
    expect(() => loadSaveV2(focused, WORLD_CONTENT_V2)).toThrow(/retired single-focus/i);

    const crossed = structuredClone(createSaveV2(createWorldStateV2(7), WORLD_CONTENT_V2));
    crossed.players[nationIdV2('bel')].research.categoryDirections.people = {
      branch: 'economy-science',
      effect: 'research-efficiency',
    };
    crossed.canonicalStateHash = canonicalStateHashV2(crossed);
    expect(() => loadSaveV2(crossed, WORLD_CONTENT_V2)).toThrow(/invalid people research direction/i);
  });
});
