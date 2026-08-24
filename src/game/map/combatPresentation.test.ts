import { describe, expect, it } from 'vitest';
import {
  combatPresentationDescriptor,
  combatRouteBendDirection,
  combatRouteSample,
  combatWorldUnits,
  resolveCombatPresentationAccess,
  sampleCombatRoute,
} from './combatPresentation';

describe('map combat presentation', () => {
  it('gives land and naval warfare different routes, markers, impacts, and palettes', () => {
    const land = combatPresentationDescriptor('land');
    const naval = combatPresentationDescriptor('naval');

    expect(land).toMatchObject({
      routeShape: 'ground-thrust',
      routePattern: 'solid',
      marker: 'armored-chevron',
      impact: 'ground-shock',
    });
    expect(naval).toMatchObject({
      routeShape: 'sea-arc',
      routePattern: 'dashed',
      marker: 'fleet',
      impact: 'sea-splash',
    });
    expect(naval.coreColor).not.toBe(land.coreColor);
    expect(naval.glowColor).not.toBe(land.glowColor);
    expect(land.glowWidth).toBeGreaterThan(naval.glowWidth);
  });

  it('honors canonical access and only uses the edge kind as a compatibility fallback', () => {
    expect(resolveCombatPresentationAccess('land', true)).toBe('land');
    expect(resolveCombatPresentationAccess('naval', false)).toBe('naval');
    expect(resolveCombatPresentationAccess(undefined, true)).toBe('naval');
    expect(resolveCombatPresentationAccess(undefined, false)).toBe('land');
  });

  it('keeps a ground thrust direct while giving sea warfare a pronounced arc', () => {
    const source = { x: 100, y: 200 };
    const target = { x: 500, y: 200 };
    const landMidpoint = combatRouteSample(source, target, 0.5, 'land');
    const navalMidpoint = combatRouteSample(source, target, 0.5, 'naval');

    expect(Math.abs(landMidpoint.y - 200)).toBeLessThanOrEqual(3);
    expect(Math.abs(navalMidpoint.y - 200)).toBeGreaterThan(20);
    expect(sampleCombatRoute(source, target, 'land')[0]).toMatchObject(source);
    expect(sampleCombatRoute(source, target, 'naval').at(-1)).toMatchObject(target);
  });

  it('keeps the persistent route and battle marker on one deterministic bend', () => {
    expect(combatRouteBendDirection('greenland', 'iceland')).toBe(1);
    expect(combatRouteBendDirection('iceland', 'greenland')).toBe(-1);
    expect(combatRouteBendDirection('greenland', 'iceland')).toBe(1);
  });

  it('preserves combat stroke width across desktop, mobile canvas scaling, and zoom', () => {
    const desiredCssPixels = 2;
    const desktopWorldUnits = combatWorldUnits(desiredCssPixels, 1, 1);
    const mobileWorldUnits = combatWorldUnits(desiredCssPixels, 1, 0.32);
    const zoomedMobileWorldUnits = combatWorldUnits(desiredCssPixels, 4, 0.32);

    expect(desktopWorldUnits).toBe(2);
    expect(mobileWorldUnits * 0.32).toBeCloseTo(desiredCssPixels, 8);
    expect(zoomedMobileWorldUnits * 4 * 0.32).toBeCloseTo(desiredCssPixels, 8);
    expect(mobileWorldUnits).toBeGreaterThan(desktopWorldUnits);
  });
});
