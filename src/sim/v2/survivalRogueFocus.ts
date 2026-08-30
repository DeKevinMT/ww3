import { TRUCE_TICKS } from './balance';
import { ROGUE_AI_NATION_ID_V2, type WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import { rogueAiSurvivalActiveV2 } from './survival';
import type { PlayerId, WarStateV2, WorldStateV2 } from './types';

function isBackgroundAiWarV2(
  state: Pick<WorldStateV2, 'humanPlayerIds'>,
  war: Pick<WarStateV2, 'attackerId' | 'defenderId'>,
): boolean {
  return !state.humanPlayerIds.includes(war.attackerId)
    && !state.humanPlayerIds.includes(war.defenderId)
    && war.attackerId !== ROGUE_AI_NATION_ID_V2
    && war.defenderId !== ROGUE_AI_NATION_ID_V2;
}

function addSurvivalFocusTruceV2(
  state: WorldStateV2,
  leftId: PlayerId,
  rightId: PlayerId,
): void {
  const [left, right] = leftId < rightId ? [leftId, rightId] : [rightId, leftId];
  const expiresTick = state.tick + TRUCE_TICKS;
  const existing = state.truces.find((truce) => (
    truce.leftId === left && truce.rightId === right
  ));
  if (existing) {
    existing.expiresTick = Math.max(existing.expiresTick, expiresTick);
    return;
  }
  state.truces.push({ leftId: left, rightId: right, expiresTick });
}

/**
 * Survival contact reserves national AI capacity for the machine war. Old or
 * externally hydrated saves may still carry terrestrial AI-vs-AI campaigns;
 * close those once without touching a human theatre or a permanent Rogue war.
 *
 * The common case deliberately returns before allocating or replacing any
 * arrays. `autonomousAiVsAiWarCapV2` remains zero for the whole scenario, so a
 * reconciled background conflict cannot be scheduled again after its truce.
 */
export function reconcileSurvivalRogueFocusWarsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  if (content.metadata?.scenarioId !== 'survival'
    || !rogueAiSurvivalActiveV2(state)
    || state.wars.length === 0) return 0;

  let hasBackgroundWar = false;
  for (const war of state.wars) {
    if (isBackgroundAiWarV2(state, war)) {
      hasBackgroundWar = true;
      break;
    }
  }
  if (!hasBackgroundWar) return 0;

  const closedWars: WarStateV2[] = [];
  const survivingWars: WarStateV2[] = [];
  for (const war of state.wars) {
    (isBackgroundAiWarV2(state, war) ? closedWars : survivingWars).push(war);
  }
  state.wars = survivingWars;

  state.offers = [];
  state.ceasefireObligations = [];
  for (const war of closedWars) {
    addSurvivalFocusTruceV2(state, war.attackerId, war.defenderId);
  }

  addWorldEventV2(
    state,
    'war',
    'action',
    `SURVIVAL FOCUS: ${closedWars.length} background AI campaign${closedWars.length === 1 ? '' : 's'} closed as independent commands redirected forces toward the Rogue threat.`,
    undefined,
    state.humanPlayerId,
  );
  return closedWars.length;
}
