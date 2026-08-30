import { describe, expect, it, vi } from 'vitest';
import { COUNTRIES } from '../../data/worldMap';
import { ANTARCTICA_SECTOR_PRESENTATIONS } from '../mapGeographyPresentation';
import type { WorldMapEngineContract } from '../bridge';
import {
  classifyGlobePoliticalAtlasUpdate,
  captureGlobePoliticalPaintSnapshot,
  globeCountryPickId,
  globeFlagRingPolicy,
  globeFlagProjectionKey,
  globePoliticalStateSignature,
  globeTerritoryFlagCountryId,
  globeTerritoryFlagOwnerId,
  globeTerritoryIsIntegrating,
  globeTextureSelectionSignature,
  type GlobePoliticalPaintSnapshot,
} from './globeTexture';
import {
  GlobeAtlasTrailingRedrawBatch,
  REALM_EXPANSION_ATLAS_MAX_LATENCY_MS,
  REALM_EXPANSION_ATLAS_SETTLE_MS,
} from './globeAtlasRedrawBatch';
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
    surfaceSignature = 'dormant',
  ): GlobePoliticalPaintSnapshot => ({ humanSignature, surfaceSignature, territories });
  const coreState = (ownerId: string) => ({
    ownerId,
    coreOwnerId: ownerId,
    integrating: false,
    flagOwnerId: ownerId,
    transitOnly: false,
  });

  it('uses a local atlas update only for strict new captures', () => {
    const before = politicalSnapshot({ a: coreState('a'), c: coreState('c') });
    const after = politicalSnapshot({
      a: { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a', transitOnly: false },
      c: coreState('c'),
    });

    expect(classifyGlobePoliticalAtlasUpdate(undefined, before)).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(before, before)).toEqual({ kind: 'none' });
    expect(classifyGlobePoliticalAtlasUpdate(before, after)).toEqual({
      kind: 'capture',
      territoryIds: ['a'],
    });
  });

  it('treats an account flag change as one full political repaint', () => {
    const fixture = textureEngine();
    const countryId = COUNTRIES[0]!.id;
    fixture.state.territories[countryId] = {
      ...fixture.state.territories[countryId]!,
      ownerId: 'owner-a',
      coreOwnerId: 'owner-a',
      integration: 1,
    };
    let flagCountryId = 'grl';
    const engine: WorldMapEngineContract = {
      ...fixture.engine,
      player: (playerId) => playerId === 'owner-a' ? {
        id: 'owner-a', name: 'Human Empire', color: 0x71e9ff, cssColor: '#71e9ff',
        sigil: 'AX', capitalId: countryId, isHuman: true, flagCountryId,
      } : undefined,
    };
    const beforeSignature = globePoliticalStateSignature(engine);
    const before = captureGlobePoliticalPaintSnapshot(engine);
    expect(globeTerritoryFlagCountryId(engine, fixture.state.territories[countryId]!))
      .toBe('grl');

    flagCountryId = 'jpn';
    const after = captureGlobePoliticalPaintSnapshot(engine);
    expect(globePoliticalStateSignature(engine)).not.toBe(beforeSignature);
    expect(globeTerritoryFlagCountryId(engine, fixture.state.territories[countryId]!))
      .toBe('jpn');
    expect(classifyGlobePoliticalAtlasUpdate(before, after)).toEqual({ kind: 'full' });
  });

  it('batches simultaneous captures into one local atlas update', () => {
    const before = politicalSnapshot({ a: coreState('a'), c: coreState('c') });
    const after = politicalSnapshot({
      a: { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a', transitOnly: false },
      c: { ownerId: 'b', coreOwnerId: 'c', integrating: true, flagOwnerId: 'c', transitOnly: false },
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
    const capture = { ownerId: 'b', coreOwnerId: 'a', integrating: true, flagOwnerId: 'a', transitOnly: false };
    expect(classifyGlobePoliticalAtlasUpdate(
      before,
      politicalSnapshot(before.territories, 'different-human-set'),
    )).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(
      before,
      politicalSnapshot(before.territories, 'human', 'contact:available'),
    )).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(
      politicalSnapshot({ a: capture, c: coreState('c') }),
      politicalSnapshot({
        a: { ownerId: 'b', coreOwnerId: 'a', integrating: false, flagOwnerId: 'b', transitOnly: false },
        c: coreState('c'),
      }),
    )).toEqual({ kind: 'full' });
    expect(classifyGlobePoliticalAtlasUpdate(
      before,
      politicalSnapshot({
        a: capture,
        c: { ownerId: 'd', coreOwnerId: 'd', integrating: false, flagOwnerId: 'd', transitOnly: false },
      }),
    )).toEqual({ kind: 'full' });
  });

  it('classifies Survival corridor captures as one settle-batched realm expansion', () => {
    const before = politicalSnapshot({
      a: coreState('a'),
      c: coreState('c'),
      d: coreState('d'),
    });
    const after = politicalSnapshot({
      a: {
        ownerId: 'rai', coreOwnerId: 'a', integrating: false,
        flagOwnerId: 'rai', transitOnly: true,
      },
      c: {
        ownerId: 'rai', coreOwnerId: 'c', integrating: false,
        flagOwnerId: 'rai', transitOnly: true,
      },
      d: coreState('d'),
    });

    expect(classifyGlobePoliticalAtlasUpdate(before, after)).toEqual({
      kind: 'realm-expansion',
      territoryIds: ['a', 'c'],
    });
  });

  it('collapses a Rogue capture burst from twelve atlas redraws to one', () => {
    vi.useFakeTimers();
    try {
      const batch = new GlobeAtlasTrailingRedrawBatch();
      let redrawCount = 0;
      for (let capture = 0; capture < 12; capture += 1) {
        batch.schedule(() => { redrawCount += 1; });
        vi.advanceTimersByTime(100);
      }
      expect(redrawCount).toBe(0);
      vi.advanceTimersByTime(REALM_EXPANSION_ATLAS_SETTLE_MS);
      expect(redrawCount).toBe(1);
      expect(batch.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds atlas latency even when captures never leave a quiet window', () => {
    vi.useFakeTimers();
    try {
      const batch = new GlobeAtlasTrailingRedrawBatch();
      let redrawCount = 0;
      const captureCadence = REALM_EXPANSION_ATLAS_SETTLE_MS - 1;
      batch.schedule(() => { redrawCount += 1; });
      for (let elapsed = 0; elapsed + captureCadence < REALM_EXPANSION_ATLAS_MAX_LATENCY_MS;) {
        vi.advanceTimersByTime(captureCadence);
        elapsed += captureCadence;
        batch.schedule(() => { redrawCount += 1; });
      }
      vi.advanceTimersByTime(REALM_EXPANSION_ATLAS_MAX_LATENCY_MS);
      expect(redrawCount).toBe(1);
      expect(batch.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending realm upload when the globe texture is destroyed', () => {
    vi.useFakeTimers();
    try {
      const batch = new GlobeAtlasTrailingRedrawBatch();
      let redrawCount = 0;
      batch.schedule(() => { redrawCount += 1; });
      batch.cancel();
      vi.advanceTimersByTime(REALM_EXPANSION_ATLAS_SETTLE_MS);
      expect(redrawCount).toBe(0);
      expect(batch.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps realm ownership eventually visible through the safe full-atlas path', () => {
    const syncBody = globeTextureSource.slice(
      globeTextureSource.indexOf('sync(engine:'),
      globeTextureSource.indexOf('waitForReady()'),
    );
    const batchBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private queueRealmExpansionRedraw()'),
      globeTextureSource.indexOf('private queueTextureUpload()'),
    );
    expect(syncBody).toContain("if (update.kind === 'realm-expansion')");
    expect(syncBody).toContain('this.queueRealmExpansionRedraw();');
    expect(batchBody).toContain('this.redraw();');
    expect(batchBody).toContain('this.resolveMapReadinessAfterBatch();');
    expect(globeTextureSource).toContain('this.realmExpansionRedrawBatch.cancel();');
  });

  it('keeps transient war, APEX-route and detected-logistics visibility out of the political atlas', () => {
    const warCase = textureEngine();
    const countryId = COUNTRIES[0]!.id;
    const remoteId = COUNTRIES[1]!.id;
    warCase.state.territories[remoteId] = {
      ...warCase.state.territories[countryId]!,
      id: remoteId,
      ownerId: 'remote',
      coreOwnerId: 'remote',
      integration: 1,
    };
    const beforeWarSignature = globePoliticalStateSignature(warCase.engine);
    const beforeWar = captureGlobePoliticalPaintSnapshot(warCase.engine);
    warCase.state.wars.push({
      id: 'war:owner-a:remote',
      attackerId: 'owner-a',
      defenderId: 'remote',
      attackerOperations: [{
        commanderId: 'owner-a', sourceId: countryId, targetId: remoteId,
        doctrine: 'advance', momentum: 0,
      }],
      defenderOperations: [],
    });
    expect(globePoliticalStateSignature(warCase.engine)).toBe(beforeWarSignature);
    expect(classifyGlobePoliticalAtlasUpdate(
      beforeWar,
      captureGlobePoliticalPaintSnapshot(warCase.engine),
    )).toEqual({ kind: 'none' });

    const apexCase = textureEngine();
    const beforeApexSignature = globePoliticalStateSignature(apexCase.engine);
    const beforeApex = captureGlobePoliticalPaintSnapshot(apexCase.engine);
    apexCase.state.commanderForces = {
      'owner-a': {
        playerId: 'owner-a', headquartersId: countryId, locationId: countryId,
        mission: 'redeploying', front: null,
        army: { manpower: 1, capacity: 1, trainedReserves: 0, baseAttack: 1, baseDefense: 1 },
        economy: { treasury: 1, annualOutput: 1, supplyStock: 1 },
        transit: { path: [countryId, remoteId], departTick: 1, arriveTick: 5 },
      },
    };
    expect(globePoliticalStateSignature(apexCase.engine)).toBe(beforeApexSignature);
    expect(classifyGlobePoliticalAtlasUpdate(
      beforeApex,
      captureGlobePoliticalPaintSnapshot(apexCase.engine),
    )).toEqual({ kind: 'none' });

    const logisticsCase = textureEngine();
    const beforeLogisticsSignature = globePoliticalStateSignature(logisticsCase.engine);
    const beforeLogistics = captureGlobePoliticalPaintSnapshot(logisticsCase.engine);
    logisticsCase.state.logisticsMovements.push({
      playerId: 'rai', sourceId: remoteId, targetId: countryId,
      manpower: 1, capacity: 1, access: 'naval',
    });
    // GlobeTexture.sync exits before redraw/upload when this signature is stable.
    expect(globePoliticalStateSignature(logisticsCase.engine)).toBe(beforeLogisticsSignature);
    expect(classifyGlobePoliticalAtlasUpdate(
      beforeLogistics,
      captureGlobePoliticalPaintSnapshot(logisticsCase.engine),
    )).toEqual({ kind: 'none' });
  });

  it('still invalidates the political atlas for durable veil changes', () => {
    const chartedCase = textureEngine();
    chartedCase.engine.viewerKnowledge = { chartedTerritoryIds: [] };
    const beforeCharting = captureGlobePoliticalPaintSnapshot(chartedCase.engine);
    chartedCase.engine.viewerKnowledge = {
      chartedTerritoryIds: [COUNTRIES[0]!.id],
    };
    expect(classifyGlobePoliticalAtlasUpdate(
      beforeCharting,
      captureGlobePoliticalPaintSnapshot(chartedCase.engine),
    )).toEqual({ kind: 'full' });

    const blackoutCase = textureEngine();
    blackoutCase.engine.content = { metadata: { scenarioId: 'standard-2026' } };
    blackoutCase.engine.viewerKnowledge = {
      communicationsBlackoutActive: false,
    };
    const beforeBlackout = captureGlobePoliticalPaintSnapshot(blackoutCase.engine);
    blackoutCase.engine.viewerKnowledge = {
      communicationsBlackoutActive: true,
    };
    expect(classifyGlobePoliticalAtlasUpdate(
      beforeBlackout,
      captureGlobePoliticalPaintSnapshot(blackoutCase.engine),
    )).toEqual({ kind: 'full' });
  });

  it('uses mainland-only flags for overseas-heavy European countries', () => {
    expect(globeFlagRingPolicy('fra')).toBe('principal-only');
    expect(globeFlagRingPolicy('prt')).toBe('principal-only');
    expect(globeFlagRingPolicy('nld')).toBe('principal-only');
    expect(globeFlagRingPolicy('chl')).toBe('principal-only');
    expect(globeFlagRingPolicy('idn')).toBe('all-territory');
    expect(globeFlagRingPolicy('usa')).toBe('all-territory');
  });

  it('never repaints real high-Arctic land as white ice after owner projection', () => {
    expect(globeTextureSource).not.toContain('iceRings');
    expect(globeTextureSource).not.toContain("context.fillStyle = 'rgba(218, 239, 242, 0.96)'");
    expect(globeTextureSource).toContain("export type GlobeFlagRingPolicy = 'all-territory' | 'principal-only';");
    expect(globeTextureSource).toContain(': rings;');
    expect(globeTextureSource).not.toMatch(/traceArcticIce|drawArcticIce|ARCTIC_ICE_COASTLINE/);
    expect(globeTextureSource).toContain('traceNorthPoleResearchSite(this.pickContext');
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

  it('renders Survival supply corridors as held territory, never a fake integration', () => {
    const corridor = {
      ownerId: 'human',
      coreOwnerId: 'former-owner',
      integration: 0,
      transitOnly: true,
    };
    expect(globeTerritoryIsIntegrating(corridor)).toBe(false);
    expect(globeTerritoryFlagOwnerId(corridor)).toBe('human');
    expect(globeFlagProjectionKey('sen', corridor)).toBe('realm:human');
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

  it('projects every completed Rogue AI territory as one sovereign empire flag', () => {
    const occupied = {
      ownerId: 'rai',
      coreOwnerId: 'former-owner',
      integration: 1,
    };
    expect(globeFlagProjectionKey('bel', occupied)).toBe('realm:rai');
    expect(globeFlagProjectionKey('nld', occupied)).toBe('realm:rai');
    expect(globeFlagProjectionKey('bel', occupied))
      .toBe(globeFlagProjectionKey('nld', occupied));
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

  it('invalidates the atlas for Antarctic revelation, status and conquest', () => {
    const { engine, state } = textureEngine();
    const sector = ANTARCTICA_SECTOR_PRESENTATIONS[0]!;
    state.territories[sector.id] = {
      id: sector.id,
      ownerId: 'rai',
      coreOwnerId: 'rai',
      integration: 1,
      army: {
        manpower: 5,
        capacity: 8,
        combatStrength: 5,
        power: 12,
        attack: 1,
        defense: 1,
      },
    };
    const dormant = globePoliticalStateSignature(engine);
    state.polarEndgame = {
      phase: 'contact',
      visualRevision: 1,
      sectors: {
        [sector.id]: { status: 'available', integrity: 100, wave: 1 },
      },
    };
    const revealed = globePoliticalStateSignature(engine);
    expect(revealed).not.toBe(dormant);

    state.polarEndgame.sectors[sector.id]!.integrity = 42;
    state.polarEndgame.visualRevision += 1;
    expect(globePoliticalStateSignature(engine)).toBe(revealed);

    state.polarEndgame.sectors[sector.id]!.status = 'contested';
    const contested = globePoliticalStateSignature(engine);
    expect(contested).not.toBe(revealed);

    state.territories[sector.id]!.ownerId = 'owner-a';
    state.territories[sector.id]!.integration = 0.1;
    expect(globePoliticalStateSignature(engine)).not.toBe(contested);
  });

  it('projects Antarctic ownership over the preserved ice surface', () => {
    const polarBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawAntarcticTerritories('),
      globeTextureSource.indexOf('private redraw(): void'),
    );
    expect(polarBody).toContain('traceAntarctica(context, width, height);');
    expect(polarBody).toContain('context.clip();');
    expect(polarBody).toContain('`antarctica:${globeFlagProjectionKey');
    expect(polarBody).toContain('drawFlagIntoProjection(');
    expect(polarBody).toContain('drawIntegrationOverlay(');
    expect(globeTextureSource).toContain('this.drawAntarcticTerritories(');
  });

  it('never paints black intelligence fog over dormant or awakened Antarctica', () => {
    const fogBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawApexIntelligenceFog('),
      globeTextureSource.indexOf('private redraw(): void'),
    );
    expect(fogBody).toContain('ordinary unmarked ice');
    expect(fogBody).toContain('PREPARED_COUNTRIES.map');
    expect(fogBody).not.toContain('PREPARED_ANTARCTICA_SECTORS.map');
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
