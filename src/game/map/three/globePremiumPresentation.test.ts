import { describe, expect, it } from 'vitest';
import globeSceneSource from './ThreeGlobeScene.ts?raw';
import empireFieldSource from '../empireNeuralFieldPresentation.ts?raw';
import rogueFieldSource from '../rogueAntarcticFieldPresentation.ts?raw';

describe('premium globe presentation budget', () => {
  it('loads one authored parallax galaxy with no separate sun draw', () => {
    const backdropSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private addCelestialBackdrop'),
      globeSceneSource.indexOf('private createAuthoredGatewayRoutes'),
    );
    expect(globeSceneSource).toContain(
      "../../../assets/eonscar-galaxy-map-bg.jpg?url",
    );
    expect(backdropSource.match(/new THREE\.TextureLoader\(\)/g)).toHaveLength(1);
    expect(backdropSource).toContain('this.scene.background = loadedTexture;');
    expect(backdropSource).toContain('deepSpaceTexture.generateMipmaps = false;');
    expect(backdropSource).toContain('deepSpaceTexture.repeat.set(GALAXY_UV_REPEAT_X, GALAXY_UV_REPEAT_Y);');
    expect(globeSceneSource).toContain("this.host.dataset.celestialBackdropDrawCalls = '1';");
    expect(globeSceneSource).toContain("this.host.dataset.celestialBackdropDrawCalls = '0';");
    expect(globeSceneSource).not.toContain('function createDeepSpaceBackdropTexture');
    expect(backdropSource).not.toContain('CanvasTexture');
    expect(backdropSource).not.toContain('EquirectangularReflectionMapping');
    expect(backdropSource).not.toContain('new THREE.Points');
    expect(backdropSource).not.toContain('new THREE.PlaneGeometry');
    expect(backdropSource).not.toContain('new THREE.ShaderMaterial');
    expect(backdropSource).not.toContain('celestialSun');
    expect(backdropSource).not.toContain('distantSun');
    expect(globeSceneSource).not.toContain('private addStars');
    expect(globeSceneSource).not.toContain('new THREE.Sprite(');
    expect(globeSceneSource).not.toContain('EffectComposer');
    const frameSource = globeSceneSource.slice(globeSceneSource.indexOf('private readonly renderFrame'));
    expect(frameSource).not.toContain('TextureLoader');
    expect(frameSource).not.toContain('new THREE.');
  });

  it('updates galaxy UVs from camera deltas without allocations or idle drift', () => {
    const parallaxSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private updateCelestialBackdropParallax'),
      globeSceneSource.indexOf('/** One immutable dashed buffer'),
    );
    expect(globeSceneSource).toContain('const GALAXY_HORIZONTAL_PARALLAX_PER_RADIAN = 0.0065;');
    expect(globeSceneSource).toContain('const GALAXY_VERTICAL_PARALLAX_PER_RADIAN = 0.012;');
    expect(parallaxSource).toContain('Math.atan2(this.camera.position.x, this.camera.position.z)');
    expect(parallaxSource).toContain('this.galaxyPanX - azimuthDelta * GALAXY_HORIZONTAL_PARALLAX_PER_RADIAN');
    expect(parallaxSource).toContain('this.galaxyPanY - elevationDelta * GALAXY_VERTICAL_PARALLAX_PER_RADIAN');
    expect(parallaxSource).toContain('if (Math.abs(nextPanX - this.galaxyPanX) <= 1e-7');
    expect(parallaxSource).not.toContain('new THREE.');
    const frameSource = globeSceneSource.slice(globeSceneSource.indexOf('private readonly renderFrame'));
    expect(frameSource).toContain('this.updateCelestialBackdropParallax();');
    expect(frameSource.indexOf('this.updateCelestialBackdropParallax();')).toBeLessThan(
      frameSource.indexOf('this.renderer.render(this.scene, this.camera);'),
    );
    const resizeSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private resize(): void'),
      globeSceneSource.indexOf('private updateIntelligenceFogCloudDrift'),
    );
    expect(resizeSource).not.toContain('galaxyPan');
    expect(resizeSource).not.toContain('galaxyParallaxInitialized');
  });

  it('uses one view-aware Fresnel atmosphere shell with no post-processing pass', () => {
    const atmosphereSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private addAtmosphere'),
      globeSceneSource.indexOf('private addCelestialBackdrop'),
    );
    expect(atmosphereSource.match(/new THREE\.ShaderMaterial\(/g)).toHaveLength(1);
    expect(atmosphereSource.match(/new THREE\.Mesh\(/g)).toHaveLength(1);
    expect(atmosphereSource).toContain('cameraPosition - worldPosition');
    expect(atmosphereSource).toContain('pow(horizon, 9.5)');
    expect(atmosphereSource).toContain('GLOBE_RADIUS * 1.024, 64, 40');
    expect(atmosphereSource).toContain('min(alpha, 0.30)');
    expect(atmosphereSource).toContain('toneMapped: false');
    expect(atmosphereSource).not.toContain('onBeforeRender');
  });

  it('renders EONSCAR as one bounded distributed empire network without a human marker', () => {
    const updateSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private updateCommanderForces'),
      globeSceneSource.indexOf('private animateCommanderForceVisual'),
    );
    expect(updateSource).toContain('selectApexEmpireFieldPresentation(engine, viewerForce)');
    expect(updateSource).toContain("this.host.dataset.apexPhysicalMarker = 'none';");
    expect(updateSource).not.toContain("role: 'apex'");
    expect(globeSceneSource).toContain("this.host.dataset.neuralDomeDrawCalls = lineVertexCount > 0 ? '2' : '0';");
    expect(globeSceneSource).toContain('APEX_EMPIRE_NETWORK_ARC_STEPS');
    expect(empireFieldSource).toContain('export const APEX_EMPIRE_NETWORK_MAX_EDGES = 384;');
    const frameSource = globeSceneSource.slice(globeSceneSource.indexOf('private readonly renderFrame'));
    expect(frameSource).not.toContain('syncTerritoryNeuralFieldCoverage');
    expect(frameSource).not.toContain('rebuildTerritoryNeuralDomes');
  });

  it('reveals a bounded Antarctic-only Rogue stronghold without access-point ornaments', () => {
    const updateSource = globeSceneSource.slice(
      globeSceneSource.indexOf('private updateCommanderForces'),
      globeSceneSource.indexOf('private animateCommanderForceVisual'),
    );
    expect(updateSource).toContain('selectRogueAntarcticFieldPresentation(engine)');
    expect(globeSceneSource).toContain("this.host.dataset.rogueShieldScope = 'antarctica-only';");
    expect(rogueFieldSource).toContain("polar.phase === 'dormant'");
    expect(rogueFieldSource).toContain("definition.id === 'zero-point-core'");
    expect(rogueFieldSource).not.toContain('COUNTRIES');
    expect(globeSceneSource).not.toContain('ANTARCTICA_ACCESS_ANCHORS');
    expect(globeSceneSource).not.toContain('globe-map__access-label');
    expect(globeSceneSource).not.toContain('addAntarcticaPresentation');
    expect(globeSceneSource).toContain("this.host.dataset.antarcticaAccessMarkers = 'none';");
  });
});
