import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  ANTARCTIC_GATEWAY_IDS_V2,
  CAMPAIGN_FIRST_GATEWAY_BREACH_TICKS_V2,
  antarcticGatewayTerritoryIdV2,
  deterministicAntarcticGatewayOrderV2,
  deterministicSurvivalAntarcticGatewayOrderV2,
  isWorldConnectionOpenV2,
  processAntarcticGatewayBreachesV2,
  prepareAntarcticGatewayBreachesV2,
  scheduleAntarcticGatewayBreachV2,
} from './antarcticGateways';
import {
  ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2,
  ANTARCTIC_TERRITORY_IDS_V2,
  WORLD_CONTENT_V2,
} from './content';
import { assertInvariantsV2 } from './invariants';
import {
  ARCTIC_PROJECT_IDS_V2,
  ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2,
  ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2,
  ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2,
  processArcticResearchV2,
  processRogueAttentionV2,
  startArcticProjectV2,
} from './polarEndgame';
import { resolveScenarioV2 } from './scenarios';
import { rogueAiSurvivalActiveV2 } from './survival';
import { synchronizeArmyCapacityV2 } from './capacity';
import { retireAbsorbedNationV2 } from './integration';
import { nationIdV2 } from './types';

function survival(seed: number): WorldEngineV2 {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  return new WorldEngineV2(seed, resolved.content);
}

