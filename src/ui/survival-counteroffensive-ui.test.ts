import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { synchronizeArmyCapacityV2 } from '../sim/v2/capacity';
import { invalidateTerritoryIndexV2 } from '../sim/v2/selectors';
import { resolveScenarioV2 } from '../sim/v2/scenarios';
import { nationIdV2, territoryIdV2 } from '../sim/v2/types';
import { ROGUE_AI_NATION_ID_V2 } from '../sim/v2/content';
import { declareWarV2 } from '../sim/v2/war';
import { WorldUIV2 } from './WorldUIV2';
import worldUiSource from './WorldUIV2.ts?raw';

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('Survival exact counteroffensive UI', () => {
  it('lists exact adjacent Rogue territories in War without declaring a second war', () => {
    const panel = methodSource(
      '  private renderWarPanel(',
      '  private renderSurvivalCounteroffensiveTarget(',
    );
    const card = methodSource(
      '  private renderSurvivalCounteroffensiveTarget(',
      '  private warTargetRecommendations(',
    );

    expect(panel).toContain('this.engine.survivalCounteroffensiveTargets(human.id)');
    expect(panel).toContain('isSurvivalStateV2(this.engine.state)');
    expect(panel).toContain("this.engine.content.metadata?.scenarioId === 'survival'");
    expect(panel).toContain('Counteroffensive fronts');
    expect(panel).toContain('Choose the exact Rogue territory to reclaim');
    expect(card).toContain('data-action="push-survival-front"');
    expect(card).toContain('data-territory="${target.targetId}"');
    expect(card).toContain("target.active ? 'ACTIVE' : 'PUSH FRONT'");
    expect(card).not.toContain('quick-war');
    expect(card).not.toContain('declare-war');
  });

  it('uses the same exact-target action in the country panel, including an already-active permanent war', () => {
    const territory = methodSource(
      '  private renderTerritoryPanel(',
      '  private renderWarTracker(',
    );
    expect(territory).toContain('this.engine.survivalCounteroffensiveTargets(humanId).find');
    expect(territory).toContain('activePlayerCounteroffensive');
    expect(territory).toContain('ACTIVE COUNTEROFFENSIVE');
    expect(territory).toContain('ROGUE FRONT · COUNTERATTACK');
    expect(territory).toContain('data-action="push-survival-front"');
    expect(territory).toContain('data-territory="${territoryId}"');
    expect(territory).not.toContain('hasDirectEmpireContact');
  });

  it('dispatches both buttons to the exact simulation command', () => {
    const handlerStart = worldUiSource.indexOf("          case 'push-survival-front': {");
    const handlerEnd = worldUiSource.indexOf("          case 'cancel-war':", handlerStart);
    expect(handlerStart).toBeGreaterThan(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = worldUiSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain('element.dataset.territory as TerritoryId');
    expect(handler).toContain('this.engine.selectSurvivalCounteroffensive(');
    expect(handler).toContain('this.viewerPlayerId(),');
    expect(handler).toContain('territoryId,');
    expect(handler).not.toContain('this.engine.declareWar(');
  });

  it('renders Senegal PUSH FRONT above the fold after a normal Rogue conquest', () => {
    const { content } = resolveScenarioV2({ mode: 'survival', seed: 91_104 });
    const engine = new WorldEngineV2(91_104, content);
    const human = nationIdV2('grl');
    const guineaBissau = territoryIdV2('gnb');
    const senegal = territoryIdV2('sen');
    expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });

    const steppingTerritory = engine.state.territories[guineaBissau]!;
    steppingTerritory.owner = human;
    steppingTerritory.coreOwner = human;
    steppingTerritory.integration = 0;
    delete steppingTerritory.integrationProgram;
    invalidateTerritoryIndexV2(engine.state);
    synchronizeArmyCapacityV2(engine.state, engine.content);
    steppingTerritory.army.manpower = 0.01;
    const targetTerritory = engine.state.territories[senegal]!;
    targetTerritory.owner = ROGUE_AI_NATION_ID_V2;
    targetTerritory.integration = 0;
    delete targetTerritory.integrationProgram;
    targetTerritory.army.manpower = Math.max(targetTerritory.army.manpower, 0.01);
    invalidateTerritoryIndexV2(engine.state);
    expect(declareWarV2(
      engine.state,
      engine.content,
      human,
      ROGUE_AI_NATION_ID_V2,
    )).toEqual({ accepted: true });
    // Reproduce the loaded-save mismatch from the screenshot: canonical
    // Survival content survives while the legacy presentation mode is stale.
    engine.state.runProgression.mode = 'campaign';

    expect(engine.survivalCounteroffensiveTargets(human)).toContainEqual(
      expect.objectContaining({ sourceId: guineaBissau, targetId: senegal }),
    );
    const ui = Object.create(WorldUIV2.prototype) as WorldUIV2 & Record<string, unknown>;
    Object.assign(ui, {
      engine,
      options: {},
      viewerPlayerId: () => human,
      playerFlagHtml: () => '<span>FLAG</span>',
      ranking: () => [
        { player: engine.player(human) },
        { player: engine.player(engine.state.territories[senegal]!.owner) },
      ],
    });
    const html = (ui as unknown as {
      renderTerritoryPanel: (...args: unknown[]) => string;
    }).renderTerritoryPanel(
      senegal,
      engine.state.territories[senegal]!,
      engine.nationalEconomy(human),
      {},
    );

    expect(html).toContain('TERRITORY · WAR LIVE');
    expect(html).toContain('ROGUE FRONT · COUNTERATTACK');
    expect(html).toContain('data-action="push-survival-front"');
    expect(html).toContain('data-territory="sen"');
    expect(html).not.toContain('WAR ACTIVE · NO DIRECT CONTACT');
    expect(html.indexOf('data-action="push-survival-front"'))
      .toBeLessThan(html.indexOf('SELECTED LAND'));
    expect(engine.selectSurvivalCounteroffensive(human, senegal))
      .toEqual({ accepted: true });
  });
});
