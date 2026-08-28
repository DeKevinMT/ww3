import { clamp, round } from './balance';
import type { WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import {
  countryTraitModifiersV2,
  openingMilitaryOrderForContentV2,
  openingMilitaryRankForContentV2,
} from './traits';
import {
  selectTrainedReserveCapacityV2,
  type PowerSnapshotV2,
} from './selectors';
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
  revealsAntarctica: boolean;
}

export interface ArcticProjectTermsV2 {
  project: ArcticProjectDefinitionV2;
  allowed: boolean;
  reason?: string;
  status: 'locked' | 'available' | 'active' | 'complete';
  baseCost: number;
  economyCostScale: number;
  openingMilitaryRank: number;
  openingMilitaryRankCount: number;
  openingMilitaryRankCostFactor: number;
  affinityCostModifier: number;
  affinityCostMultiplier: number;
  quotedCost: number;
  cost: number;
  baseDurationTicks: number;
  accessPointCount: number;
  accessDurationReduction: number;
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
    name: 'Polar Habitat Genome',
    kicker: 'Phase I · Human endurance',
    description: 'Closed-loop settlements turn extreme cold into new demographic and medical capacity.',
    durationTicks: 104,
    baseCost: 40,
    rewards: [
      { effect: 'population-growth', levels: 1, label: '+1 population growth level' },
      { effect: 'recovery', levels: 1, label: '+1 recovery level' },
      { effect: 'food-storage', levels: 1, label: '+1 food storage level' },
    ],
    revealsAntarctica: false,
  },
  {
    id: 'cryogenic-logistics',
    name: 'Cryogenic Logistics Grid',
    kicker: 'Phase II · Deep supply',
    description: 'Autonomous depots and polar medicine make long, isolated campaigns survivable.',
    durationTicks: 156,
    baseCost: 90,
    rewards: [
      { effect: 'supply', levels: 2, label: '+2 supply levels' },
      { effect: 'casualty-reduction', levels: 1, label: '+1 casualty reduction level' },
      { effect: 'research-efficiency', levels: 1, label: '+1 research efficiency level' },
    ],
    revealsAntarctica: false,
  },
  {
    id: 'strategic-mobilisation',
    name: 'Strategic Mobilisation Vaults',
    kicker: 'Phase III · Continental readiness',
    description: 'Sub-ice arsenals and hardened training hubs expand the force and reserve ceiling.',
    durationTicks: 260,
    baseCost: 180,
    rewards: [
      { effect: 'force-capacity', levels: 2, label: '+2 army-cap levels' },
      { effect: 'reserve-training', levels: 2, label: '+2 reserve training levels' },
      { effect: 'reserve-mobilization', levels: 2, label: '+2 reserve mobilisation levels' },
    ],
    revealsAntarctica: false,
  },
  {
    id: 'deep-ice-signals',
    name: 'Deep-Ice Signal Array',
    kicker: 'Phase IV · The impossible signal',
    description: 'A planet-scale listening array maps an artificial transmission beneath Antarctic ice.',
    durationTicks: 416,
    baseCost: 360,
    rewards: [
      { effect: 'attack', levels: 1, label: '+1 attack level' },
      { effect: 'defense', levels: 1, label: '+1 defense level' },
      { effect: 'research-speed', levels: 1, label: '+1 research speed level' },
    ],
    revealsAntarctica: true,
  },
] as const;

export const ARCTIC_PROJECT_IDS_V2 = ARCTIC_PROJECTS_V2.map((project) => project.id);

const ARCTIC_RESEARCH_AFFINITY_PLAYER_IDS_V2 = [
  'grl', 'isl', 'nor', 'can', 'fin', 'swe', 'rus', 'usa',
] as const;

/** Derived from canonical raw nation traits; human amplification never applies. */
export const ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2 = Object.freeze(
  Object.fromEntries(ARCTIC_RESEARCH_AFFINITY_PLAYER_IDS_V2.map((playerId) => [
    playerId,
    (countryTraitModifiersV2(playerId, 'arctic-research-cost')[0]?.percentage ?? 0) / 100,
  ])),
) as Readonly<Record<(typeof ARCTIC_RESEARCH_AFFINITY_PLAYER_IDS_V2)[number], number>>;

