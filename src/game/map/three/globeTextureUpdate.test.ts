import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../data/worldMap';
import type { WorldMapEngineContract } from '../bridge';
import {
  classifyGlobePoliticalAtlasUpdate,
  globeCountryPickId,
  globeFlagRingPolicy,
  globeFlagProjectionKey,
  globePoliticalStateSignature,
  globeTerritoryFlagOwnerId,
  globeTerritoryIsIntegrating,
  globeTextureSelectionSignature,
  type GlobePoliticalPaintSnapshot,
} from './globeTexture';
import globeTextureSource from './globeTexture.ts?raw';

function textureEngine(): {
  engine: WorldMapEngineContract;
  state: WorldMapEngineContract['state'];
} {
  const countryId = COUNTRIES[0]!.id;
  const state: WorldMapEngineContract['state'] = {
    tick: 1,
    humanPlayerId: 'owner-a',
    humanPlayerIds: ['owner-a'],
    openingMobilisations: {},
    territories: {
      [countryId]: {
        id: countryId,
        ownerId: 'owner-a',
        coreOwnerId: 'owner-b',
        integration: 0.101,
        army: {
          manpower: 1,
          capacity: 1,
          combatStrength: 1,
          power: 1,
          attack: 1,
          defense: 1,
        },
      },
    },
    wars: [],
    logisticsMovements: [],
  };
  const engine = {
    state,
    player: () => undefined,
    territoriesOf: () => [],
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  } satisfies WorldMapEngineContract;
  return { engine, state };
}

