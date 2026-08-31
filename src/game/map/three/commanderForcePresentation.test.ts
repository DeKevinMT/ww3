import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sceneSource = readFileSync(new URL('./ThreeGlobeScene.ts', import.meta.url), 'utf8');
const flatSceneSource = readFileSync(new URL('../WorldMapScene.ts', import.meta.url), 'utf8');
const worldUiSource = readFileSync(new URL('../../../ui/WorldUIV2.ts', import.meta.url), 'utf8');
const empireFieldSource = readFileSync(
  new URL('../empireNeuralFieldPresentation.ts', import.meta.url),
  'utf8',
);

const globeFieldSource = sceneSource.slice(
  sceneSource.indexOf('function createStrategicNeuralFieldGeometry'),
  sceneSource.indexOf('private removeCommanderForceVisual'),
);
const globeMarkerSource = sceneSource.slice(
  sceneSource.indexOf('private createCommanderMarker'),
  sceneSource.indexOf('private removeCommanderForceVisual'),
);
const flatFieldSource = flatSceneSource.slice(
  flatSceneSource.indexOf('private drawCommanderTerritoryCoverage'),
  flatSceneSource.indexOf('private drawCommanderRoutes'),
);
const flatRouteSource = flatSceneSource.slice(
  flatSceneSource.indexOf('private drawCommanderRoutes'),
  flatSceneSource.indexOf('private triggerNeuralFieldPulse'),
);
const globeForceSyncSource = sceneSource.slice(
  sceneSource.indexOf('private updateCommanderForces'),
  sceneSource.indexOf('private animateCommanderForceVisual'),
);

