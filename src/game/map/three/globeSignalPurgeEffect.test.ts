import { describe, expect, it } from 'vitest';
import type { GlobeSignalPurgePresentation } from '../globeSignalPurgePresentation';
import {
  GlobeSignalPurgeEffect,
  SIGNAL_PURGE_MAX_LINE_VERTICES,
  SIGNAL_PURGE_MAX_POINT_VERTICES,
} from './globeSignalPurgeEffect';

function presentation(
  territories: readonly { territoryId: string; progress: number }[],
): GlobeSignalPurgePresentation {
  return {
    active: territories.length > 0,
    territories: territories.map((territory) => ({
      ...territory,
      percent: Math.round(territory.progress * 100),
    })),
    topologySignature: territories.length > 0
      ? `signal-purge:${territories.map((territory) => territory.territoryId).sort().join(',')}`
      : 'signal-purge:off',
  };
}

describe('pooled 3D Signal Purge effect', () => {
  it('builds a curved surface front with sparse elevated filaments in two draw calls', () => {
    const effect = new GlobeSignalPurgeEffect(5, false);
    effect.sync(presentation([{ territoryId: 'grl', progress: 0.38 }]), 100);
    const diagnostics = effect.diagnostics();
    expect(diagnostics.activeTerritories).toBe(1);
    expect(diagnostics.lineVertices).toBeGreaterThan(30);
    expect(diagnostics.pointVertices).toBeGreaterThan(0);
    expect(diagnostics.elevatedVertices).toBeGreaterThan(0);
    expect(diagnostics.drawCalls).toBe(2);
    expect(diagnostics.lineVertices).toBeLessThanOrEqual(SIGNAL_PURGE_MAX_LINE_VERTICES);
    expect(diagnostics.pointVertices).toBeLessThanOrEqual(SIGNAL_PURGE_MAX_POINT_VERTICES);
    effect.dispose();
  });

  it('does not rebuild topology when only weekly purge progress changes', () => {
    const effect = new GlobeSignalPurgeEffect(5, false);
    effect.sync(presentation([{ territoryId: 'gnb', progress: 0.20 }]), 100);
    const before = effect.diagnostics();
    effect.sync(presentation([{ territoryId: 'gnb', progress: 0.27 }]), 200);
    const after = effect.diagnostics();
    expect(after.topologyRebuilds).toBe(before.topologyRebuilds);
    expect(after.lineVertices).toBe(before.lineVertices);
    expect(after.pointVertices).toBe(before.pointVertices);
    effect.dispose();
  });

  it('rebuilds once when the purge set changes and cleanly goes dormant', () => {
    const effect = new GlobeSignalPurgeEffect(5, true);
    effect.sync(presentation([{ territoryId: 'gnb', progress: 0.20 }]), 100);
    const first = effect.diagnostics();
    effect.sync(presentation([
      { territoryId: 'gnb', progress: 0.24 },
      { territoryId: 'sen', progress: 0.10 },
    ]), 200);
    expect(effect.diagnostics().topologyRebuilds).toBe(first.topologyRebuilds + 1);
    effect.sync(presentation([]), 300);
    expect(effect.visible).toBe(false);
    expect(effect.diagnostics().drawCalls).toBe(0);
    effect.dispose();
  });
});

