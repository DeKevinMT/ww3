import { describe, expect, it } from 'vitest';
import {
  AI_BOXED_HUMAN_GRACE_TICKS,
  AI_BOXED_HUMAN_RAMP_TICKS,
  AI_BOXED_HUMAN_WARNING_TICKS,
  aiBoxedHumanPressureV2,
  planAiCommandsV2,
  selectAiBoxedHumanAssessmentV2,
} from './ai';
import { WorldEngineV2 } from './WorldEngineV2';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import { nationIdV2 } from './types';

function setArmyScale(engine: WorldEngineV2, ownerId: ReturnType<typeof nationIdV2>, manpower: number): void {
  for (const territory of Object.values(engine.state.territories)) {
    if (territory.owner !== ownerId) continue;
    territory.army.manpower = Math.min(manpower, territory.army.capacity);
    territory.army.baseAttack = manpower < 0.01 ? 1 : 12;
    territory.army.baseDefense = manpower < 0.01 ? 1 : 12;
  }
  engine.state.players[ownerId]!.trainedReserves = 0;
  const bonus = engine.state.players[ownerId]!.openingArmyBonus;
  if (bonus) {
    const deployed = Object.values(engine.state.territories)
      .filter((territory) => territory.owner === ownerId)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    bonus.remainingManpower = Math.min(bonus.initialManpower, deployed);
  }
}

describe('boxed human anti-stalemate pressure', () => {
  it('keeps the opening safe and only activates when every practical neighbour is stronger', () => {
    expect(aiBoxedHumanPressureV2(AI_BOXED_HUMAN_GRACE_TICKS - 1, 3, 3)).toBe(0);
    expect(aiBoxedHumanPressureV2(AI_BOXED_HUMAN_GRACE_TICKS + 80, 2, 3)).toBe(0);
    expect(aiBoxedHumanPressureV2(AI_BOXED_HUMAN_GRACE_TICKS + 80, 0, 0)).toBe(0);
  });

  it('ramps stronger-neighbour pressure gradually after the protected year', () => {
    expect(aiBoxedHumanPressureV2(
      AI_BOXED_HUMAN_GRACE_TICKS + AI_BOXED_HUMAN_RAMP_TICKS / 2,
      3,
      3,
    )).toBeCloseTo(0.5, 6);
    expect(aiBoxedHumanPressureV2(
      AI_BOXED_HUMAN_GRACE_TICKS + AI_BOXED_HUMAN_RAMP_TICKS,
      3,
      3,
    )).toBe(1);
  });

  it('uses canonical win forecasts and selects one adjacent land threat, not a distant navy', () => {
    const engine = new WorldEngineV2(81_001);
    const humanId = nationIdV2('gnb');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
    engine.state.tick = Math.ceil(AI_BOXED_HUMAN_GRACE_TICKS / 8) * 8 + 8;
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.polarEndgame.communicationsBlackoutTick = 0;
    engine.state.aiEscalation.lastWarStartTick = 0;
    setArmyScale(engine, humanId, 0.001);
    for (const id of engine.content.nationIds) {
      if (id !== humanId && engine.content.nations[id]?.kind !== 'rogue-ai') {
        setArmyScale(engine, id, 0.08);
      }
    }

    const boxed = selectAiBoxedHumanAssessmentV2(engine.state, engine.content, humanId);
    expect(boxed).toMatchObject({
      boxed: true,
      viableTargetIds: [],
      threatAccess: 'land',
      threatDistanceKm: 0,
    });
    expect(boxed.threatenerId).not.toBeNull();

    setArmyScale(engine, humanId, 2);
    for (const id of engine.content.nationIds) {
      if (id !== humanId && engine.content.nations[id]?.kind !== 'rogue-ai') {
        setArmyScale(engine, id, 0.001);
      }
    }
    const hasExit = selectAiBoxedHumanAssessmentV2(engine.state, engine.content, humanId);
    expect(hasExit.boxed).toBe(false);
    expect(hasExit.viableTargetIds.length).toBeGreaterThan(0);
  });

  it('persists one local mobilisation warning and never declares during its buildup', () => {
    const engine = new WorldEngineV2(81_002);
    const humanId = nationIdV2('gnb');
    expect(engine.chooseCountry(humanId)).toEqual({ accepted: true });
    engine.state.tick = Math.ceil(AI_BOXED_HUMAN_GRACE_TICKS / 8) * 8 + 8;
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.polarEndgame.communicationsBlackoutTick = 0;
    engine.state.aiEscalation.lastWarStartTick = 0;
    setArmyScale(engine, humanId, 0.001);
    for (const id of engine.content.nationIds) {
      if (id !== humanId && engine.content.nations[id]?.kind !== 'rogue-ai') {
        setArmyScale(engine, id, 0.08);
      }
    }

    const first = planAiCommandsV2(engine.state, engine.content);
    expect(first.some((command) => command.type === 'declare-war'
      && command.defenderId === humanId)).toBe(false);
    const warnings = engine.state.events.filter((event) => (
      event.playerId === humanId && event.message.startsWith('EONSCAR EARLY WARNING')
    ));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain(`${AI_BOXED_HUMAN_WARNING_TICKS} weeks`);

    planAiCommandsV2(engine.state, engine.content);
    expect(engine.state.events.filter((event) => (
      event.playerId === humanId && event.message.startsWith('EONSCAR EARLY WARNING')
    ))).toHaveLength(1);

    const resumed = structuredClone(engine.state);
    resumed.tick += 8;
    const stillPreparing = planAiCommandsV2(resumed, engine.content);
    expect(stillPreparing.some((command) => command.type === 'declare-war'
      && command.defenderId === humanId)).toBe(false);
    expect(resumed.events.filter((event) => (
      event.playerId === humanId && event.message.startsWith('EONSCAR EARLY WARNING')
    ))).toHaveLength(1);
  });
});
