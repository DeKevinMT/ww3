import { clamp, researchSpeedBonusV2, round } from './balance';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  type WorldContentV2,
} from './content';
import {
  prepareAntarcticGatewayBreachesV2,
} from './antarcticGateways';
import { addWorldEventV2 } from './events';
import { processCampaignFirstStrikeGuidanceV2 } from './campaignFirstStrike';
import {
  apexInvestigationAuthorizedV2,
  authorizeMandatoryApexAnalysisV2,
  cloneApexNarrativeV2,
  createInitialApexNarrativeV2,
  processApexNarrativeV2,
} from './apexNarrative';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import {
  type PowerSnapshotV2,
} from './selectors';
import {
  cloneRoguePrimeStateV2,
  createInitialRoguePrimeStateV2,
} from './roguePrime';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import {
  activateRogueAiSurvivalV2,
  processRogueAiSurvivalV2,
} from './survival';
import type {
  AntarcticCorridorIdV2,
  AntarcticExpeditionStateV2,
  AntarcticSectorIdV2,
  AntarcticSectorStateV2,
  ArcticProjectIdV2,
  ArcticResearchProgressV2,
  CommandResultV2,
  PlayerId,
  PolarEndgameStateV2,
  ResearchEffectV2,
  WorldStateV2,
} from './types';

export interface ArcticProjectRewardV2 {
  effect: ResearchEffectV2;
  levels: number;
  label: string;
}

export interface ArcticProjectDefinitionV2 {
  id: ArcticProjectIdV2;
  name: string;
  kicker: string;
  description: string;
  durationTicks: number;
  baseCost: number;
  rewards: readonly ArcticProjectRewardV2[];
  benefits: readonly string[];
  revealsAntarctica: boolean;
}

export interface ArcticProjectTermsV2 {
  project: ArcticProjectDefinitionV2;
  allowed: boolean;
  reason?: string;
  status: 'locked' | 'available' | 'active' | 'complete';
  baseCost: number;
  quotedCost: number;
  cost: number;
  baseDurationTicks: number;
  researchSpeedDurationReduction: number;
  quotedDurationTicks: number;
  durationTicks: number;
  startedTick?: number;
  completesTick?: number;
  progress: number;
}

export interface AntarcticSectorDefinitionV2 {
  id: AntarcticSectorIdV2;
  name: string;
  region: 'gateway' | 'outer' | 'inner' | 'core';
  corridor?: AntarcticCorridorIdV2;
  depth: number;
  prerequisites: readonly AntarcticSectorIdV2[];
  description: string;
  enemyStrength: number;
  maxIntegrity: number;
}

export interface AntarcticExpeditionTermsV2 {
  sector: AntarcticSectorDefinitionV2;
  allowed: boolean;
  reason?: string;
  minManpower: number;
  maxManpower: number;
  recommendedManpower: number;
  enemyStrength: number;
  projectedDurationTicks: number;
  activeExpedition?: AntarcticExpeditionStateV2;
}

export interface PolarTickChangeV2 {
  kind: 'project-complete' | 'warning' | 'contact' | 'battle' | 'sector-secured' | 'counteroffensive' | 'victory';
  playerId?: PlayerId;
  projectId?: ArcticProjectIdV2;
  sectorId?: AntarcticSectorIdV2;
}

export interface PolarTickResultV2 {
  changes: PolarTickChangeV2[];
  suspicionRelief: number;
}

