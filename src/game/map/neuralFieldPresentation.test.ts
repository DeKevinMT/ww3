import { describe, expect, it } from 'vitest';
import {
  NEURAL_FIELD_PULSE_DURATION_MS,
  apexFieldPresentationActive,
  apexProjectionPresentations,
  apexShieldPresentation,
  createNeuralFieldPulseSample,
  neuralDomeShellElevation,
  neuralDomeSpokeElevation,
  neuralFieldCoverageGeometrySignature,
  neuralFieldModePresentation,
  neuralFieldRouteGeometrySignature,
  neuralFieldRouteSegment,
  resolveNeuralFieldPulseTarget,
  sampleNeuralFieldPulse,
} from './neuralFieldPresentation';
import type { WorldMapEngineContract } from './bridge';

function activationEngine(
  scenarioId: string,
  activated: boolean | undefined,
  atWar = false,
): WorldMapEngineContract {
  return {
    content: { metadata: { scenarioId }, territories: {} },
    viewerKnowledge: {
      chartedTerritoryIds: [],
      apexFieldActivated: activated,
    },
    state: {
      humanPlayerId: 'gnb',
      wars: atWar ? [{ attackerId: 'gnb', defenderId: 'sen' }] : [],
    },
  } as unknown as WorldMapEngineContract;
}

