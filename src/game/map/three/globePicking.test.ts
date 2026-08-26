import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../data/worldMap';
import { resolveCountryPresentationAnchor } from '../countryPresentation';
import {
  MICROSTATE_PICK_MAX_ANGULAR_RADIUS_DEGREES,
  countryAngularRadiusDegrees,
  isMicrostatePickCandidate,
  microstateScreenPickRadius,
  nearestMicrostateScreenPick,
  type ProjectedMicrostatePickAnchor,
} from './globePicking';
import globeSceneSource from './ThreeGlobeScene.ts?raw';

function angularRadiusFor(countryId: string): number {
  const country = COUNTRIES.find((candidate) => candidate.id === countryId);
  if (!country) throw new Error(`Missing test country ${countryId}`);
  const anchor = resolveCountryPresentationAnchor(
    country.id,
    { x: country.label[0], y: country.label[1] },
    (longitude, latitude) => ({ x: longitude, y: latitude }),
  );
  return countryAngularRadiusDegrees([anchor.x, anchor.y], country.rings);
}

const desktopPick = {
  clientX: 100,
  clientY: 100,
  pointerType: 'mouse',
  cameraDistance: 14.5,
  viewportWidth: 1280,
  viewportHeight: 720,
} as const;

describe('bounded globe microstate picking', () => {
  it.each(['bhr', 'sgp'])('classifies %s for a presentation-anchor hit proxy', (countryId) => {
    expect(isMicrostatePickCandidate(angularRadiusFor(countryId))).toBe(true);
  });

  it('keeps nearby full-size countries out while retaining Bahrain competitor Qatar', () => {
    expect(isMicrostatePickCandidate(angularRadiusFor('qat'))).toBe(true);
    expect(isMicrostatePickCandidate(angularRadiusFor('sau'))).toBe(false);
    expect(isMicrostatePickCandidate(angularRadiusFor('mys'))).toBe(false);
    expect(isMicrostatePickCandidate(angularRadiusFor('idn'))).toBe(false);
  });

  it('chooses the closest visible anchor when Bahrain and Qatar proxies overlap', () => {
    const candidates: ProjectedMicrostatePickAnchor[] = [
      {
        territoryId: 'bhr',
        clientX: 100,
        clientY: 100,
        angularRadiusDegrees: angularRadiusFor('bhr'),
        frontFacing: true,
      },
      {
        territoryId: 'qat',
        clientX: 108,
        clientY: 101,
        angularRadiusDegrees: angularRadiusFor('qat'),
        frontFacing: true,
      },
    ];
    expect(nearestMicrostateScreenPick(candidates, { ...desktopPick, clientX: 101 }))
      .toBe('bhr');
    expect(nearestMicrostateScreenPick(candidates, { ...desktopPick, clientX: 107 }))
      .toBe('qat');
    expect(nearestMicrostateScreenPick(candidates, { ...desktopPick, clientX: 132 }))
      .toBeUndefined();
  });

  it('never resolves an anchor on the hidden hemisphere', () => {
    expect(nearestMicrostateScreenPick([{
      territoryId: 'sgp',
      clientX: desktopPick.clientX,
      clientY: desktopPick.clientY,
      angularRadiusDegrees: angularRadiusFor('sgp'),
      frontFacing: false,
    }], desktopPick)).toBeUndefined();
  });

  it('hard-bounds proxies by land size, zoom, viewport, pointer type and CSS pixels', () => {
    const bahrainRadius = angularRadiusFor('bhr');
    const mouseRadius = microstateScreenPickRadius(bahrainRadius, desktopPick);
    const touchRadius = microstateScreenPickRadius(bahrainRadius, {
      ...desktopPick,
      pointerType: 'touch',
    });
    expect(mouseRadius).toBeGreaterThan(0);
    expect(mouseRadius).toBeLessThanOrEqual(11);
    expect(touchRadius).toBeGreaterThan(mouseRadius);
    expect(touchRadius).toBeLessThanOrEqual(20);
    expect(microstateScreenPickRadius(
      MICROSTATE_PICK_MAX_ANGULAR_RADIUS_DEGREES + 0.01,
      desktopPick,
    )).toBe(0);
    expect(microstateScreenPickRadius(bahrainRadius, {
      ...desktopPick,
      cameraDistance: 15.01,
    })).toBe(0);
    expect(microstateScreenPickRadius(bahrainRadius, {
      ...desktopPick,
      viewportHeight: 239,
    })).toBe(0);
  });

  it('runs the cached anchor fallback only after exact polygon picking fails', () => {
    const exactThenFallback = globeSceneSource.slice(
      globeSceneSource.indexOf('private pickAtPoint'),
      globeSceneSource.indexOf('private globeUvAtPoint'),
    );
    expect(exactThenFallback.indexOf('this.globeTexture.pick(uv.x, uv.y)'))
      .toBeLessThan(exactThenFallback.indexOf('this.nearestMicrostateCountryPick(event)'));
    expect(exactThenFallback).toContain('if (exactPick || !allowMicrostateHitProxy) return exactPick');

    const projectionCache = globeSceneSource.slice(
      globeSceneSource.indexOf('private projectedMicrostatePickAnchors'),
      globeSceneSource.indexOf('private projectCoordinates'),
    );
    expect(projectionCache).toContain('this.microstatePickProjectionCache');
    expect(projectionCache).toContain('cached.cameraPosition.distanceToSquared(this.camera.position)');
    expect(projectionCache).toContain('for (const anchor of MICROSTATE_PICK_ANCHORS)');
    expect(projectionCache).not.toContain('for (const country of COUNTRIES)');
  });

  it('temporarily shows a quiet country nametag on hover and hides it after exit', () => {
    const labels = globeSceneSource.slice(
      globeSceneSource.indexOf('private updateLabels'),
      globeSceneSource.indexOf('private updatePolarCardPosition'),
    );
    expect(labels).toContain('label.id === this.hoveredTerritoryId');
    expect(labels).toContain("if (label.kind === 'country' && !label.persistent && !selected)");
    expect(labels).toContain('this.setLabelDisplayed(label, false)');
    expect(labels).toContain('this.setLabelDisplayed(label, true)');

    const clearHover = globeSceneSource.slice(
      globeSceneSource.indexOf('private clearHover'),
      globeSceneSource.indexOf('private focusPolarRegion'),
    );
    expect(clearHover).toContain('this.hoveredTerritoryId = undefined');
    expect(clearHover).toContain('this.labelsDirty = true');
  });
});
