import { ROGUE_AI_NATION_ID_V2, type WorldContentV2 } from '../sim/v2/content';
import type { WorldSpeedV2, WorldStateV2 } from '../sim/v2/types';

export const SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2: WorldSpeedV2 = 3;
export const SURVIVAL_CONTACT_FAST_FORWARD_RETURN_SPEED_V2: WorldSpeedV2 = 1;

type ContactStateV2 = Pick<
  WorldStateV2,
  'gameOver' | 'humanPlayerIds' | 'speed' | 'wars'
>;

/**
 * A declaration or long-range operation is still an approach, not contact.
 * The fast-forward stops only after the first canonical Rogue↔human battle.
 */
export function hasRealSurvivalRogueHumanContactV2(
  state: Pick<WorldStateV2, 'humanPlayerIds' | 'wars'>,
): boolean {
  const humanIds = new Set(state.humanPlayerIds);
  return state.wars.some((war) => {
    const rogueAgainstHuman = (
      war.attackerId === ROGUE_AI_NATION_ID_V2 && humanIds.has(war.defenderId)
    ) || (
      war.defenderId === ROGUE_AI_NATION_ID_V2 && humanIds.has(war.attackerId)
    );
    return rogueAgainstHuman && war.battles > 0;
  });
}

export interface SurvivalContactFastForwardPresentationV2 {
  readonly visible: boolean;
  readonly active: boolean;
  readonly authorized: boolean;
  readonly label: string;
  readonly detail: string;
}

export function survivalContactFastForwardPresentationV2(
  state: ContactStateV2,
  content: Pick<WorldContentV2, 'metadata'>,
  options: {
    readonly dismissed: boolean;
    readonly clockAuthority: boolean;
  },
): SurvivalContactFastForwardPresentationV2 {
  const survival = content.metadata?.scenarioId === 'survival';
  const contact = survival && hasRealSurvivalRogueHumanContactV2(state);
  const active = survival
    && state.speed === SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2
    && !state.gameOver
    && !contact;
  if (!survival || state.gameOver || contact || (options.dismissed && !active)) {
    return {
      visible: false,
      active: false,
      authorized: options.clockAuthority,
      label: '',
      detail: '',
    };
  }
  if (active) {
    return {
      visible: true,
      active: true,
      authorized: options.clockAuthority,
      label: options.clockAuthority ? 'SEEKING CONTACT · 3×' : 'HOST SEEKING CONTACT · 3×',
      detail: 'The live world is advancing. Normal speed returns at first contact.',
    };
  }
  return {
    visible: true,
    active: false,
    authorized: options.clockAuthority,
    label: options.clockAuthority ? 'FAST-FORWARD TO CONTACT' : 'WAITING FOR HOST',
    detail: options.clockAuthority
      ? 'Run the visible simulation at 3× until the Rogue reaches a human front.'
      : 'Only the room host can accelerate the shared simulation.',
  };
}

export function shouldStopSurvivalContactFastForwardV2(
  state: ContactStateV2,
  content: Pick<WorldContentV2, 'metadata'>,
): boolean {
  return state.speed === SURVIVAL_CONTACT_FAST_FORWARD_SPEED_V2
    && (content.metadata?.scenarioId !== 'survival'
      || state.gameOver
      || hasRealSurvivalRogueHumanContactV2(state));
}