export const ARCTIC_RESEARCH_RANK_COST_FACTOR_STRONGEST_V2 = 5;
export const ARCTIC_RESEARCH_RANK_COST_FACTOR_WEAKEST_V2 = 0.5;

export function arcticResearchAffinityCostModifierV2(
  playerId: PlayerId | string,
): number {
  return ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2[
    String(playerId) as keyof typeof ARCTIC_RESEARCH_AFFINITY_COST_MODIFIERS_V2
  ] ?? 0;
}

/** Smooth scenario-aware cost curve based solely on immutable opening rank. */
export function arcticResearchRankCostFactorV2(
  content: WorldContentV2,
  playerId: PlayerId | string,
): number {
  const order = openingMilitaryOrderForContentV2(content);
  const rank = openingMilitaryRankForContentV2(content, playerId);
  if (!rank) return 1;
  const rankShare = clamp((rank - 1) / Math.max(1, order.length - 1), 0, 1);
  const smoothRank = rankShare * rankShare * (3 - 2 * rankShare);
  return ARCTIC_RESEARCH_RANK_COST_FACTOR_STRONGEST_V2
    + (ARCTIC_RESEARCH_RANK_COST_FACTOR_WEAKEST_V2
      - ARCTIC_RESEARCH_RANK_COST_FACTOR_STRONGEST_V2) * smoothRank;
}

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

const ARCTIC_GATEWAY_TERRITORIES = new Set(['can', 'fin', 'grl', 'isl', 'nor', 'rus', 'swe', 'usa']);
const POLAR_BATTLE_INTERVAL_TICKS = 4;
const EARTH_COUNTEROFFENSIVE_INTERVAL_TICKS = 13;
const CORE_ID: AntarcticSectorIdV2 = 'zero-point-core';

const projectById = new Map(ARCTIC_PROJECTS_V2.map((project) => [project.id, project]));
const sectorById = new Map(ANTARCTIC_SECTORS_V2.map((sector) => [sector.id, sector]));

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
    expeditions: [],
    earthDefenseMembers: [],
    globalWave: 1,
    nextCounteroffensiveTick: null,
    bossPhase: 0,
    bossIntegrity: 100,
    suspicionReliefEarned: 0,
    visualRevision: 0,
    nextExpeditionId: 1,
  };
}

export function clonePolarEndgameV2(source: PolarEndgameStateV2): PolarEndgameStateV2 {
  return {
    ...source,
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
        completedProjects: [...progress.completedProjects],
      } : progress])) as PolarEndgameStateV2['arcticPrograms'],
    sectors: Object.fromEntries(ANTARCTIC_SECTOR_IDS_V2.map((sectorId) => [
      sectorId,
      { ...source.sectors[sectorId] },
    ])) as PolarEndgameStateV2['sectors'],
    expeditions: source.expeditions
      .map((expedition) => ({ ...expedition }))
      .sort((left, right) => left.id - right.id),
    earthDefenseMembers: [...source.earthDefenseMembers]
      .sort((left, right) => left.localeCompare(right)),
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
    || state.polarEndgame.earthDefenseMembers.includes(playerId)
    || state.polarEndgame.warningAcknowledgedBy.includes(playerId);

  delete state.polarEndgame.arcticPrograms[playerId];
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