describe('autonomous EONSCAR / ROGUE PRIME map presentation', () => {
  it('uses code-native neural fields and never imports the retired robot sprites', () => {
    for (const source of [sceneSource, flatSceneSource]) {
      expect(source).not.toMatch(/apex-robot\.png|rogue-prime\.png/);
    }
    expect(globeFieldSource).toContain('drawTerritoryWideNeuralField(');
    expect(sceneSource).toContain('this.neuralFieldCoverageLayer.userData.sharedTerritoryNeuralFieldLayer = true;');
    expect(sceneSource).toContain('this.syncTerritoryNeuralFieldCoverage(');
    expect(sceneSource).toContain('this.apexEmpireField,');
    expect(sceneSource).toContain('this.rogueAntarcticField,');
    expect(globeMarkerSource).not.toMatch(/THREE\.Sprite|CircleGeometry|RingGeometry/);
    expect(flatFieldSource).toContain('private drawCommanderTerritoryCoverage(');
    expect(flatSceneSource).toContain('this.drawCommanderTerritoryCoverage(entries);');
    expect(flatFieldSource).toContain('graphics.lineBetween(');
    expect(flatFieldSource).not.toMatch(/this\.add\.image|add\.circle|add\.ellipse/);
  });

  it('covers every supported territory part in both production renderers', () => {
    expect(sceneSource).toContain('const rings = preparedNeuralFieldRings(territoryId);');
    expect(sceneSource).toContain('for (const ring of rings) {');
    expect(sceneSource).toContain('paintedParts += drawTerritoryWideNeuralField(');
    expect(sceneSource).toContain("this.host.dataset.neuralFieldParts = String(paintedParts);");
    expect(flatSceneSource).toContain('const NEURAL_FIELD_MAP_RINGS = new Map');
    expect(flatFieldSource).toContain('const rings = NEURAL_FIELD_MAP_RINGS.get(entry.force.locationId) ?? [];');
    expect(flatFieldSource).toContain('for (const ring of rings) {');
    expect(flatFieldSource).toContain('graphics.fillPath();');
    expect(flatSceneSource).toContain('this.game.canvas.dataset.neuralFieldParts = String(paintedParts);');
  });

  it('adds a pooled true-3D cap whose foot is the territory border', () => {
    expect(sceneSource).toContain('function buildTerritoryNeuralDomeGeometry(');
    expect(sceneSource).toContain('TERRITORY_NEURAL_DOME_GEOMETRY_CACHE.get(cacheKey)');
    expect(sceneSource).toContain('preparedTerritoryNeuralDomeGeometry(territoryId, detail)');
    expect(sceneSource).toContain('multiplyScalar(NEURAL_DOME_BASE_RADIUS)');
    expect(sceneSource).toContain('NEURAL_DOME_BASE_RADIUS + neuralDomeSpokeElevation');
    expect(sceneSource).toContain('this.neuralDomeLines.userData.pooledTerritoryNeuralDome = true;');
    expect(sceneSource).toContain('this.neuralDomeNodes.userData.pooledTerritoryNeuralDomeNodes = true;');
    expect(sceneSource).toContain("this.host.dataset.neuralDomeDrawCalls = lineVertexCount > 0 ? '2' : '0';");
    expect(flatFieldSource).toContain('const archLift = Phaser.Math.Clamp(');
    expect(flatFieldSource).toContain('this.game.canvas.dataset.neuralFieldCurvedArches');
  });

  it('uses low broad caps and one sparse Antarctic silhouette instead of stacked cages', () => {
    const domeSource = sceneSource.slice(
      sceneSource.indexOf('function pushLowWideDomeCap('),
      sceneSource.indexOf('function neuralFieldDomeShellPoint('),
    );
    const rebuildSource = sceneSource.slice(
      sceneSource.indexOf('private rebuildTerritoryNeuralDomes('),
      sceneSource.indexOf('private syncTerritoryNeuralFieldCoverage('),
    );
    expect(domeSource).toContain('progress * 0.84');
    expect(domeSource).toContain("detail === 'front' ? 0.35 : 0.31");
    expect(domeSource).toContain("detail === 'front' ? 0.27 : 0.22");
    expect(domeSource).not.toContain('tier[(index + 2) % tier.length]');
    expect(domeSource).toContain('preparedRogueAntarcticNeuralDomeGeometry()');
    expect(rebuildSource).toContain("this.host.dataset.rogueShieldDomeClusters = '1';");
    expect(rebuildSource).toContain('APEX_EMPIRE_NETWORK_RENDER_MAX_EDGES');
    expect(rebuildSource).not.toContain('copyPreparedDome(territory.territoryId');
  });

  it('uses a distributed human field while keeping the hostile point core route-local', () => {
    expect(sceneSource).toContain('visual.fieldMesh.visible = false;');
    expect(sceneSource).toContain('visual.nodes.visible = mode.signalNodeVisible;');
    expect(flatSceneSource).toContain('visual.container.setVisible(mode.signalNodeVisible);');
    expect(sceneSource).toContain('selectApexEmpireFieldPresentation(engine, viewerForce)');
    expect(sceneSource).toContain("this.host.dataset.apexPhysicalMarker = 'none';");
    expect(sceneSource).not.toContain('neuralFieldCoverageGeometrySignature(entries)');
    expect(flatSceneSource).toContain('neuralFieldCoverageGeometrySignature(entries)');
  });

  it('keeps dome, route and label work off unchanged weekly map syncs', () => {
    expect(sceneSource).toContain('if (signature === this.neuralFieldCoverageSignature) return;');
    expect(flatSceneSource).toContain(
      'if (!forceRedraw && signature === this.commanderCoverageSignature) return;',
    );
    expect(flatRouteSource).toContain('neuralFieldRouteGeometrySignature(entries)');
    expect(flatRouteSource).toContain(
      'if (!forceRedraw && signature === this.commanderRouteSignature) return;',
    );
    expect(globeForceSyncSource).toContain(
      'visual?.routePointSignature === routePointSignature',
    );
    expect(globeForceSyncSource).toContain(': commanderRoutePoints(force, entry.routePath);');
    expect(globeForceSyncSource).toContain('this.syncTerritoryNeuralFieldCoverage(');
    expect(globeForceSyncSource).toContain('this.apexEmpireField,');
    expect(globeForceSyncSource).not.toContain('this.labelsDirty = true;');
  });

  it('keeps one pooled convergence effect and no physical laser or particles', () => {
    expect(sceneSource).toContain('this.neuralConvergenceLine.userData.pooledNeuralConvergence = true;');
    expect(sceneSource).toContain('this.neuralContact.userData.pooledNeuralContact = true;');
    expect(flatSceneSource).toContain('private neuralConvergenceGraphics?: Phaser.GameObjects.Graphics;');
    expect(flatSceneSource).toContain('this.neuralConvergenceGraphics = this.add.graphics().setDepth(11.5);');
    expect(sceneSource).not.toMatch(/apexStrike|ApexStrike|laser/i);
    expect(flatSceneSource).not.toMatch(/apexStrike|ApexStrike|laser/i);
  });

  it('keeps human EONSCAR locationless while PRIME still samples canonical travel', () => {
    expect(sceneSource).toContain('commanderPointAlongRoute(');
    expect(sceneSource).not.toContain('mapCommanderTransitProgress(viewerForce, engine.state.tick)');
    expect(sceneSource).toContain("this.host.dataset.apexPhysicalMarker = 'none';");
    expect(flatSceneSource).toContain('neuralFieldRouteSegment(progress, route.length)');
    expect(flatSceneSource).toContain('mapCommanderTransitProgress(viewerForce, engine.state.tick)');
    expect(sceneSource).toContain('neuralFieldModePresentation(');
    expect(sceneSource).toContain('visual.fieldOperational');
    expect(flatSceneSource).toContain('neuralFieldModePresentation(');
    expect(flatSceneSource).toContain('visual.fieldOperational');
  });

  it('flows the pooled route from canonical simulation progress instead of wall time', () => {
    expect(sceneSource).toContain('visual.routeAnimation = {');
    expect(sceneSource).toContain("ww3-canonical-neural-route-dash-v1");
    expect(sceneSource).toContain('const canonicalPhase = entry.routeProgress');
    expect(sceneSource).toContain('dashOffsetUniform.value = -(canonicalPhase % dashCycle);');
    expect(sceneSource).not.toContain('private readonly commanderRouteMaterials');
  });

  it('clips a supported incoming wave at the field surface in 3D and 2D', () => {
    expect(sceneSource).toContain('clipGlobeRouteToNeuralField(path');
    expect(sceneSource).toContain('const shellPoint = neuralFieldDomeShellPoint(');
    expect(sceneSource).toContain('path[path.length - 1]!.copy(shellPoint);');
    expect(sceneSource).not.toContain('(field?.marker.scale.x ?? 0.08) * 0.76');
    expect(sceneSource).toContain("const targetCountry = neuralField?.interceptsIncoming");
    expect(sceneSource).toContain('? undefined');
    expect(flatSceneSource).toContain('if (!neuralField?.interceptsIncoming) {');
    expect(flatSceneSource).toContain('const fieldVisual = neuralField?.interceptsIncoming');
    expect(flatSceneSource).toContain('if (interceptedAt) {');
    expect(flatSceneSource).toContain('return;');
  });

  it('removes exhausted distributed EONSCAR coverage while PRIME retains its lifecycle', () => {
    expect(empireFieldSource).toContain('if (!force || !visible || !apexFieldPresentationActive(engine))');
    expect(empireFieldSource).toContain('return INACTIVE_APEX_EMPIRE_FIELD;');
    expect(sceneSource).not.toContain('mapCommanderRecoveryLifecycleActive(viewerForce)');
    expect(flatSceneSource).toContain('mapCommanderRecoveryLifecycleActive(viewerForce)');
    expect(flatSceneSource).toContain('const projections = apexProjectionPresentations(viewerForce);');
    expect(globeForceSyncSource).toContain('fieldOperational: true');
    expect(globeForceSyncSource).toContain('visual.fieldOperational = entry.fieldOperational;');
    expect(globeForceSyncSource).toContain('entry.fieldOperational');
    expect(sceneSource).toContain('const viewerApexOperational = this.apexEmpireField.active;');
    expect(sceneSource).toContain('const apexSupport = viewerApexOperational');
    expect(sceneSource).toContain('candidate.inTransit || !candidate.fieldOperational || !candidate.combatActive');
    expect(sceneSource).toContain('? !this.apexEmpireField.active');
    expect(flatSceneSource).toContain('candidate.moving || !candidate.fieldOperational || !candidate.combatActive');
    expect(flatSceneSource).toContain('visual.fieldOperational && targetVisible');
  });

  it('keeps EONSCAR and detected PRIME distinct without separate force nameplates', () => {
    expect(sceneSource).toContain("role: 'apex' | 'rogue-prime'");
    expect(flatSceneSource).toContain("role: 'apex' | 'rogue-prime'");
    expect(sceneSource).toContain('STRATEGIC_NEURAL_FIELD_STYLE.roguePrime');
    expect(flatSceneSource).toContain('STRATEGIC_NEURAL_FIELD_STYLE.roguePrime');
    expect(sceneSource).toContain('globe-map__ai-signal');
    expect(sceneSource).not.toContain('globe-map__commander-label');
  });

  it('presents viewer EONSCAR as Energy while PRIME retains hostile force support', () => {
    expect(sceneSource).toContain('commanderShieldMapSupportPercent');
    expect(sceneSource).not.toContain('commanderForceMapCombatPower');
    expect(empireFieldSource).toContain('apexShieldPresentation(force)');
    expect(sceneSource).toContain('this.apexEmpireField.percent');
    expect(sceneSource).not.toContain('EONSCAR supporting with ${compactMapCombatPower(');
    expect(sceneSource).not.toMatch(/\+\$\{compactMapCombatPower\([^}]*apex/i);
    expect(sceneSource).toContain('ROGUE PRIME amplifying the Antarctic army by ${primeSupportPercent.toFixed(1)}%');
    expect(flatSceneSource).toContain('apexShieldPresentation');
    expect(flatSceneSource).toContain('${apexShield.label}');
    expect(flatSceneSource).toContain('commanderShieldMapSupportPercent');
    expect(sceneSource).toContain('PRIME +${primeSupportPercent.toFixed(1)}%');
    expect(flatSceneSource).toContain('PRIME +${primeSupportPercent.toFixed(1)}%');
    expect(flatSceneSource).toContain("setData('accessibleLabel', supportAccessibleLabel)");
  });

  it('never presents human EONSCAR transit or army power', () => {
    expect(sceneSource).not.toContain('const apexInboundTerritoryId = viewerApex?.transit?.path.at(-1);');
    expect(sceneSource).not.toContain('const apexProjections = apexProjectionPresentations(viewerApex);');
    expect(sceneSource).toContain("this.host.dataset.apexPhysicalMarker = 'none';");
    expect(sceneSource).not.toMatch(/APEX (?:supporting|inbound)[^\n`]*compactMapCombatPower/i);
    expect(flatSceneSource).toContain('const apexInboundTerritoryId = viewerApex?.transit?.path.at(-1);');
    expect(sceneSource).toContain('(empirePower.get(territory.ownerId) ?? 0) + territory.army.power');
    expect(flatSceneSource).toContain('${apexShield.label} · INBOUND');
  });

  it('scales the pooled shield coverage and contact pulse by integrity', () => {
    expect(sceneSource).toContain('this.apexEmpireField.integrity');
    expect(sceneSource).toContain('fieldIntensity: 1');
    expect(sceneSource).toContain('shieldIntensity');
    expect(sceneSource).toMatch(/contactOpacity[^;]*\* shieldIntensity/s);
    expect(flatSceneSource).toContain('fieldIntensity: projection.integrity * projection.combatShare');
    expect(flatSceneSource).toContain('const fieldIntensity = mode.intensity * entry.fieldIntensity;');
  });

  it('concentrates one shared network on multiple fronts without twin markers', () => {
    expect(empireFieldSource).toContain('canonicalShield?.activeFrontTerritoryIds');
    expect(sceneSource).toContain('const frontIds = new Set(empireField.activeFrontTerritoryIds);');
    expect(sceneSource).toContain("this.host.dataset.apexProjectionCount = '0';");
    expect(sceneSource).not.toContain("`${engine.state.humanPlayerId}:twin`");
    expect(flatSceneSource).toContain('apexProjectionPresentations(viewerForce)');
    expect(flatSceneSource).toContain('const twinTether = entry.tether;');
  });

  it('drives unique capstone effects only from explicit battle-event fields', () => {
    for (const source of [sceneSource, flatSceneSource]) {
      expect(source).toContain("resolution.ability");
      expect(source).toContain('resolution.counterpulseDamage');
      expect(source).toContain("this.neuralPulseAbility === 'singularity'");
      expect(source).toContain("this.neuralPulseAbility === 'mirror'");
      expect(source).not.toMatch(/neuralPulseAbility\s*=.*(?:attackerPower|Losses)/);
    }
    expect(sceneSource).toContain('this.neuralConvergenceGeometry.setDrawRange(');
    expect(sceneSource).toContain('this.neuralPulseSample.returnProgress');
    expect(flatSceneSource).toContain('private drawNeuralReturnPulse(');
    expect(flatSceneSource).toContain('this.neuralPulseSample.singularityOpacity');
  });

  it('gates every EONSCAR production surface behind the viewer first-strike phase', () => {
    expect(sceneSource.match(/apexFieldPresentationActive\(/g)?.length).toBeGreaterThanOrEqual(1);
    expect(empireFieldSource).toContain('apexFieldPresentationActive(engine)');
    expect(flatSceneSource.match(/apexFieldPresentationActive\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(worldUiSource).toContain('apexFieldActivated: scenarioId !== \'standard-2026\'');
    expect(worldUiSource).toContain('campaignHumanWarsUnlockedV2(engine.state, engine.content, viewerId)');
  });

  it('is fully autonomous and exposes no map or panel move commands', () => {
    expect(sceneSource).not.toContain('onCommanderForceClick');
    expect(flatSceneSource).not.toContain('onCommanderForceClick');
    expect(worldUiSource).not.toMatch(/commanderMoveArmed|data-action="commander-(?:focus|order|cancel-move)"/);
    expect(worldUiSource).not.toMatch(/APEX SELECTED|CLICK A CONNECTED FRIENDLY DESTINATION|>MOVE<|SEND APEX/);
    expect(worldUiSource).toContain('AUTO · ${escapeHtml(apexDockStatus)}');
  });
});