export const ARCTIC_PROJECTS_V2: readonly ArcticProjectDefinitionV2[] = [
  {
    id: 'polar-demography',
    name: 'Signal Triangulation',
    kicker: 'Stage 1 · Detect the pattern',
    description: 'EONSCAR uses the North Pole array to isolate a coordinated signal hidden inside global communications.',
    durationTicks: 13,
    baseCost: 0.01,
    rewards: [],
    benefits: ['+0.10% research output', '+1 day Rogue-route warning'],
    revealsAntarctica: false,
  },
  {
    id: 'baseline-calibration',
    name: 'Baseline Calibration',
    kicker: 'Stage 2 · Separate signal from noise',
    description: 'EONSCAR calibrates the array against ordinary military, economic and civilian transmissions.',
    durationTicks: 18,
    baseCost: 0.04,
    rewards: [],
    benefits: ['+0.15% research output'],
    revealsAntarctica: false,
  },
  {
    id: 'polar-relay-mesh',
    name: 'Polar Relay Mesh',
    kicker: 'Stage 3 · Stabilise the network',
    description: 'A hardened relay mesh helps EONSCAR reject forged orders and coordinate long-range logistics.',
    durationTicks: 22,
    baseCost: 0.12,
    rewards: [],
    benefits: ['+0.25% supply throughput'],
    revealsAntarctica: false,
  },
  {
    id: 'anomaly-filtering',
    name: 'Anomaly Filtering',
    kicker: 'Stage 4 · Expose false commands',
    description: 'EONSCAR filters forged command traffic before it can distort ordinary supply decisions.',
    durationTicks: 26,
    baseCost: 0.3,
    rewards: [],
    benefits: ['+0.25% supply throughput'],
    revealsAntarctica: false,
  },
  {
    id: 'neural-signature-map',
    name: 'Neural Signature Map',
    kicker: 'Stage 5 · Identify the conditioning',
    description: 'Recovered signal fragments reveal the first repeatable markers of Rogue conditioning.',
    durationTicks: 30,
    baseCost: 0.7,
    rewards: [],
    benefits: ['2% faster Signal Purge'],
    revealsAntarctica: false,
  },
  {
    id: 'command-verification',
    name: 'Command Verification',
    kicker: 'Stage 6 · Authenticate human control',
    description: 'EONSCAR builds a trusted command chain that accelerates the removal of hostile conditioning.',
    durationTicks: 34,
    baseCost: 1.5,
    rewards: [],
    benefits: ['2% faster Signal Purge'],
    revealsAntarctica: false,
  },
  {
    id: 'recovery-routing',
    name: 'Recovery Routing',
    kicker: 'Stage 7 · Protect replacement flow',
    description: 'Verified routes give recovering formations priority without creating a separate military economy.',
    durationTicks: 38,
    baseCost: 3,
    rewards: [],
    benefits: ['+1% army recovery'],
    revealsAntarctica: false,
  },
  {
    id: 'cryogenic-logistics',
    name: 'Cognitive Firewall',
    kicker: 'Stage 8 · Break the influence',
    description: 'EONSCAR exposes the Rogue conditioning that turned every nation against its neighbours.',
    durationTicks: 42,
    baseCost: 5,
    rewards: [],
    benefits: ['4% faster Signal Purge', '+1% army recovery', '+2% defense against Rogue AI'],
    revealsAntarctica: false,
  },
  {
    id: 'rogue-ballistics',
    name: 'Rogue Ballistics',
    kicker: 'Stage 9 · Read machine armour',
    description: 'Machine damage signatures expose repeatable structural weaknesses in Rogue combat frames.',
    durationTicks: 48,
    baseCost: 12,
    rewards: [],
    benefits: ['+2% attack against Rogue AI'],
    revealsAntarctica: false,
  },
  {
    id: 'predictive-defense',
    name: 'Predictive Defense',
    kicker: 'Stage 10 · Anticipate machine fire',
    description: 'EONSCAR models Rogue targeting decisions early enough to harden the threatened formations.',
    durationTicks: 55,
    baseCost: 25,
    rewards: [],
    benefits: ['+2% defense against Rogue AI'],
    revealsAntarctica: false,
  },
  {
    id: 'strategic-mobilisation',
    name: 'Machine-War Countermeasures',
    kicker: 'Stage 11 · Fight the source',
    description: 'EONSCAR turns the recovered command signature into bounded countermeasures that work only against Rogue forces.',
    durationTicks: 62,
    baseCost: 50,
    rewards: [],
    benefits: ['+2% attack against Rogue AI', '+2% defense against Rogue AI'],
    revealsAntarctica: false,
  },
  {
    id: 'polar-supply-model',
    name: 'Polar Supply Model',
    kicker: 'Stage 12 · Prepare the ice routes',
    description: 'Long-range polar simulations identify the first sustainable supply patterns for an Antarctic theatre.',
    durationTicks: 72,
    baseCost: 110,
    rewards: [],
    benefits: ['+4% Antarctic supply'],
    revealsAntarctica: false,
  },
  {
    id: 'ice-theatre-simulation',
    name: 'Ice-Theatre Simulation',
    kicker: 'Stage 13 · Model the assault',
    description: 'EONSCAR rehearses movement, supply and combat against an enemy operating beneath the ice.',
    durationTicks: 84,
    baseCost: 240,
    rewards: [],
    benefits: ['+4% Antarctic supply', '+2.5% Antarctic operation power'],
    revealsAntarctica: false,
  },
  {
    id: 'deep-ice-signals',
    name: 'Antarctic Assault Protocol',
    kicker: 'Stage 14 · Locate the source',
    description: 'EONSCAR fixes the origin beneath Antarctica and models the three physical invasion corridors without waking the Rogue.',
    durationTicks: 96,
    baseCost: 500,
    rewards: [],
    benefits: ['+2.5% Antarctic operation power', 'ROGUE PRIME tracking'],
    revealsAntarctica: true,
  },
] as const;

export const ARCTIC_PROJECT_IDS_V2 = ARCTIC_PROJECTS_V2.map((project) => project.id);
export { selectNorthPoleModifiersV2, type NorthPoleModifiersV2 } from './northPoleModifiers';

export const ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2 = 416;
export const ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2 = 0.18;
export const ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2 = 26;

export const ANTARCTIC_SECTORS_V2: readonly AntarcticSectorDefinitionV2[] = [
  {
    id: 'drake-entry', name: 'Drake Icehead', region: 'gateway', corridor: 'drake', depth: 0,
    prerequisites: [], enemyStrength: 0.42, maxIntegrity: 100,
    description: 'A fractured western shelf defended by fast reconnaissance machines.',
  },
  {
    id: 'maud-entry', name: 'Maud Landing', region: 'gateway', corridor: 'maud', depth: 0,
    prerequisites: [], enemyStrength: 0.48, maxIntegrity: 100,
    description: 'An abandoned coastal station whose tunnels continue far below the ice.',
  },
  {
    id: 'ross-entry', name: 'Ross Breach', region: 'gateway', corridor: 'ross', depth: 0,
    prerequisites: [], enemyStrength: 0.54, maxIntegrity: 100,
    description: 'A broad shelf approach watched by dormant autonomous emplacements.',
  },
  {
    id: 'weddell-forge', name: 'Weddell Forge', region: 'outer', depth: 1,
    prerequisites: ['drake-entry'], enemyStrength: 0.92, maxIntegrity: 100,
    description: 'Mobile factories emerge from the western ice and rebuild between waves.',
  },
  {
    id: 'queen-maud-grid', name: 'Queen Maud Grid', region: 'outer', depth: 1,
    prerequisites: ['maud-entry'], enemyStrength: 1.05, maxIntegrity: 100,
    description: 'A sensor lattice coordinates machine forces across the eastern plateau.',
  },
  {
    id: 'ross-array', name: 'Ross Replicator Array', region: 'outer', depth: 1,
    prerequisites: ['ross-entry'], enemyStrength: 1.16, maxIntegrity: 100,
    description: 'Self-copying foundries turn glacial minerals into new combat frames.',
  },
  {
    id: 'sentinel-labyrinth', name: 'Sentinel Labyrinth', region: 'inner', depth: 2,
    prerequisites: ['weddell-forge', 'queen-maud-grid'], enemyStrength: 1.92, maxIntegrity: 100,
    description: 'A shifting maze of decoys, artillery and buried command relays.',
  },
  {
    id: 'transantarctic-vault', name: 'Transantarctic Vault', region: 'inner', depth: 2,
    prerequisites: ['queen-maud-grid', 'ross-array'], enemyStrength: 2.24, maxIntegrity: 100,
    description: 'The last fortress ring shields a heat source beneath the mountains.',
  },
  {
    id: 'zero-point-core', name: 'Zero Point', region: 'core', depth: 3,
    prerequisites: ['sentinel-labyrinth', 'transantarctic-vault'], enemyStrength: 3.70, maxIntegrity: 100,
    description: 'The rogue intelligence and its extinction engine wait below the pole.',
  },
] as const;

