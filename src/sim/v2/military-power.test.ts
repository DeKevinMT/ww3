import { describe, expect, it } from 'vitest';
import { addArmyManpowerWithQualityV2 } from './armyQuality';
import { createWorldStateV2 } from './bootstrap';
import { calibratedMilitaryRatingsV2, WORLD_CONTENT_V2 } from './content';
import {
  createMilitaryBaseSnapshotV2,
  invalidateTerritoryIndexV2,
  selectCurrentPowerV2,
  selectGlobalRankingV2,
  selectMilitaryBaseRatingsV2,
  selectTerritoryPowerV2,
  selectTotalManpowerV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

describe('V2 real-world military power calibration', () => {
  it('separates army volume from per-soldier effectiveness', () => {
    const state = createWorldStateV2(2026);
    const usa = nationIdV2('usa');
    const china = nationIdV2('chn');
    const india = nationIdV2('ind');
    const russia = nationIdV2('rus');

    const usaManpower = selectTotalManpowerV2(state, usa).deployed;
    const chinaManpower = selectTotalManpowerV2(state, china).deployed;
    const indiaManpower = selectTotalManpowerV2(state, india).deployed;
    const usaPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, usa);
    const chinaPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, china);
    const indiaPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, india);
    const russiaPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, russia);

    expect(chinaManpower).toBeGreaterThan(usaManpower * 1.15);
    expect(indiaManpower).toBeGreaterThan(1);
    expect(usaPower).toBeGreaterThan(chinaPower);
    expect(chinaPower).toBeGreaterThan(indiaPower);
    expect(russiaPower).toBeGreaterThan(indiaPower);
    expect(usaPower / usaManpower).toBeGreaterThan(chinaPower / chinaManpower);
    expect(chinaPower / chinaManpower).toBeGreaterThan(indiaPower / indiaManpower);
    expect(indiaPower).toBeLessThan(usaPower * 0.80);
  });

  it('starts from a credible data-calibrated Combat Power ranking', () => {
    const state = createWorldStateV2(2026);
    const ranking = selectGlobalRankingV2(state, WORLD_CONTENT_V2);
    const rankedIds = ranking.map((entry) => entry.player.id);

    expect(rankedIds.slice(0, 4)).toEqual([
      nationIdV2('usa'),
      nationIdV2('chn'),
      nationIdV2('rus'),
      nationIdV2('ind'),
    ]);
    expect(new Set(rankedIds.slice(0, 15))).toEqual(new Set([
      'usa', 'chn', 'rus', 'ind', 'deu', 'gbr', 'fra', 'jpn',
      'sau', 'ita', 'kor', 'esp', 'ukr', 'pol', 'bra',
    ].map(nationIdV2)));
    expect(ranking[0]!.score).toBeLessThanOrEqual(selectCurrentPowerV2(state, WORLD_CONTENT_V2, nationIdV2('usa')) * 1.10 + 1e-6);
  });

  it('keeps opening ratings exact and reports conquered armies by deployed manpower, never population', () => {
    const state = createWorldStateV2(2026);
    const openingSnapshot = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2);
    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const definition = WORLD_CONTENT_V2.nations[playerId];
      const rating = selectMilitaryBaseRatingsV2(
        state, WORLD_CONTENT_V2, playerId, openingSnapshot,
      );
      expect(rating.attack).toBe(definition.militaryAttackRating);
      expect(rating.defense).toBe(definition.militaryDefenseRating);
    }

    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belgianTerritory = territoryIdV2('bel');
    const dutchTerritory = territoryIdV2('nld');
    const belgianBase = openingSnapshot.byNation.get(belgium)!;
    const dutchBase = openingSnapshot.byNation.get(netherlands)!;
    const belgianManpower = state.territories[belgianTerritory].army.manpower;
    const dutchManpower = state.territories[dutchTerritory].army.manpower;

    state.territories[dutchTerritory].owner = belgium;
    invalidateTerritoryIndexV2(state);
    const afterDutchConquest = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2)
      .byNation.get(belgium)!;
    expect(afterDutchConquest.attack).toBeCloseTo(
      (belgianBase.attack * belgianManpower + dutchBase.attack * dutchManpower)
        / (belgianManpower + dutchManpower),
      8,
    );
    expect(afterDutchConquest.defense).toBeCloseTo(
      (belgianBase.defense * belgianManpower + dutchBase.defense * dutchManpower)
        / (belgianManpower + dutchManpower),
      8,
    );
    expect(state.territories[belgianTerritory].army.baseAttack).toBe(belgianBase.attack);
    expect(state.territories[dutchTerritory].army.baseAttack).toBe(dutchBase.attack);

    // Civilians affect capacity, but never rewrite the quality of soldiers
    // already deployed in either army.
    state.territories[dutchTerritory].population *= 2;
    const afterDutchGrowth = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2)
      .byNation.get(belgium)!;
    expect(afterDutchGrowth).toEqual(afterDutchConquest);
    expect(selectCurrentPowerV2(state, WORLD_CONTENT_V2, belgium)).toBeCloseTo(
      selectTerritoryPowerV2(state, WORLD_CONTENT_V2, belgianTerritory)
        + selectTerritoryPowerV2(state, WORLD_CONTENT_V2, dutchTerritory),
      8,
    );
    expect(state.schemaVersion).toBe(19);
    expect('militaryBaseRatings' in state.players[belgium]).toBe(false);
  });

  it('splits one transparent force rating into ATK and DEF without changing its 55/45 value', () => {
    const rating = calibratedMilitaryRatingsV2(80, 200, 0.40);
    expect(0.55 * rating.attack + 0.45 * rating.defense).toBeCloseTo(rating.combined, 8);
    expect(rating.combined).toBeCloseTo(2, 8);
    expect(rating.attack).toBeGreaterThan(rating.defense);

    const forceDepth = calibratedMilitaryRatingsV2(40, 1, 0.40);
    expect(forceDepth.defense).toBeGreaterThan(forceDepth.attack);
  });

  it('always adds power when weak regular recruits join a strong elite army', () => {
    const state = createWorldStateV2(2_027);
    const belgium = nationIdV2('bel');
    const territory = state.territories[territoryIdV2('bel')];
    territory.condition = 1;
    territory.army.capacity = 1;
    territory.army.manpower = 0.10;
    territory.army.baseAttack = 5;
    territory.army.baseDefense = 5;
    state.players[belgium].combatExperience = 100;
    const before = selectCurrentPowerV2(state, WORLD_CONTENT_V2, belgium);
    const attackMassBefore = territory.army.manpower * territory.army.baseAttack;

    const smallAddition = addArmyManpowerWithQualityV2(
      territory.army, 0.01, { attack: 0.50, defense: 0.50 },
    );
    const afterSmall = selectCurrentPowerV2(state, WORLD_CONTENT_V2, belgium);
    expect(afterSmall).toBeGreaterThan(before);
    expect(territory.army.manpower * territory.army.baseAttack).toBeCloseTo(
      attackMassBefore + smallAddition * 0.50, 8,
    );

    addArmyManpowerWithQualityV2(
      territory.army, 0.50, { attack: 0.50, defense: 0.50 },
    );
    const afterLarge = selectCurrentPowerV2(state, WORLD_CONTENT_V2, belgium);
    expect(afterLarge).toBeGreaterThan(afterSmall);
  });
});
