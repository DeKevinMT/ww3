import { describe, expect, it } from 'vitest';
import { processApexNarrativeV2 } from './apexNarrative';
import { processCampaignFirstStrikeGuidanceV2 } from './campaignFirstStrike';
import { campaignHumanWarsUnlockedV2 } from './campaignPrologue';
import { CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2 } from './campaignTutorial';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WorldEngineV2 } from './WorldEngineV2';

describe('Campaign without guided first strike', () => {
  it('never dispatches the retired tutorial chronology or guided target', () => {
    const engine = new WorldEngineV2(84_100);
    const playerId = engine.state.humanPlayerId;
    for (const tick of [6, 20, 100]) {
      engine.state.tick = tick;
      expect(processApexNarrativeV2(engine.state, engine.content)).toBe(0);
      expect(processCampaignFirstStrikeGuidanceV2(engine.state, engine.content)).toBe(0);
    }
    expect(engine.apexTransmissions(playerId)
      .filter((item) => CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2.includes(item.id)))
      .toEqual([]);
  });

  it('allows a legal player attack immediately under ordinary war rules', () => {
    const engine = new WorldEngineV2(84_101);
    const playerId = engine.state.humanPlayerId;
    const defenderId = engine.content.nationIds.find((candidateId) => (
      candidateId !== playerId && engine.warDeclarationStatus(playerId, candidateId).allowed
    ));
    expect(defenderId).toBeDefined();
    expect(campaignHumanWarsUnlockedV2(engine.state, engine.content, playerId)).toBe(true);
    expect(engine.warDeclarationStatus(playerId, defenderId!)).toMatchObject({ allowed: true });

    expect(engine.declareWar(playerId, defenderId!)).toEqual({ accepted: true });
    engine.step();
    expect(engine.state.wars.some((war) => (
      war.attackerId === playerId && war.defenderId === defenderId
    ))).toBe(true);
  });

  it('does not replay retired guidance after save and reconnect', () => {
    const engine = new WorldEngineV2(84_102);
    const playerId = engine.state.humanPlayerId;
    engine.state.tick = 100;
    expect(processApexNarrativeV2(engine.state, engine.content)).toBe(0);
    synchronizeArmyCapacityV2(engine.state, engine.content);
    const loaded = WorldEngineV2.fromSave(engine.save());
    expect(processApexNarrativeV2(loaded.state, loaded.content)).toBe(0);
    expect(processCampaignFirstStrikeGuidanceV2(loaded.state, loaded.content)).toBe(0);
    expect(loaded.apexTransmissions(playerId)
      .some((item) => CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2.includes(item.id)))
      .toBe(false);
  });
});