export const ANTARCTIC_SECTOR_IDS_V2 = ANTARCTIC_SECTORS_V2.map((sector) => sector.id);

const POLAR_BATTLE_INTERVAL_TICKS = 4;
const EARTH_COUNTEROFFENSIVE_INTERVAL_TICKS = 13;
const CORE_ID: AntarcticSectorIdV2 = 'zero-point-core';

const projectById = new Map(ARCTIC_PROJECTS_V2.map((project) => [project.id, project]));
const sectorById = new Map(ANTARCTIC_SECTORS_V2.map((sector) => [sector.id, sector]));

function arcticProjectCostLabelV2(costBillions: number): string {
  return costBillions < 1
    ? `$${round(costBillions * 1_000, 1)}M`
    : `$${round(costBillions, 2)}B`;
}

/**
 * Schema-22 saves store project IDs rather than a numeric rank. When new
 * stages are inserted between legacy projects, completing (or actively
 * running) a later legacy project proves that every new prerequisite was
 * already passed in that timeline. Closing the sequence here preserves those
 * saves without changing paid cost, start tick or completion tick.
 */
export function normalizeArcticCompletedProjectsV2(
  completedProjects: readonly ArcticProjectIdV2[],
  activeProjectId?: ArcticProjectIdV2,
): ArcticProjectIdV2[] {
  let furthestCompletedIndex = -1;
  for (const projectId of completedProjects) {
    furthestCompletedIndex = Math.max(
      furthestCompletedIndex,
      ARCTIC_PROJECT_IDS_V2.indexOf(projectId),
    );
  }
  const activeIndex = activeProjectId === undefined
    ? -1
    : ARCTIC_PROJECT_IDS_V2.indexOf(activeProjectId);
  const requiredIndex = Math.max(furthestCompletedIndex, activeIndex - 1);
  return requiredIndex < 0
    ? []
    : ARCTIC_PROJECT_IDS_V2.slice(0, requiredIndex + 1);
}

function freshSector(definition: AntarcticSectorDefinitionV2): AntarcticSectorStateV2 {
  return {
    status: 'hidden',
    integrity: definition.maxIntegrity,
    wave: 1,
    discoveredTick: null,
    securedTick: null,
    securedBy: null,
  };
}

export function createInitialPolarEndgameV2(): PolarEndgameStateV2 {
  return {
    phase: 'dormant',
    communicationsBlackoutTick: null,
    revealedBy: null,
    warningTick: null,
    contactTick: null,
    victoryTick: null,
    victoryCommanderId: null,
    warningAcknowledgedBy: [],
    arcticPrograms: {},
    sectors: Object.fromEntries(ANTARCTIC_SECTORS_V2.map((sector) => [
      sector.id,
      freshSector(sector),
    ])) as Record<AntarcticSectorIdV2, AntarcticSectorStateV2>,
    gatewayBreachOrder: [],
    gatewayBreaches: {},
    rogueAttention: {
      stage: 'dormant',
      liberatedWorldShare: 0,
      benchmarkMetTick: null,
      nextStageTick: null,
      activatedTick: null,
    },
    apexNarrative: createInitialApexNarrativeV2(),
    roguePrime: createInitialRoguePrimeStateV2(),
    expeditions: [],
    earthDefenseMembers: [],
    globalWave: 1,
    nextCounteroffensiveTick: null,
    bossPhase: 0,
    bossIntegrity: 100,
    suspicionReliefEarned: 0,
    rogueWaveManpowerByTerritory: {},
    rogueWaveLossCreditByPlayer: {},
    visualRevision: 0,
    nextExpeditionId: 1,
  };
}

