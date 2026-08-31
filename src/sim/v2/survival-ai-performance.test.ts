import { describe, expect, it } from 'vitest';
import {
  planRuntimeAiCommandsV2,
  selectSurvivalAiManagementCohortV2,
  type AiPlanningWorkStatsV2,
} from './ai';
import { NATIONAL_AI_REVIEW_TICKS } from './balance';
import { WorldEngineV2 } from './WorldEngineV2';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2,
  SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2,
  survivalRogueFrontCapV2,
} from './survival';
import {
  redistributeArmiesV2,
  survivalRogueTransitRouteCacheStatsV2,
} from './war';
import { ROGUE_AI_NATION_ID_V2 } from './content';

describe('Survival AI planning performance', () => {
  it('spreads country management over eight bounded cohorts without global war-target work', () => {
    const seed = 93_001;
    const { content } = resolveScenarioV2({ mode: 'survival', seed });
    const engine = new WorldEngineV2(seed, content);
    expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });

    const reviewed = new Set<string>();
    const cohortSizes: number[] = [];
    for (let tick = 1; tick <= NATIONAL_AI_REVIEW_TICKS; tick += 1) {
      engine.state.tick = tick;
      const cohort = selectSurvivalAiManagementCohortV2(engine.state, engine.content);
      const work: AiPlanningWorkStatsV2 = {
        managementNationReviews: 0,
        strategicNationReviews: 0,
        warAccessIndexBuilds: 0,
      };
      const commands = planRuntimeAiCommandsV2(engine.state, engine.content, work);
      cohortSizes.push(cohort.length);
      for (const playerId of cohort) {
        expect(reviewed.has(playerId), `${playerId} was reviewed twice in one cadence`).toBe(false);
        reviewed.add(playerId);
      }
      expect(work).toEqual({
        managementNationReviews: cohort.length,
        strategicNationReviews: 0,
        warAccessIndexBuilds: 0,
      });
      expect(commands.every((command) => command.type === 'set-budget-policy'
        || command.type === 'set-research-focus'
        || command.type === 'choose-research-breakthrough')).toBe(true);
      expect(commands.length).toBeLessThanOrEqual(cohort.length * 2);
    }

    const activeNationCount = engine.content.nationIds.filter((playerId) => (
      Boolean(engine.state.players[playerId])
    )).length;
    expect(reviewed.size).toBe(activeNationCount);
    expect(Math.max(...cohortSizes)).toBeLessThanOrEqual(
      Math.ceil(engine.content.nationIds.length / NATIONAL_AI_REVIEW_TICKS),
    );
  });

  it('retains full strategic reviews outside Survival', () => {
    const engine = new WorldEngineV2(93_002);
    engine.state.tick = NATIONAL_AI_REVIEW_TICKS;
    const work: AiPlanningWorkStatsV2 = {
      managementNationReviews: 0,
      strategicNationReviews: 0,
      warAccessIndexBuilds: 0,
    };
    planRuntimeAiCommandsV2(engine.state, engine.content, work);
    expect(work.managementNationReviews).toBe(0);
    expect(work.strategicNationReviews).toBeGreaterThan(100);
    expect(work.warAccessIndexBuilds).toBe(1);
  });

  it('keeps the first threat singular, then concentrates on at most three axes', () => {
    for (let wave = 1; wave <= 20; wave += 1) {
      expect(survivalRogueFrontCapV2(wave, false)).toBe(1);
      expect(survivalRogueFrontCapV2(wave, true))
        .toBeLessThanOrEqual(SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 9].map((wave) => (
      survivalRogueFrontCapV2(wave, true)
    ))).toEqual([2, 2, 3, 3, 3, 3, 3, 3]);
  });

  it('uses one exact annual wave cadence', () => {
    expect(ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2).toBe(52);
  });

  it('reuses unchanged Rogue transit geometry and invalidates on ownership changes', () => {
    const seed = 93_003;
    const { content } = resolveScenarioV2({ mode: 'survival', seed });
    const engine = new WorldEngineV2(seed, content);
    expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });

    redistributeArmiesV2(engine.state, engine.content);
    const afterFirst = survivalRogueTransitRouteCacheStatsV2(engine.state);
    engine.state.tick += 1;
    redistributeArmiesV2(engine.state, engine.content);
    const unchanged = survivalRogueTransitRouteCacheStatsV2(engine.state);
    expect(unchanged.builds).toBe(afterFirst.builds);
    expect(unchanged.hits).toBeGreaterThan(afterFirst.hits);

    const acquiredId = engine.content.territoryIds.find((territoryId) => (
      engine.state.territories[territoryId]?.owner !== ROGUE_AI_NATION_ID_V2
    ));
    expect(acquiredId).toBeDefined();
    engine.state.territories[acquiredId!]!.owner = ROGUE_AI_NATION_ID_V2;
    redistributeArmiesV2(engine.state, engine.content);
    const changed = survivalRogueTransitRouteCacheStatsV2(engine.state);
    expect(changed.builds).toBe(unchanged.builds + 1);
  });
});
