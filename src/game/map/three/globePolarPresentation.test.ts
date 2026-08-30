import { describe, expect, it } from 'vitest';
import type { MapPolarEndgameSnapshot } from '../bridge';
import { globePolarPresentationSignature } from './globePolarPresentation';

function polarSnapshot(visualRevision: number): MapPolarEndgameSnapshot {
  return {
    phase: 'contact',
    visualRevision,
    sectors: {
      'drake-entry': { status: 'available', integrity: 100, wave: 1 },
      'maud-entry': { status: 'contested', integrity: 80, wave: 2 },
      'ross-entry': { status: 'available', integrity: 100, wave: 1 },
      'zero-point-core': { status: 'secured', integrity: 0, wave: 3 },
    },
  };
}

describe('globe polar presentation cache', () => {
  it('turns 100 simulation-only visual revisions into zero extra DOM updates', () => {
    const signatures = Array.from({ length: 101 }, (_, revision) => (
      globePolarPresentationSignature(polarSnapshot(revision))
    ));
    expect(new Set(signatures)).toHaveLength(1);
  });

  it('still invalidates for the exact secured-sector summary shown on screen', () => {
    const before = polarSnapshot(1);
    const next = polarSnapshot(2);
    const after: MapPolarEndgameSnapshot = {
      ...next,
      sectors: {
        ...next.sectors,
        'drake-entry': {
          ...next.sectors['drake-entry']!,
          status: 'secured',
        },
      },
    };
    expect(globePolarPresentationSignature(after))
      .not.toBe(globePolarPresentationSignature(before));
  });
});
