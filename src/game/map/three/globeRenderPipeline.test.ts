import { describe, expect, it } from 'vitest';
import globeSceneSource from './ThreeGlobeScene.ts?raw';
import globeTextureSource from './globeTexture.ts?raw';

describe('globe render pipeline performance contract', () => {
  it('uses one political texture and one globe mesh at every zoom level', () => {
    expect(globeSceneSource.match(/new THREE\.CanvasTexture\(/g)).toHaveLength(1);
    expect(globeSceneSource.match(/new THREE\.Mesh\(new THREE\.SphereGeometry\(GLOBE_RADIUS/g))
      .toHaveLength(1);
    expect(globeSceneSource).not.toContain('politicalDetail');
    expect(globeSceneSource).not.toContain('updatePoliticalDetailLayer');
    expect(globeSceneSource).not.toContain('buildGlobeBorderPositions');
    expect(globeSceneSource).not.toContain('updateGlobeBorderVisibility');
    expect(globeSceneSource).not.toContain('highlightGroup');
    expect(globeSceneSource).not.toContain('THREE.LineSegments');
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

  it('uses one close-range 2:1 desktop texture without changing the normal tier', () => {
    expect(globeTextureSource).toContain('export const GLOBE_TEXTURE_WIDTH = 3072;');
    expect(globeTextureSource).toContain('export const GLOBE_TEXTURE_HEIGHT = 1536;');
    expect(globeTextureSource).toContain('const HIGH_DETAIL_GLOBE_TEXTURE_WIDTH = 7168;');
    expect(globeTextureSource).toContain('const HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT = 3584;');
    expect(globeTextureSource).toContain('Math.min(preferredWidth, Math.floor(maximumTextureSize / 2) * 2)');
  });

  it('caps close zoom around Belgium scale and skips idle label layout work', () => {
    expect(globeSceneSource).toContain('const MIN_CAMERA_DISTANCE = 7.2;');
    expect(globeSceneSource).toContain('const MAX_CAMERA_DISTANCE = 16.75;');
    expect(globeSceneSource).not.toContain('DEEP_VIEW_DISTANCE');
    expect(globeSceneSource).not.toContain('MAX_DEEP_LABELS');
    expect(globeSceneSource).toContain('const cameraChanged = this.camera.position.distanceToSquared(this.lastLabelCameraPosition) >= 1e-8;');
    expect(globeSceneSource).toContain('if (!this.labelsDirty && !cameraChanged)');
    expect(globeSceneSource).toContain("label.kind === 'country' && !label.persistent && !selected");
  });

  it('keeps terrain in the single baked political texture', () => {
    expect(globeTextureSource).toContain('terrainLayers: terrainTextureLayerPresentation(');
    expect(globeTextureSource).toContain('terrainLayers.tintColor');
    expect(globeTextureSource).toContain('terrainLayers.flagTintAlpha');
    expect(globeTextureSource).toContain('context.globalAlpha = prepared.terrainLayers.flagTintAlpha;');
    expect(globeTextureSource).not.toContain("globalCompositeOperation = 'multiply'");
    expect(globeTextureSource).toContain('terrainLayers.borderColor');
    expect(globeTextureSource).not.toContain('drawDominantTerrainTint');
  });

  it('bakes thin antialiased borders without a second outline stroke', () => {
    expect(globeTextureSource).toContain(
      '(integrating ? 0.88 : owner?.isHuman ? 0.9 : 0.72)',
    );
    expect(globeTextureSource).not.toContain('terrainBorderStyle');
    expect(globeTextureSource).not.toContain('terrainBorderWidth +');
    expect(globeTextureSource).not.toContain("context.strokeStyle = 'rgba(3, 15, 24, 0.96)'");
  });

  it('caches the immutable pick canvas instead of reading it during every hover', () => {
    expect(globeTextureSource).toContain('private pickPixels = new Uint8ClampedArray();');
    expect(globeTextureSource).toContain('const pixelOffset = (y * PICK_TEXTURE_WIDTH + x) * 4;');
    expect(globeTextureSource.match(/getImageData\(/g)).toHaveLength(1);
    expect(globeTextureSource.indexOf('getImageData('))
      .toBeGreaterThan(globeTextureSource.indexOf('private drawPickTexture(): void'));
    expect(globeTextureSource).toContain('this.pickCanvas.width = 1;');
    expect(globeTextureSource).toContain('this.pickCanvas.height = 1;');
  });

  it('draws at most one flag image per owner realm while preserving geographic exceptions', () => {
    expect(globeTextureSource).toContain('flagRings: readonly PreparedRing[];');
    expect(globeTextureSource).toContain('iceRings: readonly PreparedRing[];');
    expect(globeTextureSource).toContain("countryId === 'fra' || countryId === 'prt' || countryId === 'nld' || countryId === 'chl'");
    expect(globeTextureSource).toContain("globeFlagRingPolicy(country.id) === 'principal-only'");
    expect(globeTextureSource).toContain(': rings.filter((ring) => !iceRingSet.has(ring));');
    expect(globeTextureSource).toContain('const flagProjections = new Map<string');
    expect(globeTextureSource).toContain('existing.rings.push(...prepared.flagRings);');
    expect(globeTextureSource).toContain('flagOwnerId: globeTerritoryFlagOwnerId(territory)');
    // One helper definition, one full-atlas call and one isolated capture repaint.
    expect(globeTextureSource.match(/drawFlagIntoProjection\(/g)).toHaveLength(3);
    expect(globeTextureSource.match(/context\.drawImage\(/g)).toHaveLength(1);
    expect(globeTextureSource).toContain('const flagAlpha = flagOwner?.isHuman ? 1 : 0.97;');
    expect(globeTextureSource).toContain('const drawLeft = Math.floor(bounds.left);');
    expect(globeTextureSource).toContain('const drawRight = Math.ceil(bounds.right);');
    expect(globeTextureSource).not.toContain('coreFlag');
    expect(globeTextureSource).toContain("context.fillStyle = 'rgba(218, 239, 242, 0.96)';");
  });

  it('bakes a fixed integration cue over the core flag and removes completed inner borders', () => {
    expect(globeTextureSource).toContain('nationIds.add(globeTerritoryFlagOwnerId(territory));');
    expect(globeTextureSource).toContain('drawIntegrationOverlay(context, prepared.flagRings');
    expect(globeTextureSource).toContain('const fade = context.createLinearGradient(');
    expect(globeTextureSource).toContain("context.strokeStyle = 'rgba(255, 225, 150, 0.26)';");
    expect(globeTextureSource).toContain('if (internalRealmEdge) {');
    expect(globeTextureSource).toContain('let tracingVisibleRun = false;');
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
  });

  it('keeps one moderately dense globe and uses the available fixed-texture anisotropy', () => {
    expect(globeSceneSource).toContain('new THREE.SphereGeometry(GLOBE_RADIUS, 256, 160)');
    expect(globeSceneSource).toContain(
      'this.politicalTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();',
    );
    expect(globeSceneSource).toContain('this.renderer.capabilities.maxTextureSize');
    expect(globeSceneSource).toContain('this.host.dataset.globeAtlas');
  });

  it('reuses bounded route materials for visible logistics flow', () => {
    expect(globeSceneSource).toContain('groupGlobeLogisticsMovements(');
    expect(globeSceneSource).toContain('flowSpeed: 0.24');
    expect(globeSceneSource).toContain('route.dashOffsetUniform.value = -(');
    expect(globeSceneSource).toContain('uniform float routeDashOffset;');
    expect(globeSceneSource).toContain('groupGlobeLogisticsMovements(');
  });

  it('keeps local readiness in DOM nameplates instead of the WebGL graph', () => {
    expect(globeSceneSource).toContain('globeTerritoryReadinessPresentation(territory.army)');
    expect(globeSceneSource).toContain('globe-map__territory-readiness');
    expect(globeSceneSource).toContain("if (absorbed && owner.id !== state.humanPlayerId) continue;");
  });
});
