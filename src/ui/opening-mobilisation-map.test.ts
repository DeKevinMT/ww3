import { describe, expect, it } from 'vitest';
import mapSceneSource from '../game/map/WorldMapScene.ts?raw';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from '../sim/v2/openingArmyBonus';
import { nationIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import worldUiSource from './WorldUIV2.ts?raw';
import {
  createMapEngineAdapter,
  mapOpeningMobilisationStateV2,
} from './WorldUIV2';

describe('opening mobilisation on the map', () => {
  it('projects only active human opening phases and follows the 30-year curve', () => {
    const greenland = nationIdV2('grl');
    const usa = nationIdV2('usa');
    const engine = new WorldEngineV2(95_201, WORLD_CONTENT_V2);
    expect(engine.configureHumanPlayers([greenland], greenland)).toEqual({ accepted: true });
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());

    adapter.refreshSnapshot?.();
    expect(Object.keys(adapter.state.openingMobilisations)).toEqual([greenland]);
    expect(adapter.state.openingMobilisations[greenland]).toMatchObject({
      playerId: greenland,
      remainingRatio: 1,
      initialMultiplier: 50,
      currentMultiplier: 50,
      remainingTicks: OPENING_ARMY_BONUS_DURATION_TICKS_V2,
      direction: 'boost',
    });
    expect(adapter.state.openingMobilisations[usa]).toBeUndefined();

    expect(engine.initializeCommanderForce(greenland, {
      shield: {
        integrity: 0.001,
        maxIntegrity: 0.01,
        rechargeBuffer: 0,
        rechargeMultiplier: 1,
        pulseAttack: 0.001,
      },
      attackMultiplier: 1.045,
      defenseMultiplier: 1.05,
      treasury: 0.5,
      annualOutput: 1,
      supplyStock: 0.15,
      countryTraitScale: 0,
    }).accepted).toBe(true);
    // Commander initialization is a tick-zero direct mutation, so the map
    // adapter must notice its roster even when tick/actionSequence did not move.
    adapter.refreshSnapshot?.();
    expect(adapter.state.openingMobilisations).toEqual({});

    const legacyEngine = new WorldEngineV2(95_203, WORLD_CONTENT_V2);
    expect(legacyEngine.configureHumanPlayers([greenland], greenland)).toEqual({ accepted: true });
    const legacyAdapter = createMapEngineAdapter(legacyEngine, () => legacyEngine.globalRanking());
    legacyAdapter.refreshSnapshot?.();

    legacyEngine.state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    legacyAdapter.refreshSnapshot?.();
    expect(legacyAdapter.state.openingMobilisations[greenland]).toMatchObject({
      remainingRatio: 0.5,
      currentMultiplier: 25.5,
      remainingTicks: OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2,
    });

    legacyEngine.state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    legacyAdapter.refreshSnapshot?.();
    expect(legacyAdapter.state.openingMobilisations).toEqual({});
  });

  it('supports multiple human countries and distinguishes limits from boosts', () => {
    const greenland = nationIdV2('grl');
    const usa = nationIdV2('usa');
    const engine = new WorldEngineV2(95_202, WORLD_CONTENT_V2);
    expect(engine.configureHumanPlayers([greenland, usa], greenland)).toEqual({ accepted: true });

    expect(mapOpeningMobilisationStateV2(engine.state, engine.content, greenland))
      .toMatchObject({ direction: 'boost', initialMultiplier: 50 });
    expect(mapOpeningMobilisationStateV2(engine.state, engine.content, usa))
      .toMatchObject({ direction: 'limit', initialMultiplier: 0.05, remainingRatio: 1 });
    expect(mapOpeningMobilisationStateV2(
      engine.state,
      engine.content,
      nationIdV2('bel'),
    )).toBeUndefined();

    engine.state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    expect(mapOpeningMobilisationStateV2(engine.state, engine.content, greenland))
      .toMatchObject({ direction: 'boost', remainingRatio: 0.5 });
    expect(mapOpeningMobilisationStateV2(engine.state, engine.content, usa))
      .toMatchObject({ direction: 'limit', remainingRatio: 0.5 });
  });

  it('uses one capital-level status badge without touching terrain or war overlays', () => {
    expect(mapSceneSource).toContain('owner.isHuman && empireCapital');
    expect(mapSceneSource).toContain("'OPENING BOOST' : 'OPENING LIMIT'");
    expect(mapSceneSource).toContain('${openingPercent}% LEFT');
    expect(mapSceneSource).toContain("fontSize: '10px'");
    expect(mapSceneSource).toContain("openingPhase.direction === 'boost' ? 0x70dcc2 : 0xb5a7ff");
    expect(mapSceneSource).toContain('openingMobilisationBarBack');
    expect(mapSceneSource).toContain('openingMobilisationBarFill');
    expect(mapSceneSource).toContain('trackWidth * visual.openingMobilisationRemaining');
    expect(worldUiSource).toContain('tooltip__opening-mobilisation');
    expect(worldUiSource).toContain('OPENING MOBILISATION · ${openingDirectionLabel}');
    expect(worldUiSource).toContain('${openingRemainingPercent}% REMAINING');
    expect(worldUiSource).toContain('width:${openingRemainingPercent}%');
    expect(worldUiSource).toContain('temporary extra homeland Army + cap');
    expect(worldUiSource).toContain('temporary reduced homeland Army + cap');
    expect(worldUiSource).toContain('HOMELAND CAP');
    expect(worldUiSource).toContain('years until permanent ×1');
  });
});