describe('globe political texture update cache', () => {
  const politicalSnapshot = (
    territories: GlobePoliticalPaintSnapshot['territories'],
    humanSignature = 'human',
  ): GlobePoliticalPaintSnapshot => ({ humanSignature, territories });
  const coreState = (ownerId: string) => ({
    ownerId,
    coreOwnerId: ownerId,
    integrating: false,
    flagOwnerId: ownerId,
  });

  it('uses a local atlas update only for strict new captures', () => {
    const before = politicalSnapshot({ a: coreState('a'), c: coreState('c') });
    const after = politicalSnapshot({
      a: { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a' },
      c: coreState('c'),
    });

    expect(classifyGlobePoliticalAtlasUpdate(undefined, before)).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(before, before)).toEqual({ kind: 'none' });
    expect(classifyGlobePoliticalAtlasUpdate(before, after)).toEqual({
      kind: 'capture',
      territoryIds: ['a'],
    });
  });

  it('batches simultaneous captures into one local atlas update', () => {
    const before = politicalSnapshot({ a: coreState('a'), c: coreState('c') });
    const after = politicalSnapshot({
      a: { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a' },
      c: { ownerId: 'b', coreOwnerId: 'c', integrating: true, flagOwnerId: 'c' },
    });
    expect(classifyGlobePoliticalAtlasUpdate(before, after)).toEqual({
      kind: 'capture',
      territoryIds: ['a', 'c'],
    });
  });

  it('never paints a second integration perimeter during the fast capture redraw', () => {
    const captureBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawCapturedTerritories('),
      globeTextureSource.indexOf('private drawCountries('),
    );
    expect(captureBody).not.toContain('context.stroke()');
    expect(captureBody).not.toContain('context.strokeStyle');
  });

  it('restores natural geography and terrain before the capture flag and integration', () => {
    const captureBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawCapturedTerritories('),
      globeTextureSource.indexOf('private drawCountries('),
    );
    const naturalBaseIndex = captureBody.indexOf('restoreNaturalEarthBaseIntoRings(');
    const terrainIndex = captureBody.indexOf('drawPreparedTerrainWash(');
    const flagIndex = captureBody.indexOf('drawFlagIntoProjection(');
    const integrationIndex = captureBody.indexOf('drawIntegrationOverlay(');
    expect(naturalBaseIndex).toBeGreaterThanOrEqual(0);
    expect(terrainIndex).toBeGreaterThan(naturalBaseIndex);
    expect(flagIndex).toBeGreaterThan(terrainIndex);
    expect(integrationIndex).toBeGreaterThan(flagIndex);
    expect(captureBody).toContain('prepared.rings,');
    expect(captureBody).not.toContain('drawGlobeMountainHillshade');
    expect(captureBody).not.toContain('drawGlobeSummitSnow');
  });

  it('falls back to a full redraw for every shared-projection or mixed change', () => {
    const before = politicalSnapshot({ a: coreState('a'), c: coreState('c') });
    const capture = { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a' };
    expect(classifyGlobePoliticalAtlasUpdate(
      before,
      politicalSnapshot(before.territories, 'different-human-set'),
    )).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(
      politicalSnapshot({ a: capture, c: coreState('c') }),
      politicalSnapshot({
        a: { ownerId: 'b', coreOwnerId: 'a', integrating: false, flagOwnerId: 'b' },
        c: coreState('c'),
      }),
    )).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(
      before,
      politicalSnapshot({
        a: capture,
        c: { ownerId: 'd', coreOwnerId: 'd', integrating: false, flagOwnerId: 'd' },
      }),
    )).toEqual({ kind: 'full' });
  });

  it('uses mainland-only flags for overseas-heavy European countries', () => {
    expect(globeFlagRingPolicy('fra')).toBe('principal-only');
    expect(globeFlagRingPolicy('prt')).toBe('principal-only');
    expect(globeFlagRingPolicy('nld')).toBe('principal-only');
    expect(globeFlagRingPolicy('chl')).toBe('principal-only');
    expect(globeFlagRingPolicy('idn')).toBe('all-non-ice');
    expect(globeFlagRingPolicy('usa')).toBe('all-non-ice');
  });

  it('keeps the original flag throughout integration and switches only on completion', () => {
    const territory = {
      ownerId: 'conqueror',
      coreOwnerId: 'original',
      integration: 0.42,
    };

    expect(globeTerritoryIsIntegrating(territory)).toBe(true);
    expect(globeTerritoryFlagOwnerId(territory)).toBe('original');
    expect(globeFlagProjectionKey('bel', territory)).toBe('integrating:bel');

    territory.integration = 0.999999;
    expect(globeTerritoryFlagOwnerId(territory)).toBe('original');

    territory.integration = 1;
    expect(globeTerritoryIsIntegrating(territory)).toBe(false);
    expect(globeTerritoryFlagOwnerId(territory)).toBe('conqueror');
    expect(globeFlagProjectionKey('bel', territory)).toBe('realm:conqueror');
  });

  it('groups every completed territory of an owner into one flag projection', () => {
    const completed = {
      ownerId: 'realm-owner',
      coreOwnerId: 'former-owner',
      integration: 1,
    };
    expect(globeFlagProjectionKey('bel', completed))
      .toBe(globeFlagProjectionKey('nld', completed));

    const integrating = { ...completed, integration: 0.99 };
    expect(globeFlagProjectionKey('bel', integrating))
      .not.toBe(globeFlagProjectionKey('nld', integrating));
  });

  it('assigns exact, widely spaced country pick colours', () => {
    const ids = COUNTRIES.map((_, index) => globeCountryPickId(index));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id > 0 && id < 0xff_ff_fe)).toBe(true);
    expect(ids.slice(1).every((id, index) => Math.abs(id - ids[index]!) > 255)).toBe(true);
  });

  it('ignores ordinary weekly simulation values that are not painted', () => {
    const { engine, state } = textureEngine();
    const countryId = COUNTRIES[0]!.id;
    const initial = globePoliticalStateSignature(engine);

    state.tick += 1;
    state.territories[countryId]!.army.power = 99;
    expect(globePoliticalStateSignature(engine)).toBe(initial);

    state.territories[countryId]!.integration = 0.104;
    expect(globePoliticalStateSignature(engine)).toBe(initial);
  });

  it('invalidates only for political changes and integration completion', () => {
    const { engine, state } = textureEngine();
    const countryId = COUNTRIES[0]!.id;
    const initial = globePoliticalStateSignature(engine);

    state.territories[countryId]!.integration = 0.106;
    expect(globePoliticalStateSignature(engine)).toBe(initial);
    state.territories[countryId]!.integration = 1;
    expect(globePoliticalStateSignature(engine)).not.toBe(initial);
    const completed = globePoliticalStateSignature(engine);

    state.territories[countryId]!.ownerId = 'owner-c';
    expect(globePoliticalStateSignature(engine)).not.toBe(completed);
  });

  it('normalises legal-target ordering and ignores non-texture hint targets', () => {
    const first = globeTextureSelectionSignature({
      sourceId: 'bel',
      targetId: 'nld',
      legalTargetIds: ['deu', 'fra'],
      hintTargetIds: ['lux'],
    });
    const second = globeTextureSelectionSignature({
      sourceId: 'bel',
      targetId: 'nld',
      legalTargetIds: ['fra', 'deu'],
      hintTargetIds: ['usa'],
    });
    expect(second).toBe(first);
  });

  it('never redraws the political texture for UI selection changes', () => {
    expect(globeTextureSource).toContain("private politicalSignature = '';");
    expect(globeTextureSource).toContain('if (!politicalChanged) return;');
    expect(globeTextureSource).toContain('this.ensureSnapshotFlags();');
    expect(globeTextureSource).not.toContain('private selectionSignature');
    const selectionSetter = globeTextureSource.slice(
      globeTextureSource.indexOf('setSelection(selection'),
      globeTextureSource.indexOf('pick(uvX'),
    );
    expect(selectionSetter).not.toContain('this.redraw()');
    expect(globeTextureSource).not.toContain("this.signature = '';");
  });

  it('resolves map readiness only after the natural base, every flag and the final batch redraw', () => {
    expect(globeTextureSource).toContain('private naturalBaseSettled = false;');
    expect(globeTextureSource).toContain('image.src = naturalEarthTextureUrl;');
    expect(globeTextureSource).toContain('if (!this.naturalBaseSettled');
    expect(globeTextureSource).toContain('private readonly pendingFlagLoads = new Set<string>();');
    expect(globeTextureSource).toContain('this.pendingFlagLoads.add(nationId);');
    expect(globeTextureSource).toContain('image.onload = () => this.finishFlagLoad(nationId);');
    expect(globeTextureSource).toContain('image.onerror = () => this.finishFlagLoad(nationId);');
    expect(globeTextureSource).toContain(
      'if (this.pendingFlagLoads.size === 0) this.queueRedraw();',
    );
    expect(globeTextureSource).toContain('this.pendingFlagLoads.size > 0');
    expect(globeTextureSource).toContain('|| this.redrawTimer !== undefined');
    expect(globeTextureSource).toContain('|| this.textureUploadFrame !== undefined');
    expect(globeTextureSource).toContain('|| this.textureUploadTimer !== undefined) return;');
    const batchBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private queueRedraw(): void'),
      globeTextureSource.indexOf('private drawCountries('),
    );
    expect(batchBody.indexOf('this.redraw();'))
      .toBeLessThan(batchBody.indexOf('this.resolveMapReadinessAfterBatch();'));
  });
});