function arcticAccessPointCountV2(state: WorldStateV2, playerId: PlayerId): number {
  return Object.entries(state.territories).filter(([territoryId, territory]) => (
    territory.owner === playerId && ARCTIC_GATEWAY_TERRITORIES.has(territoryId)
  )).length;
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
  // Kept in the public quote breakdown for compatibility. Arctic pricing is
  // identity-based and deliberately ignores the player's current empire.
  const economyCostScale = 1;
  const openingOrder = openingMilitaryOrderForContentV2(content);
  const openingMilitaryRank = openingMilitaryRankForContentV2(content, playerId) ?? openingOrder.length;
  const openingMilitaryRankCostFactor = arcticResearchRankCostFactorV2(content, playerId);
  const affinityCostModifier = arcticResearchAffinityCostModifierV2(playerId);
  const affinityCostMultiplier = 1 + affinityCostModifier;
  const quotedCost = round(
    project.baseCost
      * economyCostScale
      * openingMilitaryRankCostFactor
      * affinityCostMultiplier,
    3,
  );
  const cost = active && progress.activeProject ? progress.activeProject.costPaid : quotedCost;
  const accessPointCount = arcticAccessPointCountV2(state, playerId);
  const accessDurationReduction = Math.min(0.35, Math.max(0, accessPointCount - 1) * 0.05);
  const researchLevel = player?.research.effectLevels['research-speed'] ?? 0;
  const researchSpeedDurationReduction = Math.min(0.18, researchLevel * 0.006);
  const quotedDurationTicks = Math.max(52, Math.ceil(
    project.durationTicks
      * (1 - accessDurationReduction)
      * (1 - researchSpeedDurationReduction),
  ));
  const durationTicks = active && progress.activeProject
    ? progress.activeProject.completesTick - progress.activeProject.startedTick
    : quotedDurationTicks;
  const progressShare = active && progress.activeProject
    ? clamp((state.tick - progress.activeProject.startedTick)
      / Math.max(1, progress.activeProject.completesTick - progress.activeProject.startedTick), 0, 1)
    : complete ? 1 : 0;
  let status: ArcticProjectTermsV2['status'] = 'locked';
  if (complete) status = 'complete';
  else if (active) status = 'active';
  else if (!progress.activeProject && previousComplete) status = 'available';
  let reason: string | undefined;
  if (!player || !isHumanPlayerV2(state, playerId)) reason = 'Only an active human country can lead Arctic research.';
  else if (state.polarEndgame.phase === 'victory') reason = 'The polar campaign is already complete.';
  else if (accessPointCount === 0) reason = 'Control Canada, Finland, Greenland, Iceland, Norway, Russia, Sweden or the United States to establish Arctic access.';
  else if (complete) reason = 'Project complete.';
  else if (progress.activeProject && !active) reason = `${projectById.get(progress.activeProject.projectId)?.name ?? 'Another project'} is already active.`;
  else if (!previousComplete) reason = 'Complete the earlier Arctic phase first.';
  else if (player.treasury + 0.000001 < cost) reason = `Treasury requires $${cost.toFixed(1)}B.`;
  return {
    project,
    allowed: status === 'available' && !reason,
    ...(reason ? { reason } : {}),
    status,
    baseCost: project.baseCost,
    economyCostScale,
    openingMilitaryRank,
    openingMilitaryRankCount: openingOrder.length,
    openingMilitaryRankCostFactor,
    affinityCostModifier,
    affinityCostMultiplier,
    quotedCost,
    cost,
    baseDurationTicks: project.durationTicks,
    accessPointCount,
    accessDurationReduction,
    researchSpeedDurationReduction,
    quotedDurationTicks,
    durationTicks,
    ...(progress.activeProject && active ? {
      startedTick: progress.activeProject.startedTick,
      completesTick: progress.activeProject.completesTick,
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
  if (!projectById.has(projectId)) return { accepted: false, reason: 'Unknown Arctic project.' };
  const terms = selectArcticProjectTermsV2(state, content, playerId, projectId);
  if (!terms.allowed) return { accepted: false, reason: terms.reason ?? 'Arctic project is unavailable.' };
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
  if (state.polarEndgame.phase === 'dormant') state.polarEndgame.phase = 'arctic-research';
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'action',
    `${terms.project.name} began in the Arctic. Completion is expected in ${terms.durationTicks} weeks.`,
    undefined,
    playerId,
    { polarRegion: 'arctic' },
  );
  return { accepted: true };
}

function revealAntarcticaV2(state: WorldStateV2, playerId: PlayerId): void {
  if (state.polarEndgame.warningTick !== null) return;
  state.polarEndgame.phase = 'warning';
  state.polarEndgame.revealedBy = playerId;
  state.polarEndgame.warningTick = state.tick;
  for (const sector of ANTARCTIC_SECTORS_V2.filter((candidate) => candidate.region === 'gateway')) {
    const sectorState = state.polarEndgame.sectors[sector.id];
    sectorState.status = 'available';
    sectorState.discoveredTick = state.tick;
  }
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    'DEEP-ICE ALERT: a coordinated artificial signal is active beneath Antarctica. Three approach corridors are now open.',
    undefined,
    playerId,
    { polarRegion: 'antarctica' },
  );
}

export function processArcticResearchV2(
  state: WorldStateV2,
  _content: WorldContentV2,
): PolarTickChangeV2[] {
  const changes: PolarTickChangeV2[] = [];
  for (const playerId of (Object.keys(state.polarEndgame.arcticPrograms) as PlayerId[])
    .sort((left, right) => left.localeCompare(right))) {
    const progress = state.polarEndgame.arcticPrograms[playerId];
    const run = progress?.activeProject;
    if (!progress || !run || run.completesTick > state.tick || !state.players[playerId]) continue;
    const project = projectById.get(run.projectId);
    if (!project) continue;
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
    changes.push({ kind: 'project-complete', playerId, projectId: project.id });
    addWorldEventV2(
      state,
      'polar',
      'action',
      `${project.name} completed. ${project.rewards.map((reward) => reward.label).join(', ')}.`,
      undefined,
      playerId,
      { polarRegion: 'arctic' },
    );
    if (project.revealsAntarctica && state.polarEndgame.warningTick === null) {
      revealAntarcticaV2(state, playerId);
      changes.push({ kind: 'warning', playerId, projectId: project.id });
    }
  }
  return changes;
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

function effectiveEnemyStrengthV2(state: WorldStateV2, definition: AntarcticSectorDefinitionV2): number {
  const sector = state.polarEndgame.sectors[definition.id];
  const waveFactor = 1 + Math.max(0, sector.wave - 1) * 0.12 + Math.max(0, state.polarEndgame.globalWave - 1) * 0.025;
  const bossFactor = definition.region === 'core' ? 1 + state.polarEndgame.bossPhase * 0.28 : 1;
  return round(definition.enemyStrength * waveFactor * bossFactor);
}

export function selectAntarcticExpeditionTermsV2(
  state: WorldStateV2,
  _content: WorldContentV2,
  playerId: PlayerId,
  sectorId: AntarcticSectorIdV2,
): AntarcticExpeditionTermsV2 {
  const sector = sectorById.get(sectorId) ?? ANTARCTIC_SECTORS_V2[0]!;
  const sectorState = state.polarEndgame.sectors[sector.id];
  const nation = state.players[playerId];
  const enemyStrength = effectiveEnemyStrengthV2(state, sector);
  const minManpower = round(Math.max(0.08, enemyStrength * 0.34), 3);
  const maxManpower = round(Math.max(0, nation?.trainedReserves ?? 0), 3);
  const recommendedManpower = round(Math.min(maxManpower, Math.max(minManpower, enemyStrength * 1.15)), 3);
  const activeExpedition = state.polarEndgame.expeditions.find((candidate) => candidate.playerId === playerId);
  const expectedDamage = clamp(8 + 18 * (Math.max(minManpower, recommendedManpower) / Math.max(0.01, enemyStrength)), 5, 30);
  let reason: string | undefined;
  if (!nation || !isHumanPlayerV2(state, playerId)) reason = 'Only an active human country can deploy an expedition.';
  else if (state.polarEndgame.warningTick === null || state.polarEndgame.phase === 'dormant' || state.polarEndgame.phase === 'arctic-research') reason = 'Antarctica has not been revealed.';
  else if (state.polarEndgame.phase === 'victory') reason = 'The rogue intelligence has already been destroyed.';
  else if (!prerequisitesSecuredV2(state, sector)) reason = 'Secure the prerequisite sectors first.';
  else if (sectorState.status === 'hidden') reason = 'This sector is still hidden.';
  else if (sectorState.status === 'secured') reason = 'This sector is secure.';
  else if (activeExpedition) reason = 'Your country already has an active Antarctic expedition.';
  else if (maxManpower + 0.000001 < minManpower) reason = `At least ${minManpower.toFixed(2)}M trained reserves are required.`;
  return {
    sector,
    allowed: !reason,
    ...(reason ? { reason } : {}),
    minManpower,
    maxManpower,
    recommendedManpower,
    enemyStrength,
    projectedDurationTicks: Math.max(POLAR_BATTLE_INTERVAL_TICKS, Math.ceil(
      sectorState.integrity / Math.max(1, expectedDamage),
    ) * POLAR_BATTLE_INTERVAL_TICKS),
    ...(activeExpedition ? { activeExpedition } : {}),
  };
}

function activateEarthDefenseV2(state: WorldStateV2, playerId: PlayerId): void {
  if (state.polarEndgame.contactTick !== null) return;
  state.polarEndgame.phase = 'contact';
  state.polarEndgame.contactTick = state.tick;
  state.polarEndgame.nextCounteroffensiveTick = state.tick + EARTH_COUNTEROFFENSIVE_INTERVAL_TICKS;
  state.polarEndgame.earthDefenseMembers = [...new Set([
    ...selectHumanPlayerIdsV2(state),
    ...state.aiEscalation.coalitionMembers,
  ].filter((id) => Boolean(state.players[id])))]
    .sort((left, right) => left.localeCompare(right));
  // Contact ends terrestrial campaigns immediately. New terrestrial wars are
  // blocked while the shared existential campaign is active.
  state.wars = [];
  state.offers = [];
  state.allianceOffers = [];
  state.aiEscalation.coalitionMembers = [];
  state.aiEscalation.resistanceLevel = 0;
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    'FIRST CONTACT: hidden machine armies have emerged from the Antarctic interior. Earth defense protocols are active.',
    undefined,
    playerId,
    { polarRegion: 'antarctica' },
  );
}

export function deployAntarcticExpeditionV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sectorId: AntarcticSectorIdV2,
  manpowerInput: number,
): CommandResultV2 {
  if (!sectorById.has(sectorId)) return { accepted: false, reason: 'Unknown Antarctic sector.' };
  if (!Number.isFinite(manpowerInput)) return { accepted: false, reason: 'Expedition manpower must be finite.' };
  const terms = selectAntarcticExpeditionTermsV2(state, content, playerId, sectorId);
  if (!terms.allowed) return { accepted: false, reason: terms.reason ?? 'Expedition is unavailable.' };
  const manpower = round(manpowerInput, 6);
  if (manpower < terms.minManpower - 0.000001 || manpower > terms.maxManpower + 0.000001) {
    return { accepted: false, reason: `Deploy from ${terms.minManpower.toFixed(2)}M through ${terms.maxManpower.toFixed(2)}M trained reserves.` };
  }
  state.players[playerId]!.trainedReserves = round(state.players[playerId]!.trainedReserves - manpower);
  state.polarEndgame.expeditions.push({
    id: state.polarEndgame.nextExpeditionId++,
    playerId,
    sectorId,
    manpower,
    initialManpower: manpower,
    startedTick: state.tick,
    lastPulseTick: state.tick,
    damageDealt: 0,
  });
  state.polarEndgame.expeditions.sort((left, right) => left.id - right.id);
  const sector = state.polarEndgame.sectors[sectorId];
  sector.status = 'contested';
  if (sector.discoveredTick === null) sector.discoveredTick = state.tick;
  activateEarthDefenseV2(state, playerId);
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'action',
    `${(manpower * 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })} trained reserves deployed to ${terms.sector.name}.`,
    undefined,
    playerId,
    { polarRegion: 'antarctica', polarSectorId: sectorId },
  );
  return { accepted: true };
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
  const capacity = selectTrainedReserveCapacityV2(state, expedition.playerId);
  nation.trainedReserves = round(Math.min(
    Math.max(capacity, nation.trainedReserves),
    nation.trainedReserves + expedition.manpower,
  ));
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
    'force-capacity', 'reserve-training', 'reserve-mobilization', 'food-production',
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
  _content: WorldContentV2,
  powerSnapshot: PowerSnapshotV2,
): PolarTickResultV2 {
  const changes: PolarTickChangeV2[] = [];
  let suspicionRelief = 0;
  for (const expedition of [...state.polarEndgame.expeditions].sort((left, right) => left.id - right.id)) {
    if (state.tick - expedition.lastPulseTick < POLAR_BATTLE_INTERVAL_TICKS) continue;
    const definition = sectorById.get(expedition.sectorId);
    const sector = state.polarEndgame.sectors[expedition.sectorId];
    const nation = state.players[expedition.playerId];
    if (!definition || !nation || sector.status === 'secured') continue;
    const pulse = Math.floor((state.tick - expedition.startedTick) / POLAR_BATTLE_INTERVAL_TICKS);
    const roll = 0.84 + polarHashV2(state.seed, expedition.id, expedition.sectorId, sector.wave, pulse) * 0.32;
    const attackResearch = 1 + nation.research.effectLevels.attack * 0.018
      + nation.research.effectLevels.supply * 0.012;
    const coalitionSupport = 1 + Math.min(0.36, state.polarEndgame.earthDefenseMembers.length * 0.006)
      * (1 - state.aiEscalation.globalThreat / 180);
    const attackPower = Math.max(0.001, expedition.manpower * attackResearch * coalitionSupport);
    const enemyStrength = effectiveEnemyStrengthV2(state, definition);
    const damage = round(clamp(7 + 17 * (attackPower / Math.max(0.01, enemyStrength)) * roll, 4, 31));
    const casualtyRate = clamp(
      0.035 + 0.075 * (enemyStrength / attackPower) * (1.08 - (roll - 0.84)),
      0.025,
      0.28,
    ) * (1 - Math.min(0.30, nation.research.effectLevels['casualty-reduction'] * 0.012));
    const casualties = round(Math.min(expedition.manpower, expedition.manpower * casualtyRate));
    expedition.manpower = round(Math.max(0, expedition.manpower - casualties));
    expedition.damageDealt = round(expedition.damageDealt + damage);
    expedition.lastPulseTick = state.tick;
    sector.integrity = round(Math.max(0, sector.integrity - damage));
    if (expedition.sectorId === CORE_ID) state.polarEndgame.bossIntegrity = sector.integrity;
    suspicionRelief += damage * (0.045 + definition.depth * 0.008);
    changes.push({ kind: 'battle', playerId: expedition.playerId, sectorId: expedition.sectorId });
    state.polarEndgame.visualRevision += 1;
    if (sector.integrity <= 0) {
      const finished = finishSectorV2(state, expedition.sectorId, expedition.playerId, changes);
      suspicionRelief += finished ? 1.5 + definition.depth * 0.75 : 1;
      continue;
    }
    if (expedition.manpower < 0.005) {
      state.polarEndgame.expeditions = state.polarEndgame.expeditions
        .filter((candidate) => candidate.id !== expedition.id);
      if (!state.polarEndgame.expeditions.some((candidate) => candidate.sectorId === expedition.sectorId)) {
        sector.status = 'available';
      }
      sector.wave += 1;
      state.polarEndgame.globalWave += 1;
      addWorldEventV2(
        state,
        'polar',
        'action',
        `The expedition at ${definition.name} was overwhelmed. The machine army is adapting for wave ${sector.wave}.`,
        undefined,
        expedition.playerId,
        { polarRegion: 'antarctica', polarSectorId: expedition.sectorId },
      );
    }
  }
  suspicionRelief += processEarthCounteroffensiveV2(state, powerSnapshot, changes);
  return { changes, suspicionRelief: round(suspicionRelief) };
}

export function applyPolarSuspicionReliefV2(state: WorldStateV2, requestedRelief: number): number {
  if (!Number.isFinite(requestedRelief) || requestedRelief <= 0) return 0;
  const applied = round(Math.min(state.aiEscalation.globalThreat, requestedRelief));
  state.aiEscalation.globalThreat = round(Math.max(0, state.aiEscalation.globalThreat - applied));
  state.polarEndgame.suspicionReliefEarned = round(state.polarEndgame.suspicionReliefEarned + applied);
  return applied;
}

export function polarEarthUnityActiveV2(state: Pick<WorldStateV2, 'polarEndgame'>): boolean {
  return state.polarEndgame.phase === 'contact'
    || state.polarEndgame.phase === 'counteroffensive'
    || state.polarEndgame.phase === 'core-exposed'
    || state.polarEndgame.phase === 'victory';
}
