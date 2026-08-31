import { describe, expect, it } from 'vitest';
import type {
  MapRogueAttentionStage,
  MapTerritoryState,
  WorldMapEngineContract,
} from './bridge';
import {
  APEX_INTELLIGENCE_FOG_STYLE,
  apexFogTerritoryPresentation,
  apexIntelligenceVisibilitySignature,
  apexTerritoryCharted,
  apexTerritoryHoverVisible,
  apexTerritoryIntelVisible,
  apexTerritoryMapClear,
  apexTerritoryNamecardVisible,
  apexTerritoryPoliticalIdentityVisible,
  selectApexIntelligenceVisibility,
} from './apexIntelligenceFog';
import worldMapSceneSourceRaw from './WorldMapScene.ts?raw';
import threeGlobeSceneSourceRaw from './three/ThreeGlobeScene.ts?raw';
import globeTextureSourceRaw from './three/globeTexture.ts?raw';
import worldUiSourceRaw from '../../ui/WorldUIV2.ts?raw';

const normalized = (source: string): string => source.replace(/\r\n/g, '\n');
const worldMapSceneSource = normalized(worldMapSceneSourceRaw);
const threeGlobeSceneSource = normalized(threeGlobeSceneSourceRaw);
const globeTextureSource = normalized(globeTextureSourceRaw);
const worldUiSource = normalized(worldUiSourceRaw);

function territory(id: string, ownerId: string): MapTerritoryState {
  return {
    id,
    ownerId,
    coreOwnerId: ownerId,
    integration: 1,
    army: {
      manpower: 1,
      capacity: 1,
      combatStrength: 1,
      power: 1,
      attack: 1,
      defense: 1,
    },
  };
}