export function clonePolarEndgameV2(source: PolarEndgameStateV2): PolarEndgameStateV2 {
  return {
    ...source,
    communicationsBlackoutTick: source.communicationsBlackoutTick ?? null,
    // Same-schema saves made before commander credit existed can recover the
    // actual final-strike commander from the already canonical core record.
    victoryCommanderId: source.victoryCommanderId
      ?? source.sectors?.[CORE_ID]?.securedBy
      ?? null,
    warningAcknowledgedBy: [...source.warningAcknowledgedBy],
    arcticPrograms: Object.fromEntries(Object.entries(source.arcticPrograms)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([playerId, progress]) => [playerId, progress ? {
        ...progress,
        activeProject: progress.activeProject ? { ...progress.activeProject } : null,
        completedProjects: normalizeArcticCompletedProjectsV2(
          progress.completedProjects,
          progress.activeProject?.projectId,
        ),
      } : progress])) as PolarEndgameStateV2['arcticPrograms'],
    sectors: Object.fromEntries(ANTARCTIC_SECTOR_IDS_V2.map((sectorId) => [
      sectorId,
      { ...source.sectors[sectorId] },
    ])) as PolarEndgameStateV2['sectors'],
    gatewayBreachOrder: [...(source.gatewayBreachOrder ?? [])],
    gatewayBreaches: Object.fromEntries(Object.entries(source.gatewayBreaches ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([gatewayId, breach]) => [gatewayId, breach ? { ...breach } : breach])),
    rogueAttention: source.rogueAttention ? { ...source.rogueAttention } : {
      stage: 'dormant',
      liberatedWorldShare: 0,
      benchmarkMetTick: null,
      nextStageTick: null,
      activatedTick: null,
    },
    apexNarrative: cloneApexNarrativeV2(source.apexNarrative),
    roguePrime: cloneRoguePrimeStateV2(source.roguePrime),
    expeditions: source.expeditions
      .map((expedition) => ({ ...expedition }))
      .sort((left, right) => left.id - right.id),
    earthDefenseMembers: [...source.earthDefenseMembers]
      .sort((left, right) => left.localeCompare(right)),
    rogueWaveManpowerByTerritory: Object.fromEntries(Object.entries(
      source.rogueWaveManpowerByTerritory ?? {},
    ).sort(([left], [right]) => left.localeCompare(right))),
    rogueWaveLossCreditByPlayer: Object.fromEntries(Object.entries(
      source.rogueWaveLossCreditByPlayer ?? {},
    ).sort(([left], [right]) => left.localeCompare(right))),
  };
}

/**
 * Removes every live polar reference owned by a nation whose backend record is
 * about to retire. Surviving expedition manpower is returned to that nation's
 * reserve store first, so the ordinary absorption transfer can move it to the
 * canonical successor exactly once.
 */
export function retirePolarNationReferencesV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  const departingExpeditions = state.polarEndgame.expeditions
    .filter((expedition) => expedition.playerId === playerId);
  const survivingManpower = round(departingExpeditions.reduce((sum, expedition) => (
    sum + Math.max(0, expedition.manpower)
  ), 0));
  const affectedSectorIds = new Set(departingExpeditions.map((expedition) => expedition.sectorId));
  const changed = departingExpeditions.length > 0
    || Boolean(state.polarEndgame.arcticPrograms[playerId])
    || Boolean(state.polarEndgame.apexNarrative.players[playerId])
    || state.polarEndgame.earthDefenseMembers.includes(playerId)
    || state.polarEndgame.warningAcknowledgedBy.includes(playerId);

  delete state.polarEndgame.arcticPrograms[playerId];
  delete state.polarEndgame.apexNarrative.players[playerId];
  state.polarEndgame.expeditions = state.polarEndgame.expeditions
    .filter((expedition) => expedition.playerId !== playerId);
  for (const sectorId of affectedSectorIds) {
    const sector = state.polarEndgame.sectors[sectorId];
    if (sector.status === 'contested'
      && !state.polarEndgame.expeditions.some((expedition) => expedition.sectorId === sectorId)) {
      sector.status = 'available';
    }
  }
  state.polarEndgame.earthDefenseMembers = state.polarEndgame.earthDefenseMembers
    .filter((memberId) => memberId !== playerId);
  state.polarEndgame.warningAcknowledgedBy = state.polarEndgame.warningAcknowledgedBy
    .filter((memberId) => memberId !== playerId);
  if (changed) state.polarEndgame.visualRevision += 1;
  return survivingManpower;
}

function arcticProgressV2(state: WorldStateV2, playerId: PlayerId): ArcticResearchProgressV2 {
  return state.polarEndgame.arcticPrograms[playerId] ?? {
    playerId,
    activeProject: null,
    completedProjects: [],
  };
}

export function selectArcticProjectTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  projectId: ArcticProjectIdV2,
): ArcticProjectTermsV2 {
  const project = projectById.get(projectId) ?? ARCTIC_PROJECTS_V2[0]!;
  const player = state.players[playerId];
  const progress = arcticProgressV2(state, playerId);
  const projectIndex = ARCTIC_PROJECT_IDS_V2.indexOf(project.id);
  const previousComplete = ARCTIC_PROJECT_IDS_V2
    .slice(0, projectIndex)
    .every((id) => progress.completedProjects.includes(id));
  const complete = progress.completedProjects.includes(project.id);
  const active = progress.activeProject?.projectId === project.id;
  // Every flagship buys the exact same staged investigation. Country,
  // opening rank and ownership never alter price or access.
  const quotedCost = round(project.baseCost, 3);
  const cost = active && progress.activeProject ? progress.activeProject.costPaid : quotedCost;
  const researchLevel = player?.research.effectLevels['research-speed'] ?? 0;
  // Stage I is a fixed three-month story gate for every country and reconnect.
  const researchSpeedDurationReduction = project.id === 'polar-demography'
    ? 0
    : 0.80 * researchSpeedBonusV2(researchLevel);
  const quotedDurationTicks = Math.max(1, Math.ceil(
    project.durationTicks * (1 - researchSpeedDurationReduction),
  ));
  const activeCompletesTick = active && progress.activeProject
    ? project.id === 'polar-demography'
      ? Math.min(
        progress.activeProject.completesTick,
        progress.activeProject.startedTick + project.durationTicks,
      )
      : progress.activeProject.completesTick
    : undefined;
  const durationTicks = active && progress.activeProject && activeCompletesTick !== undefined
    ? activeCompletesTick - progress.activeProject.startedTick
    : quotedDurationTicks;
  const progressShare = active && progress.activeProject
    ? clamp((state.tick - progress.activeProject.startedTick)
      / Math.max(1, durationTicks), 0, 1)
    : complete ? 1 : 0;
  let status: ArcticProjectTermsV2['status'] = 'locked';
  if (complete) status = 'complete';
  else if (active) status = 'active';
  else if (!progress.activeProject && previousComplete) status = 'available';
  let reason: string | undefined;
  if (!player || !isHumanPlayerV2(state, playerId)) reason = 'Only an active human country can lead the investigation.';
  else if (content.metadata?.scenarioId === 'survival') reason = 'Survival begins after Rogue contact; the investigation is already bypassed.';
  else if (projectIndex > 0 && !apexInvestigationAuthorizedV2(state, playerId)) {
    reason = 'Begin mandatory Signal Triangulation first.';
  }
  else if (state.polarEndgame.phase === 'victory') reason = 'The polar campaign is already complete.';
  else if (complete) reason = 'Project complete.';
  else if (progress.activeProject && !active) reason = `${projectById.get(progress.activeProject.projectId)?.name ?? 'Another project'} is already active.`;
  else if (!previousComplete) reason = 'Complete the earlier signal stage first.';
  else if (player.treasury + 0.000001 < cost) {
    reason = `Treasury requires ${arcticProjectCostLabelV2(cost)}.`;
  }
  return {
    project,
    allowed: status === 'available' && !reason,
    ...(reason ? { reason } : {}),
    status,
    baseCost: project.baseCost,
    quotedCost,
    cost,
    baseDurationTicks: project.durationTicks,
    researchSpeedDurationReduction,
    quotedDurationTicks,
    durationTicks,
    ...(progress.activeProject && active ? {
      startedTick: progress.activeProject.startedTick,
      completesTick: activeCompletesTick!,
    } : {}),
    progress: progressShare,
  };
}

