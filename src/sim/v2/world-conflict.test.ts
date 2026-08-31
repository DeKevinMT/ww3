import { expect, it } from 'vitest';
import { activeAutonomousAiVsAiWarsV2 } from './ai';
import { WORLD_CONTENT_V2 } from './content';
import { nationIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

it('lets the autonomous world evolve from regional crises toward broad conflict', () => {
  const engine = new WorldEngineV2(909);
  // A durable major-power human seat lets the ordinary autonomous-war cadence
  // run long enough to be observed without relying on the retired proof war.
  const humanId = nationIdV2('usa');
  expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
  engine.state.polarEndgame.communicationsBlackoutTick = 0;
  for (const nationId of engine.content.nationIds) {
    if (nationId === humanId || engine.content.nations[nationId]?.kind === 'rogue-ai') continue;
    const [leftId, rightId] = [humanId, nationId].sort();
    engine.state.truces.push({ leftId, rightId, expiresTick: 10_000 });
  }
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
  // No human war is issued in this fixture. The world stays at the intentional
  // single readable autonomous theatre cap.
  expect(maximumActiveWars).toBe(1);
  expect(maximumBackgroundWars).toBe(1);
  // Multiple ordinary conflicts keep the world alive without counting a
  // replayed scripted opening as legitimate activity.
  expect(seenWars.size).toBeGreaterThanOrEqual(2);
  // Stronger domestic and post-war pressure makes repeat expansion less
  // attractive; the world must still produce a broad attacker field.
  expect(attackers.size).toBeGreaterThanOrEqual(2);
  // Sequential theatres still migrate between continents, without requiring
  // simultaneous global war spam to satisfy the scenario.
  expect(regions.size).toBeGreaterThanOrEqual(2);
}, 90_000);