function fogEngine(
  mode = 'standard-2026',
  communicationsBlackoutActive = mode === 'standard-2026',
): WorldMapEngineContract {
  const territories = {
    gnb: territory('gnb', 'gnb'),
    sen: territory('sen', 'sen'),
    usa: territory('usa', 'usa'),
    jpn: territory('jpn', 'jpn'),
    'drake-entry': territory('drake-entry', 'rai'),
  };
  return {
    content: {
      metadata: { scenarioId: mode },
      territories: {
        gnb: { connections: [{ targetId: 'sen' }] },
        sen: { connections: [{ targetId: 'gnb' }] },
        usa: { connections: [] },
        jpn: { connections: [] },
        'drake-entry': { connections: [] },
      },
    },
    viewerKnowledge: {
      chartedTerritoryIds: [],
      communicationsBlackoutActive,
      communicationsBlackoutTick: communicationsBlackoutActive ? 104 : null,
    },
    state: {
      tick: 1,
      humanPlayerId: 'gnb',
      humanPlayerIds: ['gnb', 'jpn'],
      openingMobilisations: {},
      territories,
      wars: [],
      logisticsMovements: [],
      commanderForces: {
        gnb: {
          playerId: 'gnb',
          headquartersId: 'gnb',
          locationId: 'gnb',
          mission: 'standby',
          front: null,
          army: { manpower: 1, capacity: 1, trainedReserves: 0, baseAttack: 1, baseDefense: 1 },
          economy: { treasury: 1, annualOutput: 1, supplyStock: 1 },
          transit: null,
        },
      },
    },
    player: (playerId) => ({
      id: playerId,
      name: playerId,
      color: 0,
      cssColor: '#000',
      sigil: '',
      capitalId: playerId,
      isHuman: playerId === 'gnb' || playerId === 'jpn',
    }),
    territoriesOf: (playerId) => Object.values(territories).filter((entry) => entry.ownerId === playerId),
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

function withRogueAttention(
  engine: WorldMapEngineContract,
  stage: MapRogueAttentionStage,
): WorldMapEngineContract {
  engine.state.polarEndgame = {
    phase: 'warning',
    visualRevision: 1,
    sectors: {},
    rogueAttention: { stage },
  };
  return engine;
}

describe('EONSCAR Intelligence Fog visibility', () => {
  it('reveals own territory and one actual strategic hop while keeping remote seats private', () => {
    const visibility = selectApexIntelligenceVisibility(fogEngine());
    expect(visibility.enabled).toBe(true);
    expect(visibility.visibleTerritoryIds).toEqual(new Set(['gnb', 'sen']));
    expect(visibility.clearTerritoryIds).toEqual(new Set(['gnb']));
    expect(visibility.frontierTerritoryIds).toEqual(new Set(['sen']));
    expect(apexTerritoryMapClear(visibility, 'gnb')).toBe(true);
    expect(apexTerritoryMapClear(visibility, 'sen')).toBe(false);
    expect(visibility.visibleTerritoryIds.has('usa')).toBe(false);
    expect(visibility.visibleTerritoryIds.has('jpn')).toBe(false);
  });

  it('keeps terrain readable and makes legal/frontier targets visually clear', () => {
    const visibility = selectApexIntelligenceVisibility(fogEngine());
    const own = apexFogTerritoryPresentation(visibility, 'gnb', 'gnb');
    const targetable = apexFogTerritoryPresentation(visibility, 'sen', 'sen');
    const unknown = apexFogTerritoryPresentation(visibility, 'usa', 'usa');

    expect(own).toMatchObject({ obscured: false, frontier: false, alpha: 0 });
    expect(targetable).toMatchObject({
      obscured: true,
      frontier: true,
      charted: false,
      alpha: APEX_INTELLIGENCE_FOG_STYLE.frontierAlpha,
      cloudAlpha: 0,
    });
    expect(targetable.alpha).toBe(0);
    expect(unknown).toMatchObject({
      obscured: true,
      frontier: false,
      alpha: 0.12,
      cloudAlpha: 0,
    });
    expect(unknown.alpha).toBeLessThan(0.2);
  });

  it('reveals viewer war fronts, the EONSCAR route and detected approaching Rogue logistics', () => {
    const engine = fogEngine();
    engine.state.wars = [{
      id: 'war:gnb:usa',
      attackerId: 'gnb',
      defenderId: 'usa',
      attackerOperations: [{ commanderId: 'gnb', sourceId: 'gnb', targetId: 'usa', doctrine: 'advance', momentum: 0 }],
      defenderOperations: [],
    }];
    engine.state.commanderForces!.gnb = {
      ...engine.state.commanderForces!.gnb!,
      locationId: 'sen',
      transit: { path: ['sen', 'usa'], departTick: 1, arriveTick: 10 },
    };
    engine.state.logisticsMovements = [{
      playerId: 'rai', sourceId: 'drake-entry', targetId: 'gnb', manpower: 1, capacity: 1, access: 'naval',
    }];
    const visibility = selectApexIntelligenceVisibility(engine);
    for (const territoryId of ['gnb', 'sen', 'usa', 'drake-entry']) {
      expect(visibility.visibleTerritoryIds.has(territoryId)).toBe(true);
    }
    expect(visibility.clearTerritoryIds).toEqual(new Set(['gnb', 'sen', 'usa']));
    expect(visibility.frontierTerritoryIds).toEqual(new Set(['drake-entry']));
    expect(visibility.detectedRogueRouteKeys.has('drake-entry:gnb')).toBe(true);
  });

  it('keys recomputation to topology/intel changes rather than weekly stats', () => {
    const engine = fogEngine();
    const before = apexIntelligenceVisibilitySignature(engine);
    engine.state.tick += 1;
    engine.state.territories.gnb!.army.power = 999;
    expect(apexIntelligenceVisibilitySignature(engine)).toBe(before);
    engine.state.territories.sen!.ownerId = 'gnb';
    expect(apexIntelligenceVisibilitySignature(engine)).not.toBe(before);
    expect(selectApexIntelligenceVisibility(engine).visibleTerritoryIds.has('usa')).toBe(false);
  });

  it('invalidates visibility when the actual strategic topology changes', () => {
    const engine = fogEngine();
    const before = apexIntelligenceVisibilitySignature(engine);
    engine.content!.territories!.gnb!.connections.push({ targetId: 'usa' });
    expect(apexIntelligenceVisibilitySignature(engine)).not.toBe(before);
    expect(selectApexIntelligenceVisibility(engine).visibleTerritoryIds.has('usa')).toBe(true);
  });

  it('keeps Alternative Universe fully clear and serious-mode terrain readable', () => {
    const alternative = selectApexIntelligenceVisibility(fogEngine('random-world'));
    expect(alternative.enabled).toBe(false);
    expect(alternative.visibleTerritoryIds.size).toBe(5);
    expect(apexFogTerritoryPresentation(alternative, 'usa', 'usa'))
      .toMatchObject({ obscured: false, alpha: 0, cloudAlpha: 0 });
    expect(APEX_INTELLIGENCE_FOG_STYLE.hiddenAlpha).toBe(0.12);
    expect(APEX_INTELLIGENCE_FOG_STYLE.rogueHiddenAlpha).toBe(0.16);
    expect(APEX_INTELLIGENCE_FOG_STYLE.chartedAlpha)
      .toBeLessThan(APEX_INTELLIGENCE_FOG_STYLE.hiddenAlpha);
    expect(APEX_INTELLIGENCE_FOG_STYLE.hiddenFill).not.toBe(APEX_INTELLIGENCE_FOG_STYLE.cloudTint);
    expect(APEX_INTELLIGENCE_FOG_STYLE.cloudAlpha).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.rogueCloudAlpha).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.reducedMotionDrift).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.cloudDriftPerSecond).toBe(0);
  });

  it('distinguishes hidden Rogue occupation without exposing live intelligence', () => {
    const visibility = selectApexIntelligenceVisibility(fogEngine());
    const independent = apexFogTerritoryPresentation(visibility, 'usa', 'usa');
    const rogue = apexFogTerritoryPresentation(visibility, 'jpn', 'rai');
    expect(independent).toMatchObject({
      obscured: true,
      charted: false,
      rogueOccupied: false,
      fill: APEX_INTELLIGENCE_FOG_STYLE.hiddenFill,
    });
    expect(rogue).toMatchObject({
      obscured: true,
      charted: false,
      rogueOccupied: true,
      fill: APEX_INTELLIGENCE_FOG_STYLE.rogueHiddenFill,
      alpha: APEX_INTELLIGENCE_FOG_STYLE.rogueHiddenAlpha,
      cloudAlpha: 0,
      dormantRogueAntarctic: false,
    });
    expect(independent.alpha).toBe(APEX_INTELLIGENCE_FOG_STYLE.hiddenAlpha);
    expect(rogue.fill).not.toBe(independent.fill);
    expect(Object.keys(rogue)).not.toEqual(expect.arrayContaining([
      'power', 'army', 'economy', 'readiness', 'routes',
    ]));
  });

  it('keeps Campaign clear before acknowledgement, then uses the light veil in Campaign and Survival', () => {
    const prologue = selectApexIntelligenceVisibility(fogEngine('standard-2026', false));
    expect(prologue.enabled).toBe(false);
    expect(prologue.visibleTerritoryIds.size).toBe(5);
    expect(apexFogTerritoryPresentation(prologue, 'usa', 'usa'))
      .toMatchObject({ obscured: false, alpha: 0, cloudAlpha: 0 });

    const blackout = selectApexIntelligenceVisibility(fogEngine('standard-2026', true));
    expect(blackout.enabled).toBe(true);
    expect(blackout.visibleTerritoryIds.has('usa')).toBe(false);
    expect(apexFogTerritoryPresentation(blackout, 'usa', 'usa'))
      .toMatchObject({ alpha: 0.12, cloudAlpha: 0 });
    expect(apexFogTerritoryPresentation(blackout, 'sen', 'sen'))
      .toMatchObject({ frontier: true, alpha: 0, cloudAlpha: 0 });

    const survival = selectApexIntelligenceVisibility(fogEngine('survival', false));
    expect(survival.enabled).toBe(true);
    expect(survival.rogueAntarcticaAwake).toBe(true);
    expect(survival.visibleTerritoryIds.has('usa')).toBe(false);
    expect(apexFogTerritoryPresentation(survival, 'usa', 'usa'))
      .toMatchObject({ alpha: 0.12, cloudAlpha: 0 });
    expect(apexFogTerritoryPresentation(survival, 'drake-entry', 'rai')).toMatchObject({
      dormantRogueAntarctic: false,
      alpha: 0.16,
      cloudAlpha: 0,
    });
  });

  it('keeps exact country information worldwide while limiting passive cards to top power', () => {
    for (const mode of ['standard-2026', 'survival']) {
      const visibility = selectApexIntelligenceVisibility(fogEngine(mode, true));
      expect(apexTerritoryIntelVisible(visibility, 'usa')).toBe(true);
      expect(apexTerritoryHoverVisible(visibility, 'usa')).toBe(true);
      expect(apexTerritoryPoliticalIdentityVisible(visibility, 'usa', 'usa')).toBe(true);
      expect(apexTerritoryPoliticalIdentityVisible(visibility, 'jpn', 'rai')).toBe(true);
      expect(apexTerritoryNamecardVisible(visibility, 'usa', 'usa', false)).toBe(false);
      expect(apexTerritoryNamecardVisible(visibility, 'usa', 'usa', true)).toBe(true);
    }
  });

  it('keeps dormant Antarctica visually clear while withholding machine identity', () => {
    for (const stage of ['dormant', 'observing'] as const) {
      const engine = withRogueAttention(fogEngine('standard-2026', true), stage);
      engine.content!.territories!.gnb!.connections.push({ targetId: 'drake-entry' });
      const visibility = selectApexIntelligenceVisibility(engine);
      expect(visibility.frontierTerritoryIds.has('drake-entry')).toBe(true);
      expect(visibility.rogueAntarcticaAwake).toBe(false);
      expect(apexTerritoryPoliticalIdentityVisible(
        visibility,
        'drake-entry',
        'rai',
      )).toBe(false);
      expect(apexTerritoryNamecardVisible(
        visibility,
        'drake-entry',
        'rai',
        true,
      )).toBe(false);
      expect(apexFogTerritoryPresentation(visibility, 'drake-entry', 'rai')).toMatchObject({
        frontier: true,
        dormantRogueAntarctic: true,
        alpha: 0,
        cloudAlpha: 0,
      });
    }

    const engine = withRogueAttention(fogEngine('standard-2026', true), 'observing');
    engine.content!.territories!.gnb!.connections.push({ targetId: 'drake-entry' });
    const before = apexIntelligenceVisibilitySignature(engine);
    for (const stage of ['mobilising', 'breach-imminent', 'active'] as const) {
      engine.state.polarEndgame = {
        ...engine.state.polarEndgame!,
        rogueAttention: { stage },
      };
      const visibility = selectApexIntelligenceVisibility(engine);
      expect(visibility.rogueAntarcticaAwake).toBe(true);
      expect(apexTerritoryPoliticalIdentityVisible(
        visibility,
        'drake-entry',
        'rai',
      )).toBe(true);
      expect(apexTerritoryNamecardVisible(
        visibility,
        'drake-entry',
        'rai',
        true,
      )).toBe(true);
      expect(apexFogTerritoryPresentation(visibility, 'drake-entry', 'rai')).toMatchObject({
        frontier: true,
        dormantRogueAntarctic: false,
        alpha: 0,
        cloudAlpha: 0,
      });
    }
    expect(apexIntelligenceVisibilitySignature(engine)).not.toBe(before);
    expect(APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticAlpha).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticCloudAlpha).toBe(0);
  });

  it('keeps account unlocks charted for the visual veil without redacting live information', () => {
    const engine = fogEngine();
    engine.viewerKnowledge = {
      ...engine.viewerKnowledge!,
      chartedTerritoryIds: ['usa'],
    };
    const visibility = selectApexIntelligenceVisibility(engine);
    expect(visibility.chartedTerritoryIds).toEqual(new Set(['usa']));
    expect(apexTerritoryCharted(visibility, 'usa')).toBe(true);
    expect(apexTerritoryHoverVisible(visibility, 'usa')).toBe(true);
    expect(apexTerritoryIntelVisible(visibility, 'usa')).toBe(true);
    expect(visibility.chartedTerritoryIds.has('jpn')).toBe(false);

    const before = visibility.signature;
    engine.viewerKnowledge = {
      ...engine.viewerKnowledge,
      chartedTerritoryIds: ['jpn', 'usa'],
    };
    expect(selectApexIntelligenceVisibility(engine).signature).not.toBe(before);
  });

  it('reveals only the targetable Antarctic gateway, never every globally discovered sector', () => {
    const engine = fogEngine('survival');
    engine.state.territories.chl = territory('chl', 'gnb');
    engine.state.territories['weddell-forge'] = territory('weddell-forge', 'rai');
    engine.state.territories['zero-point-core'] = territory('zero-point-core', 'rai');
    engine.content!.territories!.chl = { connections: [{ targetId: 'drake-entry' }] };
    engine.content!.territories!['drake-entry'] = {
      connections: [{ targetId: 'chl' }, { targetId: 'weddell-forge' }],
    };
    engine.content!.territories!['weddell-forge'] = {
      connections: [{ targetId: 'drake-entry' }, { targetId: 'zero-point-core' }],
    };
    engine.content!.territories!['zero-point-core'] = {
      connections: [{ targetId: 'weddell-forge' }],
    };
    engine.state.polarEndgame = {
      phase: 'counteroffensive',
      visualRevision: 1,
      sectors: {
        'drake-entry': { status: 'contested', integrity: 100, wave: 4 },
        'weddell-forge': { status: 'available', integrity: 100, wave: 4 },
        'zero-point-core': { status: 'contested', integrity: 100, wave: 4 },
      },
    };

    let visibility = selectApexIntelligenceVisibility(engine);
    expect(visibility.visibleTerritoryIds.has('drake-entry')).toBe(true);
    expect(visibility.frontierTerritoryIds.has('drake-entry')).toBe(true);
    expect(visibility.clearTerritoryIds.has('drake-entry')).toBe(false);
    expect(visibility.visibleTerritoryIds.has('weddell-forge')).toBe(false);
    expect(visibility.visibleTerritoryIds.has('zero-point-core')).toBe(false);

    engine.state.territories['drake-entry']!.ownerId = 'gnb';
    visibility = selectApexIntelligenceVisibility(engine);
    expect(visibility.clearTerritoryIds.has('drake-entry')).toBe(true);
    expect(visibility.visibleTerritoryIds.has('weddell-forge')).toBe(true);
    expect(visibility.frontierTerritoryIds.has('weddell-forge')).toBe(true);
    expect(visibility.clearTerritoryIds.has('weddell-forge')).toBe(false);
    expect(visibility.visibleTerritoryIds.has('zero-point-core')).toBe(false);
  });

  it('detects Rogue Prime only when its physical sortie intersects exact viewer intel', () => {
    const engine = fogEngine('survival');
    engine.state.territories['zero-point-core'] = territory('zero-point-core', 'rai');
    engine.viewerKnowledge = {
      ...engine.viewerKnowledge!,
      chartedTerritoryIds: ['usa'],
    };
    engine.state.polarEndgame = {
      phase: 'contact',
      visualRevision: 2,
      sectors: {},
      roguePrime: {
        status: 'sortie',
        force: {
          playerId: 'rai',
          role: 'rogue-prime',
          headquartersId: 'zero-point-core',
          locationId: 'zero-point-core',
          mission: 'assault-support',
          front: 'usa',
          army: { manpower: 5, capacity: 5, trainedReserves: 0, baseAttack: 9, baseDefense: 9 },
          economy: { treasury: 1, annualOutput: 1, supplyStock: 1 },
          transit: { path: ['zero-point-core', 'drake-entry', 'usa'], departTick: 1, arriveTick: 10 },
        },
        sortieSequence: 1,
        nextSortieTick: null,
        gatewayId: 'drake-entry',
        targetId: 'usa',
        departTick: 1,
        strikeTick: 10,
        returnTick: 20,
        rebuildReadyTick: null,
      },
    };

    let visibility = selectApexIntelligenceVisibility(engine);
    expect(apexTerritoryCharted(visibility, 'usa')).toBe(true);
    expect(visibility.roguePrimeDetected).toBe(false);
    expect(visibility.detectedRoguePrimeTerritoryIds.size).toBe(0);
    expect(visibility.visibleTerritoryIds.has('zero-point-core')).toBe(false);

    engine.state.polarEndgame.roguePrime = {
      ...engine.state.polarEndgame.roguePrime,
      targetId: 'gnb',
      force: {
        ...engine.state.polarEndgame.roguePrime.force!,
        front: 'gnb',
        transit: {
          ...engine.state.polarEndgame.roguePrime.force!.transit!,
          path: ['zero-point-core', 'drake-entry', 'gnb'],
        },
      },
    };
    visibility = selectApexIntelligenceVisibility(engine);
    expect(visibility.roguePrimeDetected).toBe(true);
    expect(visibility.detectedRoguePrimeTerritoryIds)
      .toEqual(new Set(['drake-entry', 'gnb', 'zero-point-core']));
    expect(visibility.visibleTerritoryIds.has('zero-point-core')).toBe(true);
  });

  it('projects Stage-IV PRIME tracking without revealing its terrain or another seat', () => {
    const trackedSeat = fogEngine('survival');
    trackedSeat.state.territories['zero-point-core'] = territory('zero-point-core', 'rai');
    trackedSeat.state.polarEndgame = {
      phase: 'contact',
      visualRevision: 4,
      sectors: {},
      roguePrime: {
        status: 'sortie',
        force: {
          playerId: 'rai',
          role: 'rogue-prime',
          headquartersId: 'zero-point-core',
          locationId: 'zero-point-core',
          mission: 'assault-support',
          front: 'usa',
          army: { manpower: 5, capacity: 5, trainedReserves: 0, baseAttack: 9, baseDefense: 9 },
          economy: { treasury: 1, annualOutput: 1, supplyStock: 1 },
          transit: { path: ['zero-point-core', 'drake-entry', 'usa'], departTick: 1, arriveTick: 10 },
        },
        sortieSequence: 1,
        nextSortieTick: null,
        gatewayId: 'drake-entry',
        targetId: 'usa',
        departTick: 1,
        strikeTick: 10,
        returnTick: 20,
        rebuildReadyTick: null,
      },
    };
    trackedSeat.viewerKnowledge = {
      ...trackedSeat.viewerKnowledge!,
      roguePrimeTracking: true,
    };

    const tracked = selectApexIntelligenceVisibility(trackedSeat);
    expect(tracked.roguePrimeDetected).toBe(true);
    expect(tracked.roguePrimeTrackedRemotely).toBe(true);
    expect(tracked.detectedRoguePrimeTerritoryIds.size).toBe(0);
    expect(tracked.visibleTerritoryIds.has('zero-point-core')).toBe(false);
    expect(tracked.visibleTerritoryIds.has('usa')).toBe(false);

    const otherSeat = {
      ...trackedSeat,
      viewerKnowledge: { ...trackedSeat.viewerKnowledge, roguePrimeTracking: false },
    };
    const isolated = selectApexIntelligenceVisibility(otherSeat);
    expect(isolated.roguePrimeDetected).toBe(false);
    expect(isolated.roguePrimeTrackedRemotely).toBe(false);
    expect(isolated.visibleTerritoryIds.has('zero-point-core')).toBe(false);
    expect(isolated.signature).not.toBe(tracked.signature);
  });

  it('uses one cached atlas with no world cloud drift or Antarctic mist', () => {
    expect(globeTextureSource).toContain('readonly intelligenceFogMaskCanvas: HTMLCanvasElement;');
    expect(globeTextureSource).toContain('private drawApexIntelligenceFog(');
    expect(threeGlobeSceneSource).toContain('sharedApexFogCloudLayer');
    expect(threeGlobeSceneSource.match(/this\.intelligenceFogCloudLayer = new THREE\.Mesh\(/g))
      .toHaveLength(1);
    expect(threeGlobeSceneSource).toContain('if (this.reducedMotion');
    expect(threeGlobeSceneSource).toContain('|| !this.intelligenceVisibility.enabled');
    expect(threeGlobeSceneSource).toContain('|| this.intelligenceFogVisualBlend <= 0) return;');
    expect(APEX_INTELLIGENCE_FOG_STYLE.cloudAlpha).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.cloudDriftPerSecond).toBe(0);
    expect(APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticCloudAlpha).toBe(0);
    expect(worldMapSceneSource).toContain("'apex-intelligence-fog-atlas'");
    expect(worldMapSceneSource.match(/this\.intelligenceFogImage = this\.add\.image\(/g))
      .toHaveLength(1);
    expect(worldMapSceneSource).toContain('.setDepth(1.4)');
    expect(worldMapSceneSource).toContain('this.ownershipBoundaryGraphics = this.add.graphics().setDepth(2);');
    expect(worldUiSource).toContain('roguePrimeTracking: selectNorthPoleModifiersV2(engine.state, viewerId).primeTracking');
    const globeFogBody = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawApexIntelligenceFog('),
      globeTextureSource.indexOf('private redraw(): void'),
    );
    expect(globeFogBody).not.toContain('PREPARED_ANTARCTICA_SECTORS.map');
    expect(globeTextureSource).toContain('apexPoliticalAtlasFogTerritoryPresentation(');
    expect(worldMapSceneSource).toContain('apexFogTerritoryPresentation(');
  });

  it('keeps political atlases independent from exact intel and filters only passive labels', () => {
    const flatFlagAtlas = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('private redrawFlagAtlas('),
      worldMapSceneSource.indexOf('private hoverCountry('),
    );
    const globeCountryAtlas = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawCountries('),
      globeTextureSource.indexOf('private drawAntarcticTerritories('),
    );
    const globeAntarcticAtlas = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawAntarcticTerritories('),
      globeTextureSource.indexOf('private drawApexIntelligenceFog('),
    );
    const globeLabelBuild = threeGlobeSceneSource.slice(
      threeGlobeSceneSource.indexOf('private rebuildCountryLabels('),
      threeGlobeSceneSource.indexOf('private buildCountryLabelSignature('),
    );
    const globeLabelPlacement = threeGlobeSceneSource.slice(
      threeGlobeSceneSource.indexOf('private updateLabels('),
      threeGlobeSceneSource.indexOf('private updateIntelligenceFogCloudDrift('),
    );

    expect(flatFlagAtlas).not.toContain(
      'apexTerritoryIntelVisible(this.intelligenceVisibility, country.id)',
    );
    expect(flatFlagAtlas).toContain('apexTerritoryPoliticalIdentityVisible(');
    expect(globeCountryAtlas).not.toContain('apexTerritoryIntelVisible(');
    expect(globeCountryAtlas).toContain('engine.state.territories[prepared.country.id]');
    expect(globeAntarcticAtlas).toContain('apexTerritoryPoliticalIdentityVisible(');
    expect(worldMapSceneSource).toContain('apexTerritoryNamecardVisible(');
    expect(globeLabelBuild).toContain('apexTerritoryNamecardVisible(');
    expect(globeLabelBuild).toContain("const detail = remotePassive\n        ? ''");
    expect(globeLabelPlacement).not.toContain(
      "label.kind === 'country'\n        && !apexTerritoryIntelVisible",
    );
  });

  it('keeps every country hoverable and clickable through the shared open-information policy', () => {
    const visibility = selectApexIntelligenceVisibility(fogEngine());
    expect(visibility.visibleTerritoryIds.has('usa')).toBe(false);
    expect(apexTerritoryHoverVisible(visibility, 'usa')).toBe(true);
    expect(apexTerritoryIntelVisible(visibility, 'usa')).toBe(true);
    expect(worldMapSceneSource).toContain('apexTerritoryIntelVisible(this.intelligenceVisibility, country.id)');
    expect(worldMapSceneSource).toContain('apexTerritoryIntelVisible(this.intelligenceVisibility, territory.id)) continue;');
    expect(worldMapSceneSource).toContain('part.input.enabled = hoverVisible');
    expect(worldMapSceneSource).toContain('apexTerritoryHoverVisible(this.intelligenceVisibility, countryId)');
    expect(threeGlobeSceneSource).toContain('private intelligenceFilteredPick(');
    expect(threeGlobeSceneSource).toContain("intelligenceMode: 'command' | 'hover' = 'command'");
    expect(threeGlobeSceneSource).toContain("this.intelligenceFilteredPick(pick, 'hover')");
    expect(threeGlobeSceneSource).toContain('apexTerritoryIntelVisible(this.intelligenceVisibility, anchor.territoryId)) continue;');
  });

  it('renders the normal exact tooltip and inspector without dossier or partial-intel redaction', () => {
    expect(worldUiSource).not.toContain('ACCOUNT DOSSIER');
    expect(worldUiSource).not.toContain('PARTIAL EONSCAR INTEL');
    expect(worldUiSource).not.toContain('NO VERIFIED SIGNAL');
    expect(worldUiSource).not.toContain('OUTSIDE EONSCAR RANGE');
    expect(worldUiSource).not.toContain('Exact live stats unverified');
    expect(worldUiSource).toContain('const localPower = this.engine.territoryPower(territoryId)');
    expect(worldUiSource).toContain('<span>LOCAL POWER</span>');
    expect(worldUiSource).toContain('<span>COMBAT POWER</span>');
    expect(worldUiSource).toContain('<span>ECONOMY</span>');
  });
});
