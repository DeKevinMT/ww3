import type { GameModeV2 } from '../sim/v2/scenarios';

export type LoadingTipAudience = 'boot' | 'campaign' | 'survival' | 'alternative-universe';

export interface LoadingTipV1 {
  readonly id: string;
  readonly text: string;
  readonly audiences: readonly LoadingTipAudience[];
}

const EVERYWHERE: readonly LoadingTipAudience[] = [
  'boot', 'campaign', 'survival', 'alternative-universe',
];
const SERIOUS_MODES: readonly LoadingTipAudience[] = ['boot', 'campaign', 'survival'];

/**
 * Short, stable facts only. Keep retired systems and volatile balance numbers
 * out of this pool so an old browser cache never teaches the wrong rules.
 */
export const LOADING_TIPS_V1: readonly LoadingTipV1[] = Object.freeze([
  { id: 'week', text: 'At normal speed, one real second advances the world by one day.', audiences: EVERYWHERE },
  { id: 'inspect', text: 'Select any nation to inspect its Power, army, supply, terrain and legal actions.', audiences: EVERYWHERE },
  { id: 'controls', text: 'Scroll to zoom, drag to rotate and press Esc to close the active panel.', audiences: EVERYWHERE },
  { id: 'power', text: 'Combat Power is the fastest way to compare military strength.', audiences: EVERYWHERE },
  { id: 'power-inputs', text: 'Manpower, ATK, DEF, terrain and supply all shape Combat Power.', audiences: EVERYWHERE },
  { id: 'combined-power', text: 'Combined Power includes national forces and the active EONSCAR Shield Network.', audiences: SERIOUS_MODES },
  { id: 'army-ready', text: 'Army Ready shows how close deployed forces are to their current capacity.', audiences: EVERYWHERE },
  { id: 'wartime-training', text: 'National recruitment stops during war, so rebuild your Army before opening another front.', audiences: EVERYWHERE },
  { id: 'peace-recovery', text: 'At peace, each country refills its active Army directly every day.', audiences: EVERYWHERE },
  { id: 'army-readiness', text: 'Army readiness shows how much of your current military capacity is fielded.', audiences: EVERYWHERE },
  { id: 'logistics', text: 'Logistics Readiness is the live supply level across your active fronts.', audiences: EVERYWHERE },
  { id: 'low-supply', text: 'Low supply reduces front strength and delays distant operations.', audiences: EVERYWHERE },
  { id: 'land-routes', text: 'Land borders are the most reliable routes for expansion.', audiences: EVERYWHERE },
  { id: 'naval-routes', text: 'Long naval routes move troops slowly and cost more to sustain.', audiences: EVERYWHERE },
  { id: 'foothold', text: 'A foothold makes future operations on that continent far easier.', audiences: EVERYWHERE },
  { id: 'treasury', text: 'The treasury pays essentials first, then reinvests surplus automatically.', audiences: EVERYWHERE },
  { id: 'debt', text: 'Debt can block new wars and slow discretionary spending.', audiences: EVERYWHERE },
  { id: 'shield-global', text: 'EONSCAR projects one shared shield across your entire Empire.', audiences: SERIOUS_MODES },
  { id: 'shield-load', text: 'Every active front draws from the same EONSCAR Energy pool.', audiences: SERIOUS_MODES },
  { id: 'shield-integrity', text: 'EONSCAR Energy absorbs damage; it never counts as national manpower.', audiences: SERIOUS_MODES },
  { id: 'shield-collapse', text: 'At 0% Energy, the EONSCAR network must fully recharge before returning.', audiences: SERIOUS_MODES },
  { id: 'apex-priority', text: 'EONSCAR prioritises war support first and Signal Purges second.', audiences: SERIOUS_MODES },
  { id: 'purge-parallel', text: 'Supplied active fronts can progress their Signal Purges in parallel.', audiences: ['campaign'] },
  { id: 'purge-permanent', text: 'Signal Purge progress never rolls back.', audiences: ['campaign'] },
  { id: 'apex-level', text: 'EONSCAR gains one free talent point every level and has no level cap.', audiences: SERIOUS_MODES },
  { id: 'timeline-lessons', text: 'EONSCAR carries lessons from lost futures back into account progression.', audiences: SERIOUS_MODES },
  { id: 'campaign-unlock', text: 'Campaign: defeating a nation unlocks it permanently for every mode.', audiences: ['campaign'] },
  { id: 'mastery-points', text: 'Country Mastery levels raise Army Capacity; every level after the first also grants one free specialization point.', audiences: SERIOUS_MODES },
  { id: 'mastery-scale', text: 'Stronger nations require more Mastery XP for each level.', audiences: SERIOUS_MODES },
  { id: 'mastery-frontier', text: 'Not every nation follows the same mastery curve. One frozen frontier rewards exceptional patience.', audiences: SERIOUS_MODES },
  { id: 'frozen-builds', text: 'Nation Mastery and EONSCAR talents are locked in when a timeline begins.', audiences: SERIOUS_MODES },
  { id: 'survival-mastery', text: 'Survival applies every unlocked nation’s Mastery to its home territory.', audiences: ['survival'] },
  { id: 'fun-mode', text: 'Alternative Universe is a pure fun mode with no account progression.', audiences: ['alternative-universe'] },
  { id: 'survival-year', text: 'Survival begins in 2096 with the Rogue AI already awake.', audiences: ['survival'] },
  { id: 'rogue-supply', text: 'Rogue conquests expand physically from Antarctica and enter rapid 4× assimilation.', audiences: ['survival'] },
  { id: 'survival-readiness', text: 'The Arctic countries begin inside your Empire as 50% Base Packets; unlocked countries deploy at full power with their Mastery.', audiences: ['survival'] },
  { id: 'annual-waves', text: 'Campaign Rogue waves rise from 1% to a permanent 5% active-army commitment.', audiences: ['campaign'] },
  { id: 'survival-waves', text: 'Every 52-day Survival wave manufactures 5% of the Rogue’s live Army as verified Antarctic reinforcements.', audiences: ['survival'] },
  { id: 'survival-gateways', text: 'Survival: all three Antarctic gateways are active from the opening.', audiences: ['survival'] },
  { id: 'antarctic-depth', text: 'Outer Antarctic sectors are weaker; Zero Point Core is the final stronghold.', audiences: ['survival', 'campaign'] },
  { id: 'timeline-end', text: 'Ending a timeline never reduces the progress you already earned.', audiences: SERIOUS_MODES },
] satisfies readonly LoadingTipV1[]);

export function loadingTipAudienceForModeV1(mode: GameModeV2): LoadingTipAudience {
  if (mode === 'standard-2026') return 'campaign';
  if (mode === 'survival') return 'survival';
  return 'alternative-universe';
}

export function selectLoadingTipV1(
  audience: LoadingTipAudience,
  previousId: string | undefined,
  randomValue = Math.random(),
): LoadingTipV1 {
  const matching = LOADING_TIPS_V1.filter((tip) => tip.audiences.includes(audience));
  const withoutImmediateRepeat = matching.filter((tip) => tip.id !== previousId);
  const candidates = withoutImmediateRepeat.length > 0 ? withoutImmediateRepeat : matching;
  if (candidates.length === 0) throw new Error(`No loading tips configured for ${audience}.`);
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(0.999_999_999, Math.max(0, randomValue)) : 0;
  return candidates[Math.floor(normalizedRandom * candidates.length)]!;
}
