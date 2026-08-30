import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { aiRoutePreferenceV2 } from './ai';
import { WORLD_CONTENT_V2 } from './content';
import { updateGlobalResistanceV2 } from './resistance';
import { resolveScenarioV2 } from './scenarios';
import { accessibleRogueTargetsV2 } from './survival';
import { nationIdV2, territoryIdV2 } from './types';
import {
  internalArmyTransferLogisticsTermsV2,
  supplyFactorV2,
} from './war';

describe('serious-mode bilateral wars and expedition routing', () => {
  it('retires Campaign global suspicion, coalitions and alliances', () => {
    const engine = new WorldEngineV2(73_001);
    engine.state.aiEscalation.globalThreat = 100;
    engine.state.aiEscalation.resistanceLevel = 2;
    engine.state.aiEscalation.coalitionMembers = [nationIdV2('deu'), nationIdV2('fra')];
    updateGlobalResistanceV2(engine.state, engine.content);
    expect(engine.state.aiEscalation.globalThreat).toBe(0);
    expect(engine.state.aiEscalation.resistanceLevel).toBe(0);
    expect(engine.state.aiEscalation.coalitionMembers).toEqual([]);
    expect(engine.allianceProposalStatus('bel', 'can')).toEqual({
      allowed: false,
      reason: 'The Rogue Signal has shattered alliances; every country fights independently.',
    });
  });

  it('strongly prefers an adjacent land objective over a distant naval expedition', () => {
    const state = new WorldEngineV2(73_002).state;
    const land = aiRoutePreferenceV2(
      state, WORLD_CONTENT_V2, nationIdV2('bel'), nationIdV2('deu'), 'land',
    );
    const naval = aiRoutePreferenceV2(
      state, WORLD_CONTENT_V2, nationIdV2('slv'), nationIdV2('png'), 'naval',
    );
    expect(land).toMatchObject({ distanceKm: 0, priorityPenalty: 0, expeditionRunwayWeeks: 0 });
    expect(naval.distanceKm).toBeGreaterThan(5_000);
    expect(naval.priorityPenalty).toBeGreaterThan(25);
    expect(naval.expeditionRunwayWeeks).toBeGreaterThan(4);
  });

  it('keeps long naval invasion viable but materially slower and less supplied than land', () => {
    const engine = new WorldEngineV2(73_003);
    const elSalvador = nationIdV2('slv');
    const naval = internalArmyTransferLogisticsTermsV2(
      engine.state, engine.content, elSalvador, territoryIdV2('slv'), territoryIdV2('png'), 0.001,
    );
    const land = internalArmyTransferLogisticsTermsV2(
      engine.state, engine.content, elSalvador, territoryIdV2('slv'), territoryIdV2('gtm'), 0.001,
    );
    expect(naval.access).toBe('naval');
    expect(naval.throughputMultiplier).toBeGreaterThanOrEqual(0.10);
    expect(naval.throughputMultiplier).toBeLessThan(land.throughputMultiplier);
    expect(naval.logisticsCost).toBeGreaterThan(0);
    const navalSupply = supplyFactorV2(
      engine.state, engine.content, elSalvador, territoryIdV2('slv'), 'naval', territoryIdV2('png'),
    );
    const landSupply = supplyFactorV2(
      engine.state, engine.content, elSalvador, territoryIdV2('slv'), 'land', territoryIdV2('gtm'),
    );
    expect(navalSupply).toBeGreaterThanOrEqual(0.12);
    expect(navalSupply).toBeLessThan(landSupply);
  });

  it('uses land-only Rogue expansion whenever a contiguous human objective exists', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 73_004 });
    const engine = new WorldEngineV2(73_004, resolved.content);
    expect(engine.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });
    // Simulate the first real post-gateway capture. Independent countries at
    // tick zero are not Rogue sources; only a conquered transit node carrying
    // Antarctic-origin personnel may project the next contiguous front.
    engine.state.territories[territoryIdV2('sen')]!.owner = nationIdV2('rai');
    engine.state.territories[territoryIdV2('sen')]!.coreOwner = nationIdV2('rai');
    engine.state.polarEndgame.rogueWaveManpowerByTerritory[territoryIdV2('sen')] = 1;
    const candidates = accessibleRogueTargetsV2(engine.state, engine.content);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.access === 'land')).toBe(true);
  });
});