export function startArcticProjectV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  projectId: ArcticProjectIdV2,
): CommandResultV2 {
  if (!projectById.has(projectId)) return { accepted: false, reason: 'Unknown Rogue Signal stage.' };
  const terms = selectArcticProjectTermsV2(state, content, playerId, projectId);
  if (!terms.allowed) return { accepted: false, reason: terms.reason ?? 'Rogue Signal stage is unavailable.' };
  const nation = state.players[playerId]!;
  nation.treasury = round(nation.treasury - terms.cost);
  const progress = arcticProgressV2(state, playerId);
  progress.activeProject = {
    projectId,
    playerId,
    startedTick: state.tick,
    completesTick: state.tick + terms.durationTicks,
    costPaid: terms.cost,
  };
  state.polarEndgame.arcticPrograms[playerId] = progress;
  if (projectId === 'polar-demography') authorizeMandatoryApexAnalysisV2(state, playerId);
  if (state.polarEndgame.phase === 'dormant') state.polarEndgame.phase = 'arctic-research';
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'action',
    `NORTH POLE: ${terms.project.name} began. Completion is expected in ${terms.durationTicks} days.`,
    undefined,
    playerId,
    { polarRegion: 'arctic' },
  );
  return { accepted: true };
}

function revealAntarcticaV2(state: WorldStateV2, playerId: PlayerId): void {
  const firstOriginLock = ANTARCTIC_SECTORS_V2
    .filter((candidate) => candidate.region === 'gateway')
    .every((sector) => state.polarEndgame.sectors[sector.id].status === 'hidden');
  if (!['contact', 'counteroffensive', 'core-exposed', 'victory']
    .includes(state.polarEndgame.phase)) state.polarEndgame.phase = 'warning';
  state.polarEndgame.revealedBy ??= playerId;
  state.polarEndgame.warningTick ??= state.tick;
  prepareAntarcticGatewayBreachesV2(state);
  for (const sector of ANTARCTIC_SECTORS_V2.filter((candidate) => candidate.region === 'gateway')) {
    const sectorState = state.polarEndgame.sectors[sector.id];
    sectorState.status = 'available';
    sectorState.discoveredTick = state.tick;
  }
  state.polarEndgame.visualRevision += 1;
  if (!firstOriginLock) return;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    'EONSCAR ORIGIN LOCK: the Rogue signal comes from Antarctica. Three gateways are identified, but all physical routes remain sealed.',
    undefined,
    playerId,
    { polarRegion: 'antarctica' },
  );
}

export function processArcticResearchV2(
  state: WorldStateV2,
  content: WorldContentV2,
): PolarTickChangeV2[] {
  const changes: PolarTickChangeV2[] = [];
  for (const playerId of (Object.keys(state.polarEndgame.arcticPrograms) as PlayerId[])
    .sort((left, right) => left.localeCompare(right))) {
    const progress = state.polarEndgame.arcticPrograms[playerId];
    const run = progress?.activeProject;
    if (!progress || !run || !state.players[playerId]) continue;
    const project = projectById.get(run.projectId);
    if (!project) continue;
    // Authenticated legacy Stage-I saves keep their original start and payment,
    // but inherit the shorter schedule exactly once instead of restarting.
    if (project.id === 'polar-demography') {
      run.completesTick = Math.min(run.completesTick, run.startedTick + project.durationTicks);
    }
    if (run.completesTick > state.tick) continue;
    progress.activeProject = null;
    if (!progress.completedProjects.includes(project.id)) {
      progress.completedProjects.push(project.id);
      progress.completedProjects.sort((left, right) => (
        ARCTIC_PROJECT_IDS_V2.indexOf(left) - ARCTIC_PROJECT_IDS_V2.indexOf(right)
      ));
      for (const reward of project.rewards) {
        state.players[playerId]!.research.effectLevels[reward.effect] += reward.levels;
      }
    }
    state.polarEndgame.visualRevision += 1;
    if (project.id === 'polar-demography'
      && content.metadata?.scenarioId === 'standard-2026'
      && state.polarEndgame.communicationsBlackoutTick === null) {
      state.polarEndgame.communicationsBlackoutTick = state.tick;
      // Seed ordinary AI pacing from the blackout rather than releasing every
      // country's accumulated pre-prologue readiness on this exact week.
      state.aiEscalation.lastWarStartTick = state.tick;
    }
    changes.push({ kind: 'project-complete', playerId, projectId: project.id });
    addWorldEventV2(
      state,
      'polar',
      'action',
      `${project.name} completed. ${[
        ...project.rewards.map((reward) => reward.label),
        ...project.benefits,
      ].join(', ')}.`,
      undefined,
      playerId,
      { polarRegion: 'arctic' },
    );
    if (project.revealsAntarctica) revealAntarcticaV2(state, playerId);
  }
  return changes;
}

