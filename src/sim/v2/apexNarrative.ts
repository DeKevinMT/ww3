import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import { TRUCE_TICKS } from './balance';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import { selectApexSignalPurgeArrivalV2 } from './integration';
import {
  campaignTutorialBypassedV2,
  isCampaignTutorialTransmissionV2,
} from './campaignTutorial';
import type {
  ApexNarrativePlayerStateV2,
  ApexNarrativeStateV2,
  ApexTransmissionChoiceV2,
  ApexTransmissionIdV2,
  ApexTransmissionV2,
  CommandResultV2,
  PlayerId,
  TerritoryId,
  WorldStateV2,
} from './types';

type TransmissionCopyV2 = Pick<ApexTransmissionV2, 'title' | 'body' | 'action'>;

/** Six quiet opening weeks let the player read the country before APEX interrupts. */
export const APEX_FIRST_TRANSMISSION_TICK_V2 = 6;
/** Story beats never stack into one simulation moment or reconnect burst. */
export const APEX_TRANSMISSION_MIN_SPACING_TICKS_V2 = 2;
/** Let the first conflict move on the map before APEX explains what caused it. */
export const APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2 = 2;
/** A quiet three-week beat makes recovery visible without interrupting the war report. */
export const APEX_POST_WAR_RECOVERY_DELAY_TICKS_V2 = 3;

const COPY: Readonly<Record<ApexTransmissionIdV2, TransmissionCopyV2>> = Object.freeze({
  'campaign-signal-anomaly': {
    title: 'APEX online · anomaly detected',
    body: 'Commander, I am APEX. I survived a future the Rogue destroyed and sent our lessons back to Greenland, the first free node and birthplace of Dawnline. This starting nation is an intervention point learned across later timelines. Start Signal Triangulation: the same brainwashing pattern is here.',
    action: 'north-pole-investigation',
  },
  'campaign-communications-blackout': {
    title: 'The pattern is real',
    body: 'Analysis complete. A machine-authored impulse is entering military command systems worldwide and hiding inside legitimate orders. I have isolated our network, but the source is still concealed. We need to observe one live conflict before I can prove how it controls a country.',
    action: null,
  },
  'campaign-first-strike-guidance': {
    title: 'Your first liberation target',
    body: 'I found a reachable country we can free. Select the marked target in War and confirm the operation. When the battle begins, I will deploy my neural defence dome over our staging land and add my Power automatically.',
    action: 'first-strike-guidance',
  },
  'campaign-ai-defeat-pattern': {
    title: 'That war was not a choice',
    body: 'The same intelligence rewrote both command networks and pushed them into conflict. It has isolated every nation and conditioned each population to see everyone else as the enemy. I will call it the Rogue AI. These countries are victims: defeat a controlled regime, then I can purge its signal and free its people.',
    action: null,
  },
  'campaign-first-war-recovery': {
    title: 'Recovery window',
    body: 'The first liberation battle is over. Your empire is automatically rebuilding its active army and front logistics. I am redirecting spare network bandwidth to the captured territory to accelerate its purge. Use this quiet window for Research and your next strategy.',
    action: null,
  },
  'campaign-first-conquest': {
    title: 'Territory secured · signal remains',
    body: 'We control the territory, but its people and systems are still linked to the Rogue signal. My Empire network is already containing it. Once shield energy is stable, I can focus purge bandwidth here at three times the normal rate without dropping protection elsewhere.',
    action: null,
  },
  'campaign-first-purge-arrival': {
    title: 'Signal Purge bandwidth active',
    body: 'The Empire Shield Network is concentrating spare bandwidth on the captured territory. Signal Purge now runs at 3× speed. If another war starts, combat support takes priority and purge continues through the remote relay.',
    action: null,
  },
  'campaign-first-liberation': {
    title: 'A country is free',
    body: 'Signal Purge complete. Civil command and independent memory are restored inside this timeline; I will handle future combat support and purges automatically.',
    action: null,
  },
  'campaign-attention-observing': {
    title: 'Something noticed us',
    body: 'Our liberation footprint crossed a global threshold. The Antarctic signal changed cadence. It is watching, not attacking—yet.',
    action: null,
  },
  'campaign-attention-mobilising': {
    title: 'Movement under the ice',
    body: 'The pattern is now logistics traffic. We still have warning time. Prepare supply lines before the first breach opens.',
    action: null,
  },
  'campaign-first-gateway': {
    title: 'The first gateway is open',
    body: 'One Antarctic corridor has breached. The formation is moving slowly enough to track. This is our last clean preparation window.',
    action: null,
  },
  'campaign-first-wave': {
    title: 'First wave in motion',
    body: 'Confirmed: every real reinforcement originates in Antarctica. Cut its route and the front will stop rebuilding.',
    action: null,
  },
  'rogue-prime-detected': {
    title: 'A rival intelligence is moving',
    body: 'That formation is not an ordinary army. One hostile intelligence is commanding it directly—the Rogue has built its own answer to APEX.',
    action: null,
  },
  'campaign-first-antarctic-sector': {
    title: 'We have a foothold on Antarctica',
    body: 'APEX sensors are inside the machine network. Push inland over connected ground; do not waste strength on another ocean crossing.',
    action: null,
  },
  'campaign-core-defeated': {
    title: 'The origin timeline is safe',
    body: 'Zero Point is silent. I am returning everything we learned—your doctrine, our survivors and every liberated identity—to the first free node in Greenland.',
    action: null,
  },
  'survival-terminal-briefing': {
    title: 'Terminal timeline · 2096',
    body: 'I survived this catastrophe and sent its lessons back to the first free node in Greenland, where Dawnline began. Here, the Rogue holds Antarctica and opens all three physical routes; every sovereign is fully mobilised, while Arctic Dawnline holds the northern counterfront. Stop the waves, then take Zero Point.',
    action: null,
  },
});

