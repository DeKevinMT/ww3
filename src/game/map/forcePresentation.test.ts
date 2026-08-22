import { describe, expect, it } from 'vitest';
import { forcePresentationSignature } from './forcePresentation';

describe('force presentation signature', () => {
  it('is stable across insertion order', () => {
    const left = forcePresentationSignature({
      moved: new Set(['bel', 'nld']),
      active: new Set(['fra', 'deu']),
      strongest: new Set(['lux', 'bel']),
    });
    const right = forcePresentationSignature({
      moved: new Set(['nld', 'bel']),
      active: new Set(['deu', 'fra']),
      strongest: new Set(['bel', 'lux']),
    });

    expect(right).toBe(left);
  });

  it.each(['moved', 'active', 'strongest'] as const)(
    'changes immediately when the %s force set changes',
    (setName) => {
      const baseline = {
        moved: new Set(['bel']),
        active: new Set(['bel']),
        strongest: new Set(['bel']),
      };
      const changed = {
        ...baseline,
        [setName]: new Set(['bel', 'nld']),
      };

      expect(forcePresentationSignature(changed)).not.toBe(forcePresentationSignature(baseline));
    },
  );
});
