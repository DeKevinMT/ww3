import { expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';

it('lets the autonomous world evolve from regional crises toward broad conflict', () => {
  const engine = new WorldEngineV2(909);
  const seenWars = new Set<string>();
  const attackers = new Set<string>();
  const regions = new Set<string>();
  let maximumActiveWars = engine.state.wars.length;
  for (let week = 0; week < 520; week += 1) {
    engine.step();
    maximumActiveWars = Math.max(maximumActiveWars, engine.state.wars.length);
    for (const war of engine.state.wars) {
      seenWars.add(war.id);
      attackers.add(war.attackerId);
      regions.add(WORLD_CONTENT_V2.nations[war.attackerId]?.continent ?? 'unknown');
    }
  }
  // Opening conflicts are deliberately staged rather than stacked on week
  // zero. At least two concurrent fronts still make the wider war visible.
  expect(maximumActiveWars).toBeGreaterThanOrEqual(2);
  // Full-destruction campaigns now remain active longer, so roughly one new
  // global war per year is enough to keep the world alive without spam.
  expect(seenWars.size).toBeGreaterThanOrEqual(10);
  // Stronger domestic and post-war pressure makes repeat expansion less
  // attractive; the world must still produce a broad attacker field.
  expect(attackers.size).toBeGreaterThanOrEqual(8);
  expect(regions.size).toBeGreaterThanOrEqual(3);
}, 60_000);