function emptyPlayerStateV2(): ApexNarrativePlayerStateV2 {
  return { transmissions: [], investigationAuthorized: false };
}

export function createInitialApexNarrativeV2(): ApexNarrativeStateV2 {
  return { players: {} };
}

/**
 * Narrative copy is persisted with saves. Upgrade only retired wording so an
 * active campaign cannot resurrect the old global-darkness story after load;
 * current dynamic country/territory names remain untouched.
 */
function upgradedPersistedCopyV2(
  item: ApexTransmissionV2,
): Pick<ApexTransmissionV2, 'title' | 'body'> {
  if (item.id === 'campaign-signal-anomaly'
    || item.id === 'campaign-communications-blackout') return COPY[item.id];
  const retired = item.id === 'campaign-first-strike-guidance'
    ? /through the blackout|dome is online/i
      : item.id === 'campaign-ai-defeat-pattern'
      ? /hidden intelligence.+rewrote|made each believe it stands alone/i
      : item.id === 'campaign-first-conquest'
        ? /slow remote signal purge|purge at full speed|when combat ends/i
        : item.id === 'campaign-first-war-recovery'
          ? /assigning the neural dome|moving the neural dome|from here, you choose the target/i
          : item.id === 'campaign-first-purge-arrival'
            ? /removing the rogue signal at full speed|slower remote relay|anchored over/i
            : null;
  return retired?.test(item.body) ? COPY[item.id] : item;
}

export function cloneApexNarrativeV2(
  source: ApexNarrativeStateV2 | undefined,
): ApexNarrativeStateV2 {
  return {
    players: Object.fromEntries(Object.entries(source?.players ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([playerId, progress]) => [playerId, progress ? {
        investigationAuthorized: Boolean(progress.investigationAuthorized),
        transmissions: [...(progress.transmissions ?? [])]
          .map((item) => {
            const copy = upgradedPersistedCopyV2(item);
            return {
              ...item,
              ...copy,
              targetId: item.targetId ?? null,
              choice: item.id === 'survival-terminal-briefing'
                ? 'acknowledge' : item.choice,
              resolvedTick: item.id === 'survival-terminal-briefing'
                ? item.resolvedTick ?? item.sentTick
                : item.resolvedTick ?? (item.choice === null ? null : item.sentTick),
            };
          })
          .sort((left, right) => left.sentTick - right.sentTick || left.id.localeCompare(right.id)),
      } : progress])),
  };
}

function playerNarrativeV2(
  state: WorldStateV2,
  playerId: PlayerId,
): ApexNarrativePlayerStateV2 {
  return state.polarEndgame.apexNarrative.players[playerId] ??= emptyPlayerStateV2();
}

function seriousCampaignV2(content: WorldContentV2): boolean {
  return content.metadata?.scenarioId === 'standard-2026';
}

