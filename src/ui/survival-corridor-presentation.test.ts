import { describe, expect, it } from 'vitest';
import bridgeSource from '../game/map/bridge.ts?raw';
import worldMapSource from '../game/map/WorldMapScene.ts?raw';
import globeBordersSource from '../game/map/three/globeBorders.ts?raw';
import globeTextureSource from '../game/map/three/globeTexture.ts?raw';
import worldUiSource from './WorldUIV2.ts?raw';

describe('Survival scorched supply corridor presentation', () => {
  it('projects the canonical selector into the renderer snapshot', () => {
    expect(worldUiSource).toContain('isSurvivalScorchedTransitTerritoryV2(source, id as TerritoryId)');
    expect(worldUiSource).toContain('transitOnly,');
    expect(bridgeSource).toContain('transitOnly?: boolean;');
    expect(bridgeSource).toContain('territory.transitOnly !== true');
  });

  it('never mistakes a corridor for Signal Purge in either map renderer', () => {
    expect(worldMapSource).toContain('mapTerritoryIsIntegrating(territoryState)');
    expect(globeTextureSource).toContain('territory.transitOnly !== true');
    expect(globeBordersSource).not.toContain('legacy-integrating');
  });

  it('shows direct transit-only copy and suppresses integration progress', () => {
    const panel = worldUiSource.slice(
      worldUiSource.indexOf('  private renderTerritoryPanel('),
      worldUiSource.indexOf('  private winChance('),
    );
    expect(panel).toContain('isSurvivalScorchedTransitTerritoryV2(');
    expect(panel).toContain("'SUPPLY CORRIDOR'");
    expect(panel).toContain('TRANSIT ONLY');
    expect(panel).toContain('Transit control only · no local production or recruits.');
    expect(panel).toContain('const integrationPanel = survivalTransitOnly');
  });
});
