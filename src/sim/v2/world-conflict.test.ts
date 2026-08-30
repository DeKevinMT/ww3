import { expect, it } from 'vitest';
import { activeAutonomousAiVsAiWarsV2 } from './ai';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

it('lets the autonomous world evolve from regional crises toward broad conflict', () => {
  const engine = new WorldEngineV2(909);
  enterPostBlackoutCampaignForTestV2(engine.state);
  const seenWars = new Set<string>();
  const attackers = new Set<string>();
  const regions = new Set<string>();
  let maximumActiveWars = engine.state.wars.length;
  let maximumBackgroundWars = 0;
  for (let week = 0; week < 312; week += 1) {
    engine.step();
    maximumActiveWars = Math.max(maximumActiveWars, engine.state.wars.length);
    maximumBackgroundWars = Math.max(
      maximumBackgroundWars,
      activeAutonomousAiVsAiWarsV2(engine.state, WORLD_CONTENT_V2),
    );
    for (const war of engine.state.wars) {
      seenWars.add(war.id);
      attackers.add(war.attackerId);
      regions.add(WORLD_CONTENT_V2.nations[war.attackerId]?.continent ?? 'unknown');
    }
  }
  // No human war is issued in this fixture. The opening decade therefore
  // stays at the intentional single readable autonomous theatre cap.
  expect(maximumActiveWars).toBe(1);
  expect(maximumBackgroundWars).toBe(1);
  // Three distinct conflicts over six years keep the world alive without
  // counting a replayed scripted opening as legitimate activity.
  expect(seenWars.size).toBeGreaterThanOrEqual(3);
  // Stronger domestic and post-war pressure makes repeat expansion less
  // attractive; the world must still produce a broad attacker field.
  expect(attackers.size).toBeGreaterThanOrEqual(3);
  // Sequential theatres still migrate between continents, without requiring
  // simultaneous global war spam to satisfy the scenario.
  expect(regions.size).toBeGreaterThanOrEqual(2);
}, 90_000);