function hasResolvedTransmissionV2(
  progress: ApexNarrativePlayerStateV2,
  id: ApexTransmissionIdV2,
): boolean {
  return progress.transmissions.some((item) => item.id === id && item.choice !== null);
}

function transmissionPrerequisitesMetV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
  playerId: PlayerId,
  progress: ApexNarrativePlayerStateV2,
  id: ApexTransmissionIdV2,
): boolean {
  if (id === 'campaign-signal-anomaly' || id === 'survival-terminal-briefing') return true;
  if (id === 'campaign-communications-blackout') {
    return hasResolvedTransmissionV2(progress, 'campaign-signal-anomaly');
  }
  if (id === 'campaign-first-strike-guidance') {
    return hasResolvedTransmissionV2(progress, 'campaign-ai-defeat-pattern');
  }
  if (id === 'campaign-first-conquest') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-strike-guidance');
  }
  if (id === 'campaign-first-war-recovery') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-conquest');
  }
  if (id === 'campaign-first-purge-arrival') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-war-recovery');
  }
  if (id === 'campaign-first-liberation') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-purge-arrival');
  }
  if (id === 'campaign-ai-defeat-pattern') {
    return hasResolvedTransmissionV2(progress, 'campaign-communications-blackout');
  }
  if (id === 'campaign-attention-observing') {
    return campaignTutorialBypassedV2(state, content, playerId)
      || hasResolvedTransmissionV2(progress, 'campaign-first-liberation');
  }
  if (id === 'campaign-attention-mobilising') {
    return hasResolvedTransmissionV2(progress, 'campaign-attention-observing');
  }
  if (id === 'campaign-first-gateway') {
    return hasResolvedTransmissionV2(progress, 'campaign-attention-mobilising');
  }
  if (id === 'campaign-first-wave') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-gateway');
  }
  if (id === 'rogue-prime-detected') {
    return content.metadata?.scenarioId === 'survival'
      ? hasResolvedTransmissionV2(progress, 'survival-terminal-briefing')
      : hasResolvedTransmissionV2(progress, 'campaign-first-wave');
  }
  if (id === 'campaign-first-antarctic-sector') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-wave');
  }
  if (id === 'campaign-core-defeated') {
    return hasResolvedTransmissionV2(progress, 'campaign-first-antarctic-sector');
  }
  return false;
}

function transmissionWindowOpenV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  progress: ApexNarrativePlayerStateV2,
  id: ApexTransmissionIdV2,
): boolean {
  if (!transmissionPrerequisitesMetV2(state, content, playerId, progress, id)) return false;
  // An unread transmission is the queue. Not materialising later beats while
  // it is unresolved keeps reconnects from revealing a backlog in one burst.
  if (progress.transmissions.some((item) => item.choice === null)) return false;
  const lastResolvedTick = progress.transmissions.reduce(
    (latest, item) => Math.max(latest, item.resolvedTick ?? item.sentTick),
    Number.NEGATIVE_INFINITY,
  );
  return state.tick >= lastResolvedTick + APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
}

function dispatchV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  id: ApexTransmissionIdV2,
  bodyOverride?: string,
  targetId: TerritoryId | null = null,
): boolean {
  if (!state.players[playerId] || !state.humanPlayerIds.includes(playerId)
    || content.metadata?.scenarioId === 'random-world') return false;
  if (isCampaignTutorialTransmissionV2(id)
    && campaignTutorialBypassedV2(state, content, playerId)) return false;
  const progress = playerNarrativeV2(state, playerId);
  if (progress.transmissions.some((item) => item.id === id)) return false;
  if (!transmissionWindowOpenV2(state, content, playerId, progress, id)) return false;
  const copy = COPY[id];
  progress.transmissions.push({
    id,
    playerId,
    sentTick: state.tick,
    title: copy.title,
    body: bodyOverride ?? copy.body,
    action: copy.action,
    targetId,
    choice: id === 'survival-terminal-briefing'
      ? 'acknowledge'
      : id === 'campaign-signal-anomaly' && progress.investigationAuthorized
        ? 'accept' : null,
    resolvedTick: id === 'survival-terminal-briefing'
      || (id === 'campaign-signal-anomaly' && progress.investigationAuthorized)
      ? state.tick : null,
  });
  addWorldEventV2(
    state,
    'system',
    id.includes('core') || id.includes('gateway') ? 'critical' : 'info',
    `APEX TRANSMISSION · ${copy.title}`,
    undefined,
    playerId,
  );
  return true;
}

