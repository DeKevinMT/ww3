import { describe, expect, it } from 'vitest';
import {
  groupFlagLandmasses,
  resolveCountryPresentationAnchor,
} from './countryPresentation';

describe('country map presentation', () => {
  it('pins France to a metropolitan-Europe presentation anchor', () => {
    const fallback = { x: -1, y: -1 };
    const projected = resolveCountryPresentationAnchor(
      'fra',
      fallback,
      (longitude, latitude) => ({ x: longitude, y: latitude }),
    );

    expect(projected).toEqual({ x: 2.5, y: 46.6 });
    expect(resolveCountryPresentationAnchor('deu', fallback, () => ({ x: 0, y: 0 }))).toBe(fallback);
  });

  it('keeps metropolitan France separate from overseas rings without dropping geometry', () => {
    // These centres reproduce the old transitive bridge: the Atlantic island is
    // within 260 units of both mainland France and the Caribbean group.
    const rings = [
      { ring: 'mainland', x: 649, y: 212 },
      { ring: 'atlantic-island', x: 635, y: 216 },
      { ring: 'caribbean', x: 422, y: 362 },
      { ring: 'french-guiana', x: 451, y: 425 },
    ];
    const franceGroups = groupFlagLandmasses('fra', rings, 1_280, { x: 649, y: 212 });

    expect(franceGroups.map((group) => group.map((entry) => entry.ring))).toEqual([
      ['mainland', 'atlantic-island'],
      ['caribbean', 'french-guiana'],
    ]);
    expect(franceGroups.flat()).toHaveLength(rings.length);
    expect(groupFlagLandmasses('deu', rings, 1_280, { x: 649, y: 212 })).toHaveLength(1);
  });
});
