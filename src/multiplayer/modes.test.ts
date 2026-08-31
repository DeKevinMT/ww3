import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MULTIPLAYER_GAME_MODE_V2,
  isMultiplayerGameModeV2,
} from './modes';

describe('multiplayer mode policy', () => {
  it('keeps Campaign solo and retains the two separate multiplayer modes', () => {
    expect(DEFAULT_MULTIPLAYER_GAME_MODE_V2).toBe('random-world');
    expect(isMultiplayerGameModeV2('standard-2026')).toBe(false);
    expect(isMultiplayerGameModeV2('survival')).toBe(true);
    expect(isMultiplayerGameModeV2('random-world')).toBe(true);
  });
});