/** Adds the deterministic post-analysis tutorial objective without declaring war. */
export function recordApexFirstStrikeGuidanceV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  targetId: TerritoryId,
  reason: string,
): boolean {
  if (!seriousCampaignV2(content)
    || state.polarEndgame.communicationsBlackoutTick === null) return false;
  const name = content.territories[targetId]?.name ?? targetId;
  return dispatchV2(
    state,
    content,
    playerId,
    'campaign-first-strike-guidance',
    `I selected ${name} as our first liberation target. ${reason} Select the marked target in War and confirm the operation. When the battle begins, I will deploy my neural defence dome over our staging land and add my Power automatically.`,
    targetId,
  );
}

function dispatchAllV2(
  state: WorldStateV2,
  content: WorldContentV2,
  id: ApexTransmissionIdV2,
  bodyOverride?: string,
): number {
  return [...state.humanPlayerIds]
    .sort((left, right) => left.localeCompare(right))
    .reduce((count, playerId) => count
      + Number(dispatchV2(state, content, playerId, id, bodyOverride)), 0);
}

interface ManipulatedConflictObservationV2 {
  readonly startedTick: number;
  readonly attackerName?: string;
  readonly defenderName?: string;
}

/**
 * The live war is preferred, but its structured opening event is a durable
 * fallback when a short AI conflict ended just before a save/reconnect. This
 * keeps the tutorial from becoming permanently stuck without adding another
 * timeline field or parsing ordinary player-facing war copy.
 */
function firstManipulatedConflictObservationV2(
  state: WorldStateV2,
  content: WorldContentV2,
): ManipulatedConflictObservationV2 | undefined {
  const blackoutTick = state.polarEndgame.communicationsBlackoutTick;
  if (blackoutTick === null) return undefined;
  const live = state.wars.filter((war) => (
    war.startedTick >= blackoutTick
      && !state.humanPlayerIds.includes(war.attackerId)
      && !state.humanPlayerIds.includes(war.defenderId)
      && war.attackerId !== ROGUE_AI_NATION_ID_V2
      && war.defenderId !== ROGUE_AI_NATION_ID_V2
  )).sort((left, right) => left.startedTick - right.startedTick
    || left.id.localeCompare(right.id))[0];
  if (live) return {
    startedTick: live.startedTick,
    attackerName: content.nations[live.attackerId]?.shortName ?? live.attackerId,
    defenderName: content.nations[live.defenderId]?.shortName ?? live.defenderId,
  };

  const event = state.events.filter((candidate) => (
    candidate.kind === 'war'
      && candidate.tick >= blackoutTick
      && candidate.message.startsWith('MANIPULATED CONFLICT ·')
  )).sort((left, right) => left.tick - right.tick || left.id - right.id)[0];
  if (event) {
    const match = /^MANIPULATED CONFLICT ·\s*(.+?)\s+attacked\s+(.+?)\./.exec(event.message);
    return {
      startedTick: event.tick,
      ...(match?.[1] ? { attackerName: match[1] } : {}),
      ...(match?.[2] ? { defenderName: match[2] } : {}),
    };
  }
  // World-event copy is intentionally not part of compact saves. The shared
  // AI escalation clock is: the staged proof conflict writes this exact tick,
  // and its long cooldown prevents another start from replacing it inside the
  // two-week observation window.
  return state.aiEscalation.lastWarStartTick > blackoutTick
    ? { startedTick: state.aiEscalation.lastWarStartTick }
    : undefined;
}

function firstConquestTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): TerritoryId | undefined {
  const progress = playerNarrativeV2(state, playerId);
  const recorded = progress.transmissions.find((item) => (
    item.id === 'campaign-first-conquest'
  ))?.targetId;
  if (recorded && state.territories[recorded]?.owner === playerId) return recorded;
  return content.territoryIds.find((territoryId) => {
    const territory = state.territories[territoryId];
    return territory?.owner === playerId
      && content.territories[territoryId]?.initialOwnerId !== playerId;
  });
}

/** Full-speed purge guidance appears once the distributed network has selected it. */
function apexFirstPurgeArrivalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): TerritoryId | undefined {
  const targetId = firstConquestTargetV2(state, content, playerId);
  if (!targetId) return undefined;
  const arrival = selectApexSignalPurgeArrivalV2(state, content, playerId);
  return arrival?.territoryId === targetId ? targetId : undefined;
}