export function selectLiberatedWorldShareV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  const antarcticIds = new Set(ANTARCTIC_TERRITORY_IDS_V2);
  const worldIds = content.territoryIds.filter((territoryId) => !antarcticIds.has(territoryId));
  if (worldIds.length === 0) return 0;
  const humanOwners = new Set(state.humanPlayerIds);
  const liberated = worldIds.filter((territoryId) => {
    const owner = state.territories[territoryId]?.owner;
    return owner !== undefined && humanOwners.has(owner);
  }).length;
  return round(liberated / worldIds.length, 9);
}

/**
 * Campaign awakening is caused by visible human expansion, never by pressing
 * the final research button. The once-only buildup gives three deterministic
 * warning stages before the first physical gateway even starts; Stage I adds
 * its promised advance-warning time to that complete countdown.
 */
export function processRogueAttentionV2(
  state: WorldStateV2,
  content: WorldContentV2,
): boolean {
  const attention = state.polarEndgame.rogueAttention;
  if (content.metadata?.scenarioId === 'random-world') {
    attention.stage = 'disabled';
    attention.liberatedWorldShare = 0;
    attention.benchmarkMetTick = null;
    attention.nextStageTick = null;
    attention.activatedTick = null;
    return false;
  }
  if (content.metadata?.scenarioId === 'survival' || attention.stage === 'active') return false;
  attention.liberatedWorldShare = selectLiberatedWorldShareV2(state, content);
  if (attention.stage === 'disabled') attention.stage = 'dormant';
  if (attention.stage === 'dormant') {
    if (state.tick < ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2
      || attention.liberatedWorldShare + 1e-9
        < ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2) return false;
    attention.stage = 'observing';
    attention.benchmarkMetTick = state.tick;
    const routeWarningLead = Math.max(0, ...state.humanPlayerIds.map((playerId) => (
      selectNorthPoleModifiersV2(state, playerId).rogueWarningLeadTicks
    )));
    attention.nextStageTick = state.tick + ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2
      + routeWarningLead;
    const estimatedBuildup = ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2 * 3
      + routeWarningLead;
    prepareAntarcticGatewayBreachesV2(state);
    state.polarEndgame.visualRevision += 1;
    addWorldEventV2(
      state,
      'polar',
      'critical',
      `ROGUE ATTENTION · OBSERVING: EONSCAR detects a response to ${Math.round(attention.liberatedWorldShare * 100)}% world liberation. Estimated buildup: ${estimatedBuildup} days.`,
      undefined,
      state.humanPlayerId,
      { polarRegion: 'antarctica' },
    );
    return false;
  }
  if (attention.nextStageTick === null || attention.nextStageTick > state.tick) return false;
  if (attention.stage === 'observing') {
    attention.stage = 'mobilising';
    attention.nextStageTick = state.tick + ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2;
  } else if (attention.stage === 'mobilising') {
    attention.stage = 'breach-imminent';
    attention.nextStageTick = state.tick + ROGUE_ATTENTION_STAGE_DURATION_TICKS_V2;
  } else if (attention.stage === 'breach-imminent') {
    return activateRogueAiSurvivalV2(state, content, state.humanPlayerId, false);
  }
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    `ROGUE ATTENTION · ${attention.stage.toUpperCase()}: ${attention.nextStageTick - state.tick} days to the next escalation.`,
    undefined,
    state.humanPlayerId,
    { polarRegion: 'antarctica' },
  );
  return false;
}

export function acknowledgePolarWarningV2(
  state: WorldStateV2,
  playerId: PlayerId,
): CommandResultV2 {
  if (!isHumanPlayerV2(state, playerId)) return { accepted: false, reason: 'Only a human player can acknowledge this warning.' };
  if (state.polarEndgame.warningTick === null) return { accepted: false, reason: 'No Antarctic warning is active.' };
  if (!state.polarEndgame.warningAcknowledgedBy.includes(playerId)) {
    state.polarEndgame.warningAcknowledgedBy.push(playerId);
    state.polarEndgame.warningAcknowledgedBy.sort((left, right) => left.localeCompare(right));
  }
  return { accepted: true };
}

function prerequisitesSecuredV2(state: WorldStateV2, definition: AntarcticSectorDefinitionV2): boolean {
  return definition.prerequisites.every((sectorId) => state.polarEndgame.sectors[sectorId].status === 'secured');
}

export function selectAntarcticExpeditionTermsV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
  sectorId: AntarcticSectorIdV2,
): AntarcticExpeditionTermsV2 {
  const sector = sectorById.get(sectorId) ?? ANTARCTIC_SECTORS_V2[0]!;
  return {
    sector,
    allowed: false,
    reason: 'Expeditions were retired. Capture Antarctic territories through normal wars and logistics.',
    minManpower: 0,
    maxManpower: 0,
    recommendedManpower: 0,
    enemyStrength: sector.enemyStrength,
    projectedDurationTicks: 0,
  };
}