function campaignWithLiberatedShare(seed: number): WorldEngineV2 {
  const engine = new WorldEngineV2(seed);
  const human = nationIdV2('bel');
  expect(engine.chooseCountry(human)).toEqual({ accepted: true });
  const worldIds = engine.content.territoryIds
    .filter((id) => !ANTARCTIC_TERRITORY_IDS_V2.includes(id));
  const needed = Math.ceil(worldIds.length * ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2);
  const retiredOwners = new Set<ReturnType<typeof nationIdV2>>();
  for (const territoryId of worldIds.slice(0, needed)) {
    const territory = engine.state.territories[territoryId]!;
    if (territory.owner !== human) retiredOwners.add(territory.owner);
    territory.owner = human;
    territory.coreOwner = human;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  for (const formerOwner of [...retiredOwners]) {
    retireAbsorbedNationV2(engine.state, engine.content, formerOwner, human, false);
  }
  synchronizeArmyCapacityV2(engine.state, engine.content);
  return engine;
}

describe('gradual Antarctic gateway breaches', () => {
  it('starts Survival with all three routes open in one deterministic seeded order', () => {
    const engine = survival(80_001);
    expect(engine.state.polarEndgame.gatewayBreachOrder)
      .toEqual(deterministicSurvivalAntarcticGatewayOrderV2(80_001));
    expect(new Set(engine.state.polarEndgame.gatewayBreachOrder))
      .toEqual(new Set(ANTARCTIC_GATEWAY_IDS_V2));
    expect(Object.values(engine.state.polarEndgame.gatewayBreaches)
      .filter((breach) => breach?.status === 'open')).toHaveLength(3);
    expect(Object.values(engine.state.polarEndgame.gatewayBreaches)
      .filter((breach) => breach?.status === 'breaching')).toHaveLength(0);
    for (const route of ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2) {
      expect(isWorldConnectionOpenV2(
        engine.state,
        antarcticGatewayTerritoryIdV2(route.gatewayId),
        route.countryId,
      )).toBe(true);
    }
    const reloaded = WorldEngineV2.fromSave(engine.save(), engine.content);
    expect(reloaded.state.polarEndgame.gatewayBreachOrder)
      .toEqual(engine.state.polarEndgame.gatewayBreachOrder);
    expect(reloaded.state.polarEndgame.gatewayBreaches)
      .toEqual(engine.state.polarEndgame.gatewayBreaches);
    expect(reloaded.canonicalHash()).toBe(engine.canonicalHash());
  });

  it('weights roughly seven in ten Survival openings toward New Zealand without forcing it', () => {
    const sampleSize = 10_000;
    const firstGateways = Array.from({ length: sampleSize }, (_, seed) => (
      deterministicSurvivalAntarcticGatewayOrderV2(seed + 1)[0]!
    ));
    const newZealandShare = firstGateways.filter((gatewayId) => gatewayId === 'ross-entry').length
      / sampleSize;

    expect(newZealandShare).toBeGreaterThanOrEqual(0.65);
    expect(newZealandShare).toBeLessThanOrEqual(0.75);
    expect(new Set(firstGateways)).toEqual(new Set(ANTARCTIC_GATEWAY_IDS_V2));
    expect(deterministicSurvivalAntarcticGatewayOrderV2(81_004))
      .toEqual(deterministicSurvivalAntarcticGatewayOrderV2(81_004));
  });

  it('keeps an already-authored legacy Survival route stable across reconnect', () => {
    const seed = Array.from({ length: 10_000 }, (_, index) => index + 1).find((candidate) => (
      deterministicAntarcticGatewayOrderV2(candidate).join('|')
        !== deterministicSurvivalAntarcticGatewayOrderV2(candidate).join('|')
    ))!;
    const engine = survival(seed);
    const legacyOrder = deterministicAntarcticGatewayOrderV2(seed);
    engine.state.polarEndgame.gatewayBreachOrder = legacyOrder;
    for (const gatewayId of ANTARCTIC_GATEWAY_IDS_V2) {
      engine.state.polarEndgame.gatewayBreaches[gatewayId] = {
        gatewayId,
        status: gatewayId === legacyOrder[0] ? 'breaching' : 'sealed',
        breachStartedTick: gatewayId === legacyOrder[0] ? engine.state.tick : null,
        opensTick: gatewayId === legacyOrder[0]
          ? engine.state.tick + 6 : null,
        openedTick: null,
      };
    }

    const reloaded = WorldEngineV2.fromSave(engine.save(), engine.content);
    expect(reloaded.state.polarEndgame.gatewayBreachOrder).toEqual(legacyOrder);
    expect(reloaded.state.polarEndgame.gatewayBreaches)
      .toEqual(engine.state.polarEndgame.gatewayBreaches);
    assertInvariantsV2(reloaded.state, reloaded.content);
  });

  it('keeps Campaign permutations varied and opens its gateways monotonically one by one', () => {
    const permutations = new Set(Array.from({ length: 24 }, (_, seed) => (
      deterministicAntarcticGatewayOrderV2(seed + 1).join('|')
    )));
    expect(permutations.size).toBeGreaterThan(1);
    const engine = new WorldEngineV2(80_002);
    prepareAntarcticGatewayBreachesV2(engine.state);
    const order = engine.state.polarEndgame.gatewayBreachOrder;
    expect(scheduleAntarcticGatewayBreachV2(engine.state, 0, 13)).toBe(order[0]);
    engine.state.tick += 13;
    expect(processAntarcticGatewayBreachesV2(engine.state)).toEqual([order[0]]);
    expect(scheduleAntarcticGatewayBreachV2(engine.state, 1, 13)).toBe(order[1]);
    expect(Object.values(engine.state.polarEndgame.gatewayBreaches)
      .filter((breach) => breach?.status === 'open')).toHaveLength(1);
    engine.state.tick += 13;
    expect(processAntarcticGatewayBreachesV2(engine.state)).toEqual([order[1]]);
    expect(scheduleAntarcticGatewayBreachV2(engine.state, 2, 13)).toBe(order[2]);
    engine.state.tick += 13;
    expect(processAntarcticGatewayBreachesV2(engine.state)).toEqual([order[2]]);
    expect(order.map((id) => engine.state.polarEndgame.gatewayBreaches[id]!.status))
      .toEqual(['open', 'open', 'open']);
    synchronizeArmyCapacityV2(engine.state, engine.content);
    assertInvariantsV2(engine.state, engine.content);
  });
});

describe('Campaign Rogue Attention', () => {
  it('requires both eight years and 18% liberation, then warns for 78 weeks before activation', () => {
    const lowExpansion = new WorldEngineV2(80_010);
    lowExpansion.state.tick = 1_000;
    expect(processRogueAttentionV2(lowExpansion.state, lowExpansion.content)).toBe(false);
    expect(lowExpansion.state.polarEndgame.rogueAttention.stage).toBe('dormant');

    const engine = campaignWithLiberatedShare(80_011);
    engine.state.tick = ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2 - 1;
    expect(processRogueAttentionV2(engine.state, engine.content)).toBe(false);
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('dormant');
    engine.state.tick += 1;
    processRogueAttentionV2(engine.state, engine.content);
    expect(engine.state.polarEndgame.rogueAttention).toMatchObject({
      stage: 'observing',
      benchmarkMetTick: ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2,
      nextStageTick: ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2
        + ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2,
    });
    expect(rogueAiSurvivalActiveV2(engine.state)).toBe(false);
    engine.state.tick += ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2;
    processRogueAttentionV2(engine.state, engine.content);
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('mobilising');
    engine.state.tick += ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2;
    processRogueAttentionV2(engine.state, engine.content);
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('breach-imminent');

    const checkpoint = new WorldEngineV2(80_013);
    checkpoint.state.polarEndgame.rogueAttention = {
      ...engine.state.polarEndgame.rogueAttention,
      benchmarkMetTick: 0,
      nextStageTick: ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2,
    };
    prepareAntarcticGatewayBreachesV2(checkpoint.state);
    const reconnect = WorldEngineV2.fromSave(checkpoint.save(), checkpoint.content);
    expect(reconnect.state.polarEndgame.rogueAttention)
      .toEqual(checkpoint.state.polarEndgame.rogueAttention);
    reconnect.state.tick = ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(reconnect.state, reconnect.content);
    expect(processRogueAttentionV2(reconnect.state, reconnect.content)).toBe(true);
    expect(rogueAiSurvivalActiveV2(reconnect.state)).toBe(true);
    const breach = reconnect.state.polarEndgame.gatewayBreaches[
      reconnect.state.polarEndgame.gatewayBreachOrder[0]!
    ]!;
    expect(breach.status).toBe('breaching');
    expect(breach.opensTick).toBe(reconnect.state.tick + CAMPAIGN_FIRST_GATEWAY_BREACH_TICKS_V2);
    expect(reconnect.state.polarEndgame.nextCounteroffensiveTick)
      .toBe(reconnect.state.tick + 52);
  });

  it('derives the Stage I warning copy from the full 79-week buildup', () => {
    const engine = campaignWithLiberatedShare(80_014);
    const human = engine.state.humanPlayerId;
    engine.state.polarEndgame.arcticPrograms[human] = {
      playerId: human,
      activeProject: null,
      completedProjects: ['polar-demography'],
    };
    engine.state.tick = ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2;

    expect(processRogueAttentionV2(engine.state, engine.content)).toBe(false);
    expect(engine.state.polarEndgame.rogueAttention.nextStageTick).toBe(
      engine.state.tick + ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2 + 1,
    );
    expect(engine.state.events.at(-1)?.message).toContain('Estimated buildup: 79 weeks.');
  });

  it('makes the final North Pole stage useful intel without awakening the Rogue', () => {
    const engine = new WorldEngineV2(80_012);
    const human = engine.state.humanPlayerId;
    const progress = {
      playerId: human,
      completedProjects: ARCTIC_PROJECT_IDS_V2.slice(0, -1),
      activeProject: null,
    };
    engine.state.polarEndgame.arcticPrograms[human] = progress;
    engine.state.players[human]!.treasury = 10_000;
    const finalProject = ARCTIC_PROJECT_IDS_V2.at(-1)!;
    expect(startArcticProjectV2(engine.state, engine.content, human, finalProject))
      .toEqual({ accepted: true });
    engine.state.tick = progress.activeProject!.completesTick;
    expect(processArcticResearchV2(engine.state, engine.content))
      .toEqual(expect.arrayContaining([{ kind: 'project-complete', playerId: human, projectId: finalProject }]));
    expect(rogueAiSurvivalActiveV2(engine.state)).toBe(false);
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('dormant');
    expect(engine.state.polarEndgame.phase).toBe('warning');
    expect(Object.values(engine.state.polarEndgame.gatewayBreaches)
      .every((breach) => breach?.status === 'sealed')).toBe(true);
  });
});