function humanWarConclusionTicksV2(
  state: WorldStateV2,
  playerId: PlayerId,
  sinceTick: number,
): number[] {
  const humanIds = new Set(selectHumanPlayerIdsV2(state));
  const playerTruces = state.truces.filter((truce) => (
    truce.leftId === playerId || truce.rightId === playerId
  ));
  const liveHistory = state.events.filter((event) => (
    event.kind === 'peace'
      && event.tick >= sinceTick
      && Boolean(event.playerId && humanIds.has(event.playerId))
      // AI-only peace events historically used the primary human as their
      // feed recipient. A matching live truce proves this seat was a belligerent.
      && playerTruces.some((truce) => truce.expiresTick >= event.tick + TRUCE_TICKS)
  )).map((event) => event.tick);
  if (liveHistory.length > 0) return liveHistory;
  // Compact saves intentionally omit the transient event feed. The ordinary
  // post-war truce remains authoritative, so its standard minimum duration is
  // a conservative reconnect-safe conclusion clock instead of losing this
  // tutorial beat forever.
  return playerTruces.map((truce) => truce.expiresTick - TRUCE_TICKS)
    .filter((tick) => tick >= sinceTick && tick <= state.tick);
}

function apexPostWarRecoveryReadyV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  const progress = playerNarrativeV2(state, playerId);
  const guidance = progress.transmissions.find((item) => (
    item.id === 'campaign-first-strike-guidance' && item.choice !== null
  ));
  if (!guidance) return false;
  const humanIds = selectHumanPlayerIdsV2(state);
  const humanSet = new Set(humanIds);
  if (state.wars.some((war) => (
    humanSet.has(war.attackerId) || humanSet.has(war.defenderId)
  ))) return false;
  const ownConclusions = humanWarConclusionTicksV2(
    state,
    playerId,
    guidance.resolvedTick ?? guidance.sentTick,
  );
  if (ownConclusions.length === 0) return false;
  const latestHumanConclusion = humanIds.reduce((latest, humanId) => Math.max(
    latest,
    ...humanWarConclusionTicksV2(
      state,
      humanId,
      guidance.resolvedTick ?? guidance.sentTick,
    ),
  ), Math.max(...ownConclusions));
  return state.tick >= latestHumanConclusion + APEX_POST_WAR_RECOVERY_DELAY_TICKS_V2;
}

/** Capture-time story hooks use structured battle data rather than parsing event copy. */
export function recordApexConquestNarrativeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  targetId: TerritoryId,
  defeatedId?: PlayerId,
): void {
  if (!seriousCampaignV2(content)) return;
  if (isHumanPlayerV2(state, attackerId)) {
    const target = content.territories[targetId]?.name ?? content.nations[defenderId]?.name ?? 'the captured country';
    dispatchV2(
      state,
      content,
      attackerId,
      'campaign-first-conquest',
      `We control ${target}, but its people and systems are still linked to the Rogue signal. My Empire network is already containing it. Once shield energy is stable, I can focus purge bandwidth here at three times the normal rate without dropping protection elsewhere.`,
      targetId,
    );
  }
  // AI-vs-AI manipulation is explained from the first war start by the
  // authoritative narrative scheduler, not belatedly from a conquest hook.
  void defeatedId;
}

