import type { WorldContentV2 } from '../sim/v2/content';
import type { PlayerId, WorldStateV2 } from '../sim/v2/types';

/**
 * True only when the active commander currently owns and has fully purged
 * every territory that originally belonged to one ordinary country.
 * Immutable content ownership is used because live `coreOwner` changes at the
 * end of each integration program.
 */
export function campaignCountrySignalPurgeCompleteV1(
  state: Pick<WorldStateV2, 'territories'>,
  content: Pick<WorldContentV2, 'territoryIds' | 'territories'>,
  commanderId: PlayerId,
  countryId: PlayerId,
): boolean {
  if (commanderId === countryId) return false;
  const homelandIds = content.territoryIds.filter((territoryId) => (
    content.territories[territoryId]?.initialOwnerId === countryId
  ));
  return homelandIds.length > 0 && homelandIds.every((territoryId) => {
    const territory = state.territories[territoryId];
    return territory?.owner === commanderId
      && territory.coreOwner === commanderId
      && territory.integration >= 1
      && !territory.integrationProgram;
  });
}
