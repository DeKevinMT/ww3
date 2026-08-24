import { describe, expect, it } from 'vitest';
import { formMatchmakingGroups, type MatchmakingQueueEntry } from './matchmakingGroups';

const entry = (
  clientId: string,
  queuedAt: number,
  rulesVersion = 'rules-v1',
): MatchmakingQueueEntry => ({ clientId, queuedAt, rulesVersion });

describe('public matchmaking FIFO grouping', () => {
  it('forms deterministic two-player seeds for open lobbies', () => {
    const groups = formMatchmakingGroups([
      entry('player_c', 30), entry('player_a', 10), entry('player_b', 20), entry('player_d', 40),
    ]);
    expect(groups.map((group) => group.map(({ clientId }) => clientId))).toEqual([
      ['player_a', 'player_b'],
      ['player_c', 'player_d'],
    ]);
  });

  it('never mixes rules versions and leaves an unmatched player waiting', () => {
    const groups = formMatchmakingGroups([
      entry('v1_a', 1, 'v1'), entry('v2_a', 2, 'v2'),
      entry('v1_b', 3, 'v1'), entry('v2_b', 4, 'v2'),
      entry('v1_waiting', 5, 'v1'),
    ]);
    expect(groups.map((group) => group.map(({ clientId }) => clientId))).toEqual([
      ['v1_a', 'v1_b'],
      ['v2_a', 'v2_b'],
    ]);
  });
});