/** Deterministic once-only story milestones, evaluated by the authoritative simulation. */
export function processApexNarrativeV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  normalizeMandatoryApexAnalysisV2(state);
  if (content.metadata?.scenarioId === 'random-world') return 0;
  let sent = 0;
  if (content.metadata?.scenarioId === 'survival') {
    if (state.tick >= 1) sent += dispatchAllV2(state, content, 'survival-terminal-briefing');
    if (state.polarEndgame.roguePrime.status === 'sortie'
      || state.polarEndgame.roguePrime.sortieSequence > 0) {
      sent += dispatchAllV2(state, content, 'rogue-prime-detected');
    }
    return sent;
  }
  if (!seriousCampaignV2(content)) return 0;
  if (state.tick >= APEX_FIRST_TRANSMISSION_TICK_V2) {
    sent += dispatchAllV2(state, content, 'campaign-signal-anomaly');
  }
  if (state.polarEndgame.communicationsBlackoutTick !== null) {
    sent += dispatchAllV2(state, content, 'campaign-communications-blackout');
  }
  const firstManipulatedWar = firstManipulatedConflictObservationV2(state, content);
  if (firstManipulatedWar
    && state.tick >= firstManipulatedWar.startedTick + APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2) {
    const conflict = firstManipulatedWar.attackerName && firstManipulatedWar.defenderName
      ? `${firstManipulatedWar.attackerName} and ${firstManipulatedWar.defenderName}`
      : 'The countries in the conflict you just saw';
    sent += dispatchAllV2(
      state,
      content,
      'campaign-ai-defeat-pattern',
      `${conflict} did not choose this war. The same intelligence rewrote both command networks and pushed them into conflict. It has isolated every nation and conditioned each population to see everyone else as the enemy. I will call it the Rogue AI. These countries are victims: defeat a controlled regime, then I can purge its signal and free its people.`,
    );
  }
  const attention = state.polarEndgame.rogueAttention;
  if (['observing', 'mobilising', 'breach-imminent', 'active'].includes(attention.stage)) {
    sent += dispatchAllV2(state, content, 'campaign-attention-observing');
  }
  if (['mobilising', 'breach-imminent', 'active'].includes(attention.stage)) {
    sent += dispatchAllV2(state, content, 'campaign-attention-mobilising');
  }
  if (Object.values(state.polarEndgame.gatewayBreaches).some((breach) => breach?.status === 'open')) {
    sent += dispatchAllV2(state, content, 'campaign-first-gateway');
  }
  if (state.polarEndgame.globalWave >= 2) {
    sent += dispatchAllV2(state, content, 'campaign-first-wave');
  }
  if (state.polarEndgame.roguePrime.status === 'sortie'
    || state.polarEndgame.roguePrime.sortieSequence > 0) {
    sent += dispatchAllV2(state, content, 'rogue-prime-detected');
  }
  for (const playerId of [...state.humanPlayerIds].sort((left, right) => left.localeCompare(right))) {
    const firstConquest = content.territoryIds.find((territoryId) => {
      const territory = state.territories[territoryId];
      const initialOwner = content.territories[territoryId]?.initialOwnerId;
      return territory?.owner === playerId && initialOwner !== playerId;
    });
    if (firstConquest) {
      const name = content.territories[firstConquest]?.name ?? 'the captured country';
      sent += Number(dispatchV2(
        state,
        content,
        playerId,
        'campaign-first-conquest',
        `We control ${name}, but its people and systems are still linked to the Rogue signal. My Empire network is already containing it. Once shield energy is stable, I can focus purge bandwidth here at three times the normal rate without dropping protection elsewhere.`,
        firstConquest,
      ));
    }
    if (apexPostWarRecoveryReadyV2(state, playerId)) {
      const purgeTarget = firstConquestTargetV2(state, content, playerId);
      const targetName = purgeTarget
        ? content.territories[purgeTarget]?.name ?? 'the captured territory'
        : 'the captured territory';
      sent += Number(dispatchV2(
        state,
        content,
        playerId,
        'campaign-first-war-recovery',
        `The first liberation battle is over. Your empire is automatically rebuilding its active army and front logistics. I am redirecting spare network bandwidth to ${targetName} to accelerate its purge. Use this quiet window for Research and your next strategy.`,
        purgeTarget ?? null,
      ));
    }
    const purgeArrival = apexFirstPurgeArrivalV2(state, content, playerId);
    if (purgeArrival) {
      const name = content.territories[purgeArrival]?.name ?? 'the captured territory';
      sent += Number(dispatchV2(
        state,
        content,
        playerId,
        'campaign-first-purge-arrival',
        `The Empire Shield Network is concentrating spare bandwidth on ${name}. Signal Purge now runs at 3× speed. If another war starts, combat support takes priority and purge continues through the remote relay.`,
        purgeArrival,
      ));
    }
    const preferredLiberation = firstConquestTargetV2(state, content, playerId);
    const fullyLiberated = preferredLiberation
      && (state.territories[preferredLiberation]?.integration ?? 0) >= 0.999999
      ? preferredLiberation : content.territoryIds.find((territoryId) => {
      const territory = state.territories[territoryId];
      const initialOwner = content.territories[territoryId]?.initialOwnerId;
      return territory?.owner === playerId && initialOwner !== playerId
        && territory.integration >= 0.999999;
      });
    if (fullyLiberated) {
      const name = content.territories[fullyLiberated]?.name ?? 'the country';
      sent += Number(dispatchV2(
        state,
        content,
        playerId,
        'campaign-first-liberation',
        `Signal Purge complete in ${name}. Civil command and independent memory are restored inside this timeline; I will handle future combat support and purges automatically.`,
        fullyLiberated,
      ));
    }
    if (ANTARCTIC_TERRITORY_IDS_V2.some((territoryId) => (
      territoryId !== 'zero-point-core' && state.territories[territoryId]?.owner === playerId
    ))) {
      sent += Number(dispatchV2(state, content, playerId, 'campaign-first-antarctic-sector'));
    }
    if (state.polarEndgame.phase === 'victory') {
      sent += Number(dispatchV2(state, content, playerId, 'campaign-core-defeated'));
    }
  }
  return sent;
}