describe('digital APEX/PRIME field presentation', () => {
  it('rebuilds dome and route geometry only when their authored placement changes', () => {
    const stationary = {
      id: 'human',
      role: 'apex' as const,
      force: { locationId: 'grl', army: { power: 60 }, front: 'isl' },
      moving: false,
      recovering: false,
      fieldOperational: true,
      fieldIntensity: 1,
      routeVisible: false,
      routePath: ['grl'],
      routeProgress: 0,
      tick: 10,
    };
    const coverage = neuralFieldCoverageGeometrySignature([stationary]);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      force: { ...stationary.force, army: { power: 9_999 }, front: 'can' },
      routeProgress: 0.94,
      tick: 500,
    }])).toBe(coverage);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      force: { ...stationary.force, locationId: 'isl' },
    }])).not.toBe(coverage);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      moving: true,
      routeVisible: true,
      routePath: ['grl', 'isl'],
    }])).not.toBe(coverage);
    const offlineCoverage = neuralFieldCoverageGeometrySignature([{
      ...stationary,
      recovering: true,
      fieldOperational: false,
      fieldIntensity: 0.10,
    }]);
    expect(offlineCoverage).not.toBe(coverage);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      recovering: true,
      fieldOperational: false,
      fieldIntensity: 0.90,
    }])).toBe(offlineCoverage);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      fieldIntensity: 0.98,
    }])).toBe(coverage);
    expect(neuralFieldCoverageGeometrySignature([{
      ...stationary,
      fieldIntensity: 0.70,
    }])).not.toBe(coverage);

    const transit = {
      ...stationary,
      moving: true,
      routeVisible: true,
      routePath: ['grl', 'isl', 'gbr'],
    };
    const route = neuralFieldRouteGeometrySignature([transit]);
    expect(neuralFieldRouteGeometrySignature([{
      ...transit,
      routeProgress: 0.91,
      tick: 999,
      force: { ...transit.force, army: { power: 2 } },
    }])).toBe(route);
    expect(neuralFieldRouteGeometrySignature([{
      ...transit,
      routePath: ['grl', 'can'],
    }])).not.toBe(route);
    expect(neuralFieldRouteGeometrySignature([{ ...transit, routeVisible: false }])).toBe('');
  });

  it('keeps a territory field idle and collapses it into one transit stream', () => {
    expect(neuralFieldModePresentation(false)).toEqual({
      fieldVisible: true,
      routeVisible: false,
      signalNodeVisible: false,
      recoveryField: false,
      intensity: 1,
    });
    expect(neuralFieldModePresentation(true)).toEqual({
      fieldVisible: false,
      routeVisible: true,
      signalNodeVisible: true,
      recoveryField: false,
      intensity: 0.82,
    });
    expect(neuralFieldModePresentation(false, true)).toEqual({
      fieldVisible: true,
      routeVisible: false,
      signalNodeVisible: false,
      recoveryField: true,
      intensity: 0.38,
    });
    expect(neuralFieldModePresentation(false, true, false)).toEqual({
      fieldVisible: false,
      routeVisible: false,
      signalNodeVisible: false,
      recoveryField: false,
      intensity: 0,
    });
    // A non-exhausted in-transit APEX keeps its canonical journey visual even
    // if its destination mission is recovery; no stationary field is implied.
    expect(neuralFieldModePresentation(true, true, false)).toEqual({
      fieldVisible: false,
      routeVisible: true,
      signalNodeVisible: true,
      recoveryField: false,
      intensity: 0.82,
    });
  });

  it('presents active APEX strength only as bounded neural-shield Energy', () => {
    const force = (integrity: number, maxIntegrity: number, mission = 'standby') => ({
      mission,
      shield: {
        integrity,
        maxIntegrity,
        rechargeBuffer: 0,
        rechargeMultiplier: 1,
        attackMultiplier: 1.1,
        defenseMultiplier: 1.1,
        pulseAttack: 0.001,
      },
    });
    expect(apexShieldPresentation(force(1, 1))).toEqual({
      integrity: 1,
      percent: 100,
      visible: true,
      label: 'APEX 100%',
    });
    expect(apexShieldPresentation(force(0.42, 1))).toEqual({
      integrity: 0.42,
      percent: 42,
      visible: true,
      label: 'APEX 42%',
    });
    expect(apexShieldPresentation(force(0, 1))).toMatchObject({
      integrity: 0,
      percent: 0,
      visible: false,
      label: '',
    });
    expect(apexShieldPresentation(force(0.0001, 0.001, 'hq-training'))).toMatchObject({
      percent: 10,
      visible: false,
      label: '',
    });
    expect(apexShieldPresentation(force(1, 1, 'evacuate'))).toMatchObject({
      percent: 100,
      visible: false,
      label: '',
    });
    // PRIME does not use the viewer APEX gate: its rebuilding field remains.
    expect(neuralFieldModePresentation(false, true, true)).toMatchObject({
      fieldVisible: true,
      recoveryField: true,
      intensity: 0.38,
    });
  });

  it('ignores retired split sidecars and renders one legacy anchor for the grid', () => {
    const force = {
      playerId: 'gnb',
      headquartersId: 'gnb',
      locationId: 'sen',
      mission: 'assault-support',
      front: 'mrt',
      shield: {
        integrity: 0.73,
        maxIntegrity: 1,
        rechargeBuffer: 0,
        rechargeMultiplier: 1,
        attackMultiplier: 1.1,
        defenseMultiplier: 1.1,
        pulseAttack: 0.001,
      },
      economy: { treasury: 0, annualOutput: 0, supplyStock: 0 },
      transit: null,
      doctrineRuntime: {
        lancerSupportedAssaultCount: 2,
        secondaryProjection: {
          locationId: 'gin',
          mission: 'defense' as const,
          front: { warId: 'war-2', sourceId: 'sle', targetId: 'gin' },
        },
      },
    };
    const projections = apexProjectionPresentations(force);
    expect(projections).toHaveLength(1);
    expect(projections.map((entry) => entry.locationId)).toEqual(['sen']);
    expect(projections.map((entry) => entry.combatShare)).toEqual([1]);
    expect(projections.map((entry) => entry.percent)).toEqual([73]);
    expect(projections.map((entry) => entry.label)).toEqual(['APEX 73% · ◆']);
    expect(projections.every((entry) => entry.split === false)).toBe(true);
    expect(projections.every((entry) => entry.singularityCharged)).toBe(true);

    expect(apexProjectionPresentations({
      ...force,
      doctrineRuntime: {
        ...force.doctrineRuntime,
        secondaryProjection: {
          ...force.doctrineRuntime.secondaryProjection,
          locationId: 'sen',
        },
      },
    })).toHaveLength(1);
    expect(apexProjectionPresentations({
      ...force,
      mission: 'hq-training',
    })).toEqual([]);
  });

  it('emits one finite deterministic convergence pulse without idle activity', () => {
    const first = createNeuralFieldPulseSample();
    const second = createNeuralFieldPulseSample();
    expect(sampleNeuralFieldPulse(-1, false, first)).toMatchObject({
      active: false,
      convergenceOpacity: 0,
      fieldScale: 1,
    });
    const elapsed = NEURAL_FIELD_PULSE_DURATION_MS * 0.4;
    expect(sampleNeuralFieldPulse(elapsed, false, first))
      .toEqual(sampleNeuralFieldPulse(elapsed, false, second));
    expect(first.active).toBe(true);
    expect(first.convergenceOpacity).toBeGreaterThan(0.7);
    expect(first.fieldBoost).toBeGreaterThan(0);
    expect(first.singularityOpacity).toBeGreaterThan(0);
    sampleNeuralFieldPulse(NEURAL_FIELD_PULSE_DURATION_MS * 0.7, false, first);
    expect(first.returnProgress).toBeGreaterThan(0);
    expect(first.returnOpacity).toBeGreaterThan(0);
    expect(sampleNeuralFieldPulse(NEURAL_FIELD_PULSE_DURATION_MS, false, first))
      .toMatchObject({
        active: false,
        convergenceOpacity: 0,
        contactOpacity: 0,
        returnOpacity: 0,
        singularityOpacity: 0,
      });
  });

  it('requires a canonical participant and its exact assigned front', () => {
    const event = {
      sourceId: 'gnb',
      targetId: 'sen',
      commanderAttackerId: 'gnb',
      commanderDefenderId: null,
    };
    expect(resolveNeuralFieldPulseTarget(event, new Set(['gnb']), 'sen')).toEqual({
      fieldTerritoryId: 'gnb',
      routeSourceId: 'gnb',
      routeTargetId: 'sen',
      interceptsIncoming: false,
      ability: 'standard',
      counterpulseDamage: 0,
      projection: null,
    });
    expect(resolveNeuralFieldPulseTarget(event, new Set(['gnb']), 'mrt')).toBeUndefined();
    expect(resolveNeuralFieldPulseTarget(event, new Set(['rai']), 'sen')).toBeUndefined();

    expect(resolveNeuralFieldPulseTarget({
      ...event,
      commanderAttackerId: null,
      commanderDefenderId: 'gnb',
    }, new Set(['gnb']), 'sen')).toEqual({
      fieldTerritoryId: 'sen',
      routeSourceId: 'gnb',
      routeTargetId: 'sen',
      interceptsIncoming: true,
      ability: 'standard',
      counterpulseDamage: 0,
      projection: null,
    });

    expect(resolveNeuralFieldPulseTarget({
      ...event,
      commanderDefenderId: 'gnb',
      commanderAttackerId: null,
      commanderDefenderCounterpulseDamage: 0.025,
      commanderDefenderProjection: 'secondary',
    }, new Set(['gnb']), 'sen')).toMatchObject({
      ability: 'mirror',
      counterpulseDamage: 0.025,
      projection: 'secondary',
    });
    expect(resolveNeuralFieldPulseTarget({
      ...event,
      commanderAttackerSingularityPulse: true,
      commanderAttackerProjection: 'primary',
    }, new Set(['gnb']), 'sen')).toMatchObject({
      ability: 'singularity',
      projection: 'primary',
    });
  });

  it('samples every canonical waypoint and is stable across pause or reload', () => {
    expect(neuralFieldRouteSegment(0, 4)).toEqual({ segmentIndex: 0, segmentProgress: 0 });
    expect(neuralFieldRouteSegment(0.5, 4)).toEqual({ segmentIndex: 1, segmentProgress: 0.5 });
    expect(neuralFieldRouteSegment(0.5, 4)).toEqual(neuralFieldRouteSegment(0.5, 4));
    expect(neuralFieldRouteSegment(1, 4)).toEqual({ segmentIndex: 2, segmentProgress: 1 });
  });

  it('rises from a border foot into a deterministic spherical cap', () => {
    expect(neuralDomeSpokeElevation(0.4, 0)).toBe(0);
    expect(neuralDomeSpokeElevation(0.4, 0.5)).toBeGreaterThan(0.25);
    expect(neuralDomeSpokeElevation(0.4, 1)).toBeCloseTo(0.4, 8);
    expect(neuralDomeShellElevation(0.4, 0)).toBeCloseTo(0.4, 8);
    expect(neuralDomeShellElevation(0.4, 0.5)).toBeGreaterThan(0.25);
    expect(neuralDomeShellElevation(0.4, 1)).toBeCloseTo(0, 8);
  });

  it('keeps the Campaign field hidden until this viewer resolves first-strike guidance', () => {
    expect(apexFieldPresentationActive(activationEngine('standard-2026', false))).toBe(false);
    expect(apexFieldPresentationActive(activationEngine('standard-2026', true))).toBe(true);
    // A loaded legacy Campaign without the new viewer projection may still
    // reveal a field once this exact human already has a war in its history.
    expect(apexFieldPresentationActive(
      activationEngine('standard-2026', undefined, true),
    )).toBe(true);
    expect(apexFieldPresentationActive(activationEngine('survival', undefined))).toBe(true);
    expect(apexFieldPresentationActive(activationEngine('random-world', undefined))).toBe(true);
  });
});
