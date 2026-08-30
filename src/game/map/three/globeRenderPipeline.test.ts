import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import globeBordersSource from './globeBorders.ts?raw';
import naturalBaseSource from './globeNaturalBasePresentation.ts?raw';
import globeSurfaceSource from './globeSurfacePresentation.ts?raw';
import globeSceneSource from './ThreeGlobeScene.ts?raw';
import globeTextureSource from './globeTexture.ts?raw';
import worldMapSceneSource from '../WorldMapScene.ts?raw';
const stylesSource = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');

describe('globe render pipeline performance contract', () => {
  it('uses one political texture, one fog pair, one neural-field atlas and one globe mesh', () => {
    // Political atlas, fog mask/noise/clear crossfade, sun and exactly one
    // shared territory-wide APEX/PRIME coverage atlas.
    expect(globeSceneSource.match(/new THREE\.CanvasTexture\(/g)).toHaveLength(6);
    expect(globeSceneSource.match(/sharedTerritoryNeuralFieldLayer/g)).toHaveLength(1);
    expect(globeSceneSource.match(/new THREE\.Mesh\(new THREE\.SphereGeometry\(/g))
      .toHaveLength(1);
    expect(globeSceneSource).not.toContain('politicalDetail');
    expect(globeSceneSource).not.toContain('updatePoliticalDetailLayer');
    expect(globeSceneSource).toContain('buildGlobeBorderBuffer');
    expect(globeSceneSource).not.toContain('buildGlobeBorderPositions');
    expect(globeSceneSource).not.toContain('updateGlobeBorderVisibility');
    expect(globeSceneSource).not.toContain('highlightGroup');
    expect(globeSceneSource.match(/new LineSegments2\(/g)).toHaveLength(1);
    // One authored gateway batch, one transit network and one pooled true dome.
    // Political edges still stay in one screen-space LineSegments2 batch.
    expect(globeSceneSource.match(/new THREE\.LineSegments\(/g)).toHaveLength(3);
    expect(globeSceneSource).toContain('authoredIntercontinentalGatewayBatch');
    expect(globeSceneSource).toContain('this.neuralNetworkGeometry');
    expect(globeSceneSource).toContain('pooledTerritoryNeuralDome');
  });

  it('never redraws or upgrades flags because the camera zoomed or moved', () => {
    expect(globeTextureSource).not.toContain('detailCanvas');
    expect(globeTextureSource).not.toContain('detailFlag');
    expect(globeTextureSource).not.toContain('setDetailView');
    expect(globeTextureSource).not.toContain('redrawDetail');
    expect(globeTextureSource).not.toContain('fetch(url)');
    expect(globeTextureSource).not.toContain('context.filter');
    expect(globeSceneSource).toContain('this.politicalTexture.magFilter = THREE.LinearFilter;');
    expect(globeSceneSource).toContain('this.politicalTexture.minFilter = THREE.LinearFilter;');
    expect(globeSceneSource).toContain('this.politicalTexture.generateMipmaps = false;');
  });

  it('uses one adaptive 2:1 desktop texture without adding a zoom-time detail layer', () => {
    expect(globeTextureSource).toContain('export const GLOBE_TEXTURE_WIDTH = 3072;');
    expect(globeTextureSource).toContain('export const GLOBE_TEXTURE_HEIGHT = 1536;');
    expect(globeTextureSource).toContain('const HIGH_DETAIL_GLOBE_TEXTURE_WIDTH = 4096;');
    expect(globeTextureSource).toContain('const HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT = 2048;');
    expect(globeTextureSource).toContain('const ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH = 6144;');
    expect(globeTextureSource).toContain('const ULTRA_DETAIL_GLOBE_TEXTURE_HEIGHT = 3072;');
    expect(globeTextureSource).toContain('const ULTRA_DETAIL_MIN_VIEWPORT_WIDTH = 1200;');
    expect(globeTextureSource).toContain('maximumTextureSize >= ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH');
    expect(globeTextureSource).toContain('Math.min(preferredWidth, Math.floor(maximumTextureSize / 2) * 2)');
  });

  it('caps close zoom around Belgium scale and skips idle label layout work', () => {
    expect(globeSceneSource).toContain('const MIN_CAMERA_DISTANCE = 6.6;');
    expect(globeSceneSource).toContain('const MAX_CAMERA_DISTANCE = 20;');
    expect(globeSceneSource).toContain('const COUNTRY_LABEL_MIN_SCALE_DISTANCE = 16.75;');
    expect(globeSceneSource).toContain('COUNTRY_LABEL_MIN_SCALE_DISTANCE,');
    expect(globeSceneSource).not.toContain('DEEP_VIEW_DISTANCE');
    expect(globeSceneSource).not.toContain('MAX_DEEP_LABELS');
    expect(globeSceneSource).toContain('const cameraChanged = this.camera.position.distanceToSquared(this.lastLabelCameraPosition) >= 1e-8;');
    expect(globeSceneSource).toContain('if (!this.labelsDirty && !cameraChanged)');
    expect(globeSceneSource).toContain("label.kind === 'country' && !label.persistent && !selected");
  });

  it('keeps Natural Earth as the only shaded surface beneath gameplay terrain and politics', () => {
    expect(globeTextureSource).toContain("earth-natural-no-cloud-4096.webp?url");
    expect(globeTextureSource).toContain('terrainLayers: terrainTextureLayerPresentation(');
    expect(globeTextureSource).toContain('context.globalAlpha = prepared.terrainLayers.tintAlpha;');
    expect(globeTextureSource).not.toContain('terrainLayers.flagTintAlpha');
    expect(globeTextureSource).not.toContain('reliefStrength');
    expect(globeTextureSource).not.toContain('createGlobeTerrainReliefCanvas');
    expect(globeTextureSource).not.toContain('globeTerrainReliefPixels');
    expect(globeTextureSource).not.toContain('drawGlobeMountainHillshade');
    expect(globeTextureSource).not.toContain('drawGlobeSummitSnow');
    expect(globeTextureSource).not.toContain('MOUNTAIN_PEAK_');
    expect(globeSceneSource).not.toContain('reliefTexture');
    expect(globeSceneSource).not.toContain('borderRadiusSampler');
    expect(globeSceneSource).not.toContain('bumpMap');
    expect(globeSceneSource).not.toContain('displacementMap');
    expect(globeSceneSource).toContain('roughness: 0.94');
    expect(globeSceneSource).toContain('metalness: 0.01');
    expect(globeTextureSource).not.toContain("globalCompositeOperation = 'multiply'");
    expect(globeTextureSource).not.toContain('drawDominantTerrainTint');
  });

  it('composes geography, terrain, transparent flags and integration in that order', () => {
    const countryPaintSource = globeTextureSource.slice(
      globeTextureSource.indexOf('private drawCountries('),
      globeTextureSource.indexOf('private redraw(): void'),
    );
    const terrainIndex = countryPaintSource.indexOf('drawPreparedTerrainWash(');
    const flagIndex = countryPaintSource.indexOf('drawFlagIntoProjection(');
    const integrationIndex = countryPaintSource.indexOf('drawIntegrationOverlay(');
    expect(globeTextureSource).toContain('const naturalBaseReady = drawNaturalEarthBase(');
    expect(terrainIndex).toBeGreaterThanOrEqual(0);
    expect(flagIndex).toBeGreaterThan(terrainIndex);
    expect(integrationIndex).toBeGreaterThan(flagIndex);
    expect(naturalBaseSource).toContain('regular: 0.50');
    expect(naturalBaseSource).toContain('human: 0.60');
    expect(naturalBaseSource).toContain('integrating: 0.38');
  });

  it('uses exactly one antialiased screen-space border layer at every zoom', () => {
    expect(globeSceneSource).toContain("from 'three/examples/jsm/lines/LineMaterial.js'");
    expect(globeSceneSource).toContain("from 'three/examples/jsm/lines/LineSegments2.js'");
    expect(globeSceneSource).toContain('worldUnits: false');
    expect(globeSceneSource).toContain('alphaToCoverage: true');
    expect(globeSceneSource).toContain('const BORDER_LINEWIDTH_CLOSE = 1.20;');
    expect(globeSceneSource).toContain('const BORDER_LINEWIDTH_FAR = 0.95;');
    expect(globeSceneSource).toContain('depthTest: true');
    expect(globeSceneSource).toContain('depthWrite: false');
    expect(globeSceneSource).toContain('this.updateGlobeBorderPresentation(this.camera.position.length());');
    expect(globeSceneSource).not.toContain('borderDetail.visible');
    expect(globeSceneSource).not.toContain('BORDER_DETAIL_MAX_CAMERA_DISTANCE');
  });

  it('never bakes a political or integration perimeter into the globe atlas', () => {
    expect(globeTextureSource).toContain('Political borders are intentionally absent from this atlas.');
    expect(globeTextureSource).not.toContain('traceCountryRealmBorder');
    expect(globeTextureSource).not.toContain('terrainBorderWidth');
    expect(globeTextureSource).not.toContain('(integrating ? 0.88 : owner?.isHuman ? 0.9 : 0.72)');
    expect(globeTextureSource).not.toContain("context.strokeStyle = integrating ? 'rgba(244, 201, 106, 0.96)'");
    // Morocco / Western Sahara cannot regain a divergent atlas outline.
    expect(globeTextureSource).not.toContain('BORDER_EDGE_COUNTRIES');
  });

  it('omits decorative ocean-current arcs that resemble gameplay routes', () => {
    expect(globeTextureSource).not.toContain('function drawOceanCurrent(');
    expect(globeTextureSource).not.toContain('drawOceanCurrent(context');
  });

  it('caches the immutable pick canvas instead of reading it during every hover', () => {
    expect(globeTextureSource).toContain('private pickPixels = new Uint8ClampedArray();');
    expect(globeTextureSource).toContain('const pixelOffset = (y * PICK_TEXTURE_WIDTH + x) * 4;');
    expect(globeTextureSource.match(/getImageData\(/g)).toHaveLength(1);
    expect(globeSceneSource).not.toContain('getImageData(');
    expect(globeTextureSource.indexOf('this.pickContext.getImageData('))
      .toBeGreaterThan(globeTextureSource.indexOf('private drawPickTexture(): void'));
    expect(globeTextureSource).toContain('this.pickCanvas.width = 1;');
    expect(globeTextureSource).toContain('this.pickCanvas.height = 1;');
  });

  it('draws at most one flag image per owner realm while preserving geographic exceptions', () => {
    expect(globeTextureSource).toContain('flagRings: readonly PreparedRing[];');
    expect(globeTextureSource).not.toContain('iceRings');
    expect(globeTextureSource).toContain("countryId === 'fra' || countryId === 'prt' || countryId === 'nld' || countryId === 'chl'");
    expect(globeTextureSource).toContain("globeFlagRingPolicy(country.id) === 'principal-only'");
    expect(globeTextureSource).toContain(': rings;');
    expect(globeTextureSource).toContain('const flagProjections = new Map<string');
    expect(globeTextureSource).toContain('existing.rings.push(...prepared.flagRings);');
    expect(globeTextureSource).toContain('flagOwnerId: globeTerritoryFlagOwnerId(territory)');
    // One helper, ordinary full-atlas, Antarctic full-atlas and isolated capture calls.
    expect(globeTextureSource.match(/drawFlagIntoProjection\(/g)).toHaveLength(4);
    const flagProjectionSource = globeTextureSource.slice(
      globeTextureSource.indexOf('function drawFlagIntoProjection('),
      globeTextureSource.indexOf('function drawIntegrationOverlay('),
    );
    expect(flagProjectionSource.match(/context\.drawImage\(/g)).toHaveLength(1);
    expect(globeTextureSource).toContain('const flagAlpha = globeFlagOverlayAlpha(');
    expect(globeTextureSource).toContain('const drawLeft = Math.floor(bounds.left);');
    expect(globeTextureSource).toContain('const drawRight = Math.ceil(bounds.right);');
    expect(globeTextureSource).not.toContain('coreFlag');
    expect(globeTextureSource).not.toContain("context.fillStyle = 'rgba(218, 239, 242, 0.96)';");
    expect(globeTextureSource).not.toMatch(/traceArcticIce|drawArcticIce|ARCTIC_ICE_COASTLINE/);
    expect(globeTextureSource).toContain('traceNorthPoleResearchSite(this.pickContext');
  });

  it('bakes only the fixed integration fill cue while geometry owns its physical perimeter', () => {
    expect(globeTextureSource).toContain('nationIds.add(globeTerritoryFlagOwnerId(territory));');
    expect(globeTextureSource).toContain('drawIntegrationOverlay(context, prepared.flagRings');
    expect(globeTextureSource).toContain('const fade = context.createLinearGradient(');
    expect(globeTextureSource).toContain("context.strokeStyle = 'rgba(255, 225, 150, 0.26)';");
    expect(globeBordersSource).not.toContain('INTEGRATION_BORDER_COLOR');
    expect(globeBordersSource).toContain('for (const { points, color: edgeColor } of visibleEdges)');
    expect(globeBordersSource).not.toContain('edgeIsIntegrating');
    expect(globeBordersSource).toContain('return GLOBE_BORDER_COLORS.neutral;');
    expect(globeBordersSource).toContain('if (edge.internalCanonicalEdge) return undefined;');
    const overlaySource = globeTextureSource.slice(
      globeTextureSource.indexOf('function drawIntegrationOverlay('),
      globeTextureSource.indexOf('export function globeTextureSelectionSignature('),
    );
    expect(overlaySource).not.toContain('territory.integration');
  });

  it('uses analytical throttled picking and an idle render cadence', () => {
    expect(globeSceneSource).toContain('ray.intersectSphere(this.pickSphere, this.pickPoint)');
    expect(globeSceneSource).not.toContain('intersectObject(this.globe');
    expect(globeSceneSource).toContain('window.requestAnimationFrame(this.flushPendingHover)');
    expect(globeSceneSource).toContain('const IDLE_RENDER_INTERVAL_MS = 1000 / 20;');
    expect(globeSceneSource).toContain('const renderInterval = cameraActive || presentationActive');
    expect(globeSceneSource).toContain('? ACTIVE_RENDER_INTERVAL_MS');
    const cadenceSource = globeSceneSource.slice(
      globeSceneSource.indexOf('const presentationActive'),
      globeSceneSource.indexOf('const renderInterval'),
    );
    expect(cadenceSource).not.toContain('focusedPolarRegion');
    expect(cadenceSource).not.toContain('hoveredPolarRegion');
  });

  it('uses real Antarctic polygons without floating circular sector markers', () => {
    expect(globeSceneSource).not.toContain('new THREE.InstancedMesh(');
    expect(globeSceneSource).not.toContain('new THREE.RingGeometry(');
    expect(globeSceneSource).not.toContain('polarSectorMarkers');
    expect(globeSceneSource).toContain('globePolarPresentationSignature(polar)');
    expect(globeSceneSource).not.toContain('`${polar.phase}:${polar.visualRevision}`');
    expect(globeSceneSource).toContain("mapBridge.onPolarRegionClick?.(pick.kind)");
    expect(globeSceneSource).toContain('mapBridge.onPolarSectorClick(pick.sectorId)');
    expect(globeSceneSource).toContain('this.hoveredPolarSectorId = polarSectorId;');
    expect(globeSceneSource).toContain('mapBridge.onTerritoryHover?.(territoryId ?? polarSectorId');
    expect(globeSceneSource).toContain('clearPolarFocus(): void');
    expect(globeSceneSource).toContain('this.clearPolarFocus();');
    expect(globeSceneSource).toContain('new THREE.Vector3(0, -1, 0)');
    expect(globeSceneSource).toContain('const ANTARCTICA_OVERVIEW_DISTANCE = 14.5;');
    expect(globeTextureSource).toContain('private drawAntarcticTerritories(');
    expect(globeTextureSource).toContain('PREPARED_ANTARCTICA_SECTORS');
    expect(worldMapSceneSource).toContain('this.createAntarcticaTerritories();');
    expect(worldMapSceneSource).toContain('sector.mapRings');
    expect(worldMapSceneSource).toContain('setInteractive(new Phaser.Geom.Polygon(points)');
    const routeRebuildSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private rebuildRoutes(): void'),
      globeSceneSource.indexOf('private bindInput(): void'),
    );
    expect(routeRebuildSource).not.toContain('operation.momentum');
  });

  it('keeps Antarctic readiness on terrain and reserves readable labels for live borders', () => {
    expect(globeSceneSource).toContain("definition.polar ? 'is-antarctic' : ''");
    expect(worldMapSceneSource).toContain("fontSize: '11px'");
    expect(worldMapSceneSource).not.toContain("color: '#ffaaa4', backgroundColor: '#18090be6'");
    expect(worldMapSceneSource).toContain('rogueTerritory.showPower || activeFront || humanBorder || apexSupport || primeSupport');
    expect(worldMapSceneSource).toContain('visual.barBack.setVisible(visible && clearIntel);');
    expect(worldMapSceneSource).toContain('visual.power.setVisible(showPower);');
    expect(stylesSource).toContain('.globe-map__country-label.is-antarctic.is-rogue-threat span { font-size: 11px; }');
    expect(stylesSource).toContain('.globe-map__country-label.is-antarctic.is-rogue-compact {');
    expect(stylesSource).toContain('background: transparent;');
  });

  it('bakes irregular Antarctic ice detail without concentric latitude hatching', () => {
    expect(globeTextureSource).toContain('const binWidth = 1;');
    expect(globeTextureSource).toContain('context.bezierCurveTo(controlOneX');
    const antarcticaSource = globeTextureSource.slice(
      globeTextureSource.indexOf('function drawAntarctica('),
      globeTextureSource.indexOf('interface PreparedTextureBounds'),
    );
    expect(antarcticaSource).not.toContain('for (let y =');
    expect(antarcticaSource).not.toContain('context.lineTo(width, y');
  });

  it('keeps one moderately dense globe and uses the available fixed-texture anisotropy', () => {
    expect(globeSceneSource).toContain('GLOBE_SPHERE_WIDTH_SEGMENTS,');
    expect(globeSceneSource).toContain('GLOBE_SPHERE_HEIGHT_SEGMENTS,');
    expect(globeSurfaceSource).toContain('GLOBE_SPHERE_WIDTH_SEGMENTS = 320');
    expect(globeSurfaceSource).toContain('GLOBE_SPHERE_HEIGHT_SEGMENTS = 200');
    expect(globeSurfaceSource).toContain('GLOBE_SURFACE_CLEARANCE = 0.00018');
    expect(globeSurfaceSource).toContain('globeOverlayRadius(baseRadius: number)');

    expect(globeSceneSource).toContain(
      'this.politicalTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();',
    );
    expect(globeSceneSource).toContain('this.renderer.capabilities.maxTextureSize');
    expect(globeSceneSource).toContain('this.host.dataset.globeAtlas');
  });

  it('reuses bounded route materials for visible logistics flow', () => {
    expect(globeSceneSource).toContain('selectGlobeVisibleLogisticsRoutes(');
    expect(globeSceneSource).toContain("'rai',");
    expect(globeSceneSource).toContain('flowSpeed: rogueRoute ? 0.31 : 0.24');
    expect(globeSceneSource).toContain('color: rogueRoute ? 0xff5f57 : 0x86f0ff');
    expect(globeSceneSource).toContain('route.dashOffsetUniform.value = -(');
    expect(globeSceneSource).toContain('uniform float routeDashOffset;');
  });

  it('keeps local readiness in DOM nameplates instead of the WebGL graph', () => {
    expect(globeSceneSource).toContain('globeTerritoryReadinessPresentation(territory.army)');
    expect(globeSceneSource).toContain('globe-map__territory-readiness');
    expect(globeSceneSource).toContain('globeTerritorySupplyNodePresentation(');
    expect(globeSceneSource).toContain('globeRogueTerritoryPresentation(');
    expect(globeSceneSource).toContain('const compactSupplyNode = supplyNode.compact;');
    expect(globeSceneSource).toContain('if (absorbed && !compactSupplyNode && !rogueTerritory.rogue');
    expect(globeSceneSource).toContain('function compactNameplateCombatPower(power: number): string');
    expect(globeSceneSource).toContain("replace(/^(\\d+\\.\\d)\\d([KMBT]?)$/, '$1$2')");
    expect(globeSceneSource).toContain('`PURGE ${integratingPercent}% · ${integratingLocalPower}`');
    expect(globeSceneSource).toContain('`Signal purge ${integratingPercent}% · Local power ${compactMapCombatPower(territory.army.power)}`');
    expect(globeSceneSource).toContain("territory.ownerId === 'rai' || territory.coreOwnerId !== territory.ownerId");
    expect(globeSceneSource).toContain("compactSupplyNode ? 'is-local-absorbed' : ''");
    expect(globeSceneSource).toContain("rogueTerritory.compact ? 'is-rogue-compact' : ''");
    expect(globeSceneSource).toContain("rogueTerritory.showPower ? 'is-rogue-threat' : ''");
    expect(globeSceneSource).toContain("integrating && !compactSupplyNode ? 'is-integrating' : ''");
    expect(globeSceneSource).toContain('width: remotePassive ? 122');
    expect(globeSceneSource).toContain(': signalBadge ? localHeadquarters ? 78 : 122');
    expect(globeSceneSource).toContain(': rogueTerritory.compact ? 30');
    expect(globeSceneSource).toContain('...ANTARCTICA_SECTOR_PRESENTATIONS.map((sector, index) => ({');
    expect(globeSceneSource).toContain('return `${this.intelligenceVisibility.signature}|${engine.state.humanPlayerId}|${territorySignature}');
  });

  it('keeps country cards compact while zooming out', () => {
    expect(globeSceneSource).toContain('const COUNTRY_LABEL_FAR_SCALE = 1;');
    expect(globeSceneSource).toContain('function countryLabelScaleForDistance(cameraDistance: number): number');
    expect(globeSceneSource).toContain('label.width * countryLabelScale');
    expect(globeSceneSource).toContain('scale(${countryLabelScale.toFixed(3)})');
  });

  it('updates the one border geometry in place and never rebuilds it from the frame loop', () => {
    expect(globeSceneSource).toContain('(position.data.array as Float32Array).set(buffer.positions);');
    expect(globeSceneSource).toContain('(color.data.array as Float32Array).set(buffer.colors);');
    expect(globeSceneSource).toContain('position.data.needsUpdate = true;');
    const frameSource = globeSceneSource.slice(globeSceneSource.indexOf('private readonly renderFrame'));
    expect(frameSource).not.toContain('buildGlobeBorderBuffer(');
  });

  it('updates borders and nameplates immediately while a Rogue realm atlas batch settles', () => {
    const syncSource = globeSceneSource.slice(
      globeSceneSource.indexOf('sync(engine: WorldMapEngineContract)'),
      globeSceneSource.indexOf('private captureApexFogClearAtlas()'),
    );
    const atlas = syncSource.indexOf('this.globeTexture.sync(engine, this.selection);');
    const borders = syncSource.indexOf('this.updateGlobeBorderDetail(engine);');
    const labelSignature = syncSource.indexOf('this.buildCountryLabelSignature(engine);');
    const labels = syncSource.indexOf('this.rebuildCountryLabels();');
    expect(atlas).toBeGreaterThanOrEqual(0);
    expect(borders).toBeGreaterThan(atlas);
    expect(labelSignature).toBeGreaterThan(borders);
    expect(labels).toBeGreaterThan(labelSignature);
  });
});