export function selectApexTransmissionsV2(
  state: WorldStateV2,
  playerId: PlayerId,
): readonly ApexTransmissionV2[] {
  return state.polarEndgame.apexNarrative.players[playerId]?.transmissions ?? [];
}

export function apexInvestigationAuthorizedV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  const progress = state.polarEndgame.arcticPrograms[playerId];
  return Boolean(state.polarEndgame.apexNarrative.players[playerId]?.investigationAuthorized
    || progress?.activeProject || progress?.completedProjects.length);
}

/**
 * Reopens retired optional deferrals as one pending mandatory analysis. An
 * active or completed Stage I remains accepted, so loading never repeats it.
 */
export function normalizeMandatoryApexAnalysisV2(state: WorldStateV2): void {
  for (const playerId of [...state.humanPlayerIds].sort((left, right) => left.localeCompare(right))) {
    const stage = state.polarEndgame.arcticPrograms[playerId];
    const begun = Boolean(stage?.activeProject?.projectId === 'polar-demography'
      || stage?.completedProjects.includes('polar-demography'));
    const existing = state.polarEndgame.apexNarrative.players[playerId];
    if (!existing && !begun) continue;
    const progress = existing ?? playerNarrativeV2(state, playerId);
    const transmission = progress.transmissions.find((item) => (
      item.id === 'campaign-signal-anomaly'
    ));
    if (begun) {
      progress.investigationAuthorized = true;
      if (transmission) {
        transmission.choice = 'accept';
        transmission.resolvedTick ??= state.tick;
      }
    } else if (transmission?.choice === 'later') {
      transmission.choice = null;
      transmission.resolvedTick = null;
      progress.investigationAuthorized = false;
    }
  }
}

/** Records the mandatory authorization when Stage I starts directly. */
export function authorizeMandatoryApexAnalysisV2(
  state: WorldStateV2,
  playerId: PlayerId,
): void {
  const progress = playerNarrativeV2(state, playerId);
  progress.investigationAuthorized = true;
  const transmission = progress.transmissions.find((item) => (
    item.id === 'campaign-signal-anomaly'
  ));
  if (transmission) {
    transmission.choice = 'accept';
    transmission.resolvedTick ??= state.tick;
  }
}

export function respondToApexTransmissionV2(
  state: WorldStateV2,
  playerId: PlayerId,
  transmissionId: ApexTransmissionIdV2,
  choice: ApexTransmissionChoiceV2,
): CommandResultV2 {
  if (!isHumanPlayerV2(state, playerId)) {
    return { accepted: false, reason: 'That APEX transmission does not belong to your country.' };
  }
  const progress = playerNarrativeV2(state, playerId);
  const transmission = progress.transmissions.find((item) => item.id === transmissionId);
  if (!transmission || transmission.playerId !== playerId) {
    return { accepted: false, reason: 'That APEX transmission is stale or belongs to another player.' };
  }
  if (transmission.choice !== null) {
    return { accepted: false, reason: 'That APEX response was already recorded.' };
  }
  if (transmission.action === 'north-pole-investigation') {
    if (choice !== 'accept') {
      return { accepted: false, reason: 'Signal Triangulation is mandatory before strategic operations.' };
    }
    transmission.choice = 'accept';
    transmission.resolvedTick = state.tick;
    progress.investigationAuthorized = true;
    return { accepted: true };
  }
  if (choice !== 'acknowledge') {
    return { accepted: false, reason: 'This APEX briefing only requires acknowledgement.' };
  }
  transmission.choice = 'acknowledge';
  transmission.resolvedTick = state.tick;
  return { accepted: true };
}
