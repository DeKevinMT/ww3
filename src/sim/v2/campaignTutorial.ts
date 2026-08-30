import type { WorldContentV2 } from './content';
import type {
  ApexTransmissionIdV2,
  PlayerId,
  WorldStateV2,
} from './types';

export const CAMPAIGN_TUTORIAL_PROJECT_ID_V2 = 'polar-demography' as const;

/**
 * These messages teach the opening Campaign loop and therefore belong only to
 * the commander's first played Campaign. Later strategic/story milestones are
 * deliberately not in this list.
 */
export const CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2: readonly ApexTransmissionIdV2[] = [
  'campaign-signal-anomaly',
  'campaign-communications-blackout',
  'campaign-ai-defeat-pattern',
  'campaign-first-strike-guidance',
  'campaign-first-conquest',
  'campaign-first-war-recovery',
  'campaign-first-purge-arrival',
  'campaign-first-liberation',
] as const;

const campaignTutorialTransmissionIdsV2 = new Set<ApexTransmissionIdV2>(
  CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2,
);

export function isCampaignTutorialTransmissionV2(
  id: ApexTransmissionIdV2,
): boolean {
  return campaignTutorialTransmissionIdsV2.has(id);
}

/**
 * A repeat Campaign is encoded entirely in save-stable simulation data: Stage
 * I is complete while no tutorial transmission exists. This avoids a second
 * per-run schema flag and survives save/reconnect once later story messages
 * have also entered the inbox.
 */
export function campaignTutorialBypassedV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return false;
  const research = state.polarEndgame.arcticPrograms[playerId];
  if (!research?.completedProjects.includes(CAMPAIGN_TUTORIAL_PROJECT_ID_V2)) return false;
  const transmissions = state.polarEndgame.apexNarrative.players[playerId]?.transmissions ?? [];
  return !transmissions.some((item) => isCampaignTutorialTransmissionV2(item.id));
}

/**
 * Prepares a new repeat Campaign. Signal Triangulation is granted without a
 * treasury charge, timer, tutorial event, or forced proof conflict. All later
 * North Pole research and genuine Rogue-world story milestones remain live.
 */
export function initializeExperiencedCampaignV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026'
    || !state.players[playerId]
    || !state.humanPlayerIds.includes(playerId)) return false;

  const research = state.polarEndgame.arcticPrograms[playerId] ?? {
    playerId,
    activeProject: null,
    completedProjects: [],
  };
  research.activeProject = research.activeProject?.projectId === CAMPAIGN_TUTORIAL_PROJECT_ID_V2
    ? null : research.activeProject;
  if (!research.completedProjects.includes(CAMPAIGN_TUTORIAL_PROJECT_ID_V2)) {
    research.completedProjects.unshift(CAMPAIGN_TUTORIAL_PROJECT_ID_V2);
  }
  state.polarEndgame.arcticPrograms[playerId] = research;

  const narrative = state.polarEndgame.apexNarrative.players[playerId] ?? {
    investigationAuthorized: true,
    transmissions: [],
  };
  narrative.investigationAuthorized = true;
  narrative.transmissions = narrative.transmissions.filter((item) => (
    !isCampaignTutorialTransmissionV2(item.id)
  ));
  state.polarEndgame.apexNarrative.players[playerId] = narrative;

  state.polarEndgame.communicationsBlackoutTick ??= state.tick;
  if (state.polarEndgame.phase === 'dormant') state.polarEndgame.phase = 'arctic-research';
  state.polarEndgame.visualRevision += 1;
  return true;
}