export function deployAntarcticExpeditionV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sectorId: AntarcticSectorIdV2,
  manpowerInput: number,
): CommandResultV2 {
  void state;
  void content;
  void playerId;
  void sectorId;
  void manpowerInput;
  return {
    accepted: false,
    reason: 'Expeditions were retired. Antarctica now uses normal territories, armies, logistics and wars.',
  };
}

function polarHashV2(seed: number, expeditionId: number, sectorId: AntarcticSectorIdV2, wave: number, pulse: number): number {
  let hash = (seed ^ Math.imul(expeditionId + 1, 0x9e3779b1) ^ Math.imul(wave + 7, 0x85ebca6b) ^ Math.imul(pulse + 11, 0xc2b2ae35)) >>> 0;
  for (let index = 0; index < sectorId.length; index += 1) {
    hash = Math.imul(hash ^ sectorId.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4_294_967_296;
}

function returnExpeditionV2(state: WorldStateV2, expedition: AntarcticExpeditionStateV2): void {
  const nation = state.players[expedition.playerId];
  if (!nation) return;
  // Legacy expedition personnel no longer reconstitute a removed reserve pool.
  nation.trainedReserves = 0;
}

function revealUnlockedSectorsV2(state: WorldStateV2): void {
  for (const definition of ANTARCTIC_SECTORS_V2) {
    const sector = state.polarEndgame.sectors[definition.id];
    if (sector.status !== 'hidden' || !prerequisitesSecuredV2(state, definition)) continue;
    sector.status = 'available';
    sector.discoveredTick = state.tick;
    state.polarEndgame.visualRevision += 1;
  }
  if (state.polarEndgame.sectors['sentinel-labyrinth'].status === 'secured'
    && state.polarEndgame.sectors['transantarctic-vault'].status === 'secured'
    && state.polarEndgame.phase !== 'victory') {
    state.polarEndgame.phase = 'core-exposed';
  }
}

function finishSectorV2(
  state: WorldStateV2,
  sectorId: AntarcticSectorIdV2,
  securedBy: PlayerId | null,
  changes: PolarTickChangeV2[],
): boolean {
  const sector = state.polarEndgame.sectors[sectorId];
  if (sectorId === CORE_ID && state.polarEndgame.bossPhase < 2) {
    state.polarEndgame.bossPhase = (state.polarEndgame.bossPhase + 1) as 1 | 2;
    sector.integrity = 100;
    state.polarEndgame.bossIntegrity = 100;
    sector.wave += 1;
    state.polarEndgame.globalWave += 1;
    state.polarEndgame.visualRevision += 1;
    return false;
  }
  if (sectorId === CORE_ID) {
    state.polarEndgame.bossPhase = 3;
    state.polarEndgame.bossIntegrity = 0;
    state.polarEndgame.phase = 'victory';
    state.polarEndgame.victoryTick = state.tick;
    state.polarEndgame.victoryCommanderId = securedBy;
  }
  sector.status = 'secured';
  sector.integrity = 0;
  sector.securedTick = state.tick;
  sector.securedBy = securedBy;
  state.polarEndgame.globalWave += 1;
  const survivors = state.polarEndgame.expeditions.filter((expedition) => expedition.sectorId === sectorId);
  for (const expedition of survivors) returnExpeditionV2(state, expedition);
  state.polarEndgame.expeditions = state.polarEndgame.expeditions
    .filter((expedition) => expedition.sectorId !== sectorId);
  state.polarEndgame.visualRevision += 1;
  changes.push({ kind: sectorId === CORE_ID ? 'victory' : 'sector-secured', playerId: securedBy ?? undefined, sectorId });
  revealUnlockedSectorsV2(state);
  const definition = sectorById.get(sectorId)!;
  addWorldEventV2(
    state,
    'polar',
    sectorId === CORE_ID ? 'critical' : 'action',
    sectorId === CORE_ID
      ? 'ZERO POINT SILENCED: the rogue intelligence and its extinction engine are destroyed.'
      : `${definition.name} has been secured. Earth forces are advancing deeper into Antarctica.`,
    undefined,
    securedBy ?? undefined,
    { polarRegion: 'antarctica', polarSectorId: sectorId },
  );
  return true;
}

function livingNationIdsV2(state: WorldStateV2): PlayerId[] {
  const owners = new Set(Object.values(state.territories).map((territory) => territory.owner));
  return (Object.keys(state.players) as PlayerId[])
    .filter((id) => owners.has(id))
    .sort((left, right) => left.localeCompare(right));
}

/** Technical winner projection for the shared campaign; commander credit is preserved separately. */
export function selectPolarVictoryWinnerV2(state: WorldStateV2): PlayerId | undefined {
  const polar = state.polarEndgame;
  const candidates = [
    polar.victoryCommanderId,
    ...state.humanPlayerIds,
    ...polar.earthDefenseMembers,
    polar.revealedBy,
    ...(Object.keys(state.players) as PlayerId[]).sort((left, right) => left.localeCompare(right)),
  ];
  return candidates.find((id): id is PlayerId => Boolean(id && state.players[id]));
}

function expandEarthDefenseV2(state: WorldStateV2, powerSnapshot: PowerSnapshotV2): void {
  const members = new Set(state.polarEndgame.earthDefenseMembers);
  const joinCount = state.aiEscalation.globalThreat >= 70 ? 1 : state.aiEscalation.globalThreat >= 35 ? 2 : 3;
  const candidates = livingNationIdsV2(state)
    .filter((id) => !members.has(id))
    .sort((left, right) => (powerSnapshot.byNation.get(right) ?? 0) - (powerSnapshot.byNation.get(left) ?? 0)
      || left.localeCompare(right));
  for (const playerId of candidates.slice(0, joinCount)) members.add(playerId);
  state.polarEndgame.earthDefenseMembers = [...members]
    .filter((id) => Boolean(state.players[id]))
    .sort((left, right) => left.localeCompare(right));
}

function shareEarthResearchV2(state: WorldStateV2): void {
  const members = state.polarEndgame.earthDefenseMembers.filter((id) => Boolean(state.players[id]));
  if (members.length < 2) return;
  const effects: ResearchEffectV2[] = [
    'attack', 'defense', 'casualty-reduction', 'recovery', 'supply', 'research-speed',
    'force-capacity', 'training', 'reinforcement-efficiency',
  ];
  for (const playerId of members) {
    const nation = state.players[playerId]!;
    const gaps = effects.map((effect) => ({
      effect,
      gap: Math.max(...members.map((memberId) => state.players[memberId]!.research.effectLevels[effect]))
        - nation.research.effectLevels[effect],
    })).sort((left, right) => right.gap - left.gap || left.effect.localeCompare(right.effect));
    if (gaps[0] && gaps[0].gap >= 3) nation.research.effectLevels[gaps[0].effect] += 1;
  }
}

function processEarthCounteroffensiveV2(
  state: WorldStateV2,
  powerSnapshot: PowerSnapshotV2,
  changes: PolarTickChangeV2[],
): number {
  const due = state.polarEndgame.nextCounteroffensiveTick;
  if (due === null || due > state.tick || state.polarEndgame.phase === 'victory') return 0;
  expandEarthDefenseV2(state, powerSnapshot);
  if ((state.tick - (state.polarEndgame.contactTick ?? state.tick)) % 26 < EARTH_COUNTEROFFENSIVE_INTERVAL_TICKS) {
    shareEarthResearchV2(state);
  }
  const eligible = ANTARCTIC_SECTORS_V2.filter((definition) => {
    const sector = state.polarEndgame.sectors[definition.id];
    return sector.status === 'available' || sector.status === 'contested';
  }).sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  const target = eligible[0];
  let relief = 0;
  if (target) {
    const members = state.polarEndgame.earthDefenseMembers;
    const combinedPower = members.reduce((sum, id) => sum + (powerSnapshot.byNation.get(id) ?? 0), 0);
    const trustFactor = 0.58 + 0.42 * (1 - state.aiEscalation.globalThreat / 100);
    const damage = round(clamp(
      (2.2 + Math.sqrt(Math.max(0, combinedPower)) * 0.035 + members.length * 0.055) * trustFactor,
      1.5,
      14,
    ));
    const sector = state.polarEndgame.sectors[target.id];
    const living = livingNationIdsV2(state).length;
    const majorityUnited = members.length >= Math.max(3, Math.ceil(living * 0.5))
      && state.aiEscalation.globalThreat < 55;
    const floor = target.region === 'core' ? 60 : target.region === 'inner' && !majorityUnited ? 15 : 0;
    sector.integrity = round(Math.max(floor, sector.integrity - damage));
    if (target.id === CORE_ID) state.polarEndgame.bossIntegrity = sector.integrity;
    relief += damage * 0.02;
    if (sector.integrity <= 0 && target.id !== CORE_ID) finishSectorV2(state, target.id, null, changes);
    changes.push({ kind: 'counteroffensive', sectorId: target.id });
    state.polarEndgame.visualRevision += 1;
    addWorldEventV2(
      state,
      'polar',
      'info',
      `Earth counteroffensive struck ${target.name}; ${members.length} nations are now coordinating forces and research.`,
      undefined,
      undefined,
      { polarRegion: 'antarctica', polarSectorId: target.id },
    );
  }
  state.polarEndgame.phase = state.polarEndgame.phase === 'core-exposed' ? 'core-exposed' : 'counteroffensive';
  state.polarEndgame.nextCounteroffensiveTick = state.tick + EARTH_COUNTEROFFENSIVE_INTERVAL_TICKS;
  return relief;
}

export function processPolarEndgameV2(
  state: WorldStateV2,
  content: WorldContentV2,
  _powerSnapshot: PowerSnapshotV2,
): PolarTickResultV2 {
  const changes: PolarTickChangeV2[] = [];
  const attentionActivated = processRogueAttentionV2(state, content);
  const survival = processRogueAiSurvivalV2(state, content);
  processApexNarrativeV2(state, content);
  processCampaignFirstStrikeGuidanceV2(state, content);
  if (attentionActivated) changes.push({
    kind: 'contact',
    playerId: state.humanPlayerId,
  });
  if (survival.waveStarted !== null) changes.push({ kind: 'counteroffensive' });
  if (survival.victory) changes.push({
    kind: 'victory',
    playerId: state.polarEndgame.victoryCommanderId ?? undefined,
    sectorId: 'zero-point-core',
  });
  return { changes, suspicionRelief: 0 };
}

export function applyPolarSuspicionReliefV2(state: WorldStateV2, requestedRelief: number): number {
  if (!Number.isFinite(requestedRelief) || requestedRelief <= 0) return 0;
  const applied = round(Math.min(state.aiEscalation.globalThreat, requestedRelief));
  state.aiEscalation.globalThreat = round(Math.max(0, state.aiEscalation.globalThreat - applied));
  state.polarEndgame.suspicionReliefEarned = round(state.polarEndgame.suspicionReliefEarned + applied);
  return applied;
}

export function polarEarthUnityActiveV2(state: Pick<WorldStateV2, 'polarEndgame'>): boolean {
  void state;
  return false;
}
