import {
  V2_TICK_DURATION_MS,
  RAPID_RECRUITMENT_COOLDOWN_TICKS,
  RESEARCH_SURGE_COOLDOWN_TICKS,
  clamp,
  round,
  copyResearchAllocationsV2,
  validResearchAllocationsV2,
} from './balance';
import { planAiCommandsV2 } from './ai';
import { addArmyManpowerWithQualityV2, localArmyBaseQualityV2 } from './armyQuality';
import { createWorldStateV2, processOpeningConflictsV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { createFinancePlansV2, processDevelopmentPhaseV2, processFinanceMilitaryV2 } from './economy';
import { pruneWorldHistoryV2 } from './events';
import { retireAbsorbedNationV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import { createSaveV2, loadSaveV2, serializeSaveV2, type SaveGameV2 } from './persistence';
import { processPropagandaProgramsV2, selectPropagandaTermsV2 } from './propaganda';
import { processResearchV2 } from './research';
import {
  createMilitaryBaseSnapshotV2,
  createPowerSnapshotV2,
  selectActiveWarBetweenV2,
  selectArmyCapacityTargetV2,
  selectArmyStrengthV2,
  selectControlledPopulationV2,
  selectConquestForecastV2,
  selectConventionalPowerV2,
  selectCurrentPowerV2,
  selectEconomicOutputLedgerV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectEffectivePowerV2,
  selectEffectiveRecoveryV2,
  selectGlobalRankingV2,
  selectNationViewV2,
  selectNationalAiPlanV2,
  selectNationalEconomyV2,
  selectNuclearPowerV2,
  selectOpeningCandidateFinancePlansV2,
  selectPopulationDynamicsV2,
  selectResearchPortfolioV2,
  selectResearchSurgeTermsV2,
  selectRapidRecruitmentTermsV2,
  selectStrategicScoreV2,
  selectTerritoriesOfV2,
  selectTerritoryPowerV2,
  selectTotalManpowerV2,
  selectWarAccessTypeV2,
  selectWarMobilizationCostV2,
  selectWarOperationV2,
  selectWeeklyFinanceBreakdownV2,
  selectWeeklyManpowerProjectionV2,
  selectWeeklyManpowerTrendV2,
  selectWeeklyRecruitmentV2,
  selectWeeklyPopulationTrendV2,
  type MilitaryBaseSnapshotV2,
  type PowerSnapshotV2,
} from './selectors';
import { selectGlobalResistanceV2, updateGlobalResistanceV2 } from './resistance';
import {
  canDeclareWarV2,
  ceasefireTermsV2,
  declareWarV2,
  estimateLiveWarV2,
  forecastWarV2,
  peaceProposalTermsV2,
  processWarsV2,
  proposePeaceSettlementV2,
  respondToOfferV2,
  requestCeasefireV2,
  warDeclarationStatusV2,
  type WarConclusionV2,
} from './war';
import type {
  BattleEventV2,
  BudgetDomainV2,
  BudgetPolicyV2,
  CeasefireTermsV2,
  CommandResultV2,
  ConquestForecastV2,
  ArmyStateV2,
  ArmyStrengthV2,
  EconomicOutputLedgerV2,
  NationViewV2,
  LogisticsMovementV2,
  NationalEconomyV2,
  NationalAiPlanV2,
  NuclearPowerViewV2,
  PopulationDynamicsV2,
  PropagandaTermsV2,
  RapidRecruitmentTermsV2,
  PeaceProposalTermsV2,
  PeaceSettlementV2,
  PlayerId,
  RankingEntryV2,
  GlobalResistanceV2,
  ResearchAllocationsV2,
  ResearchBranchV2,
  ResearchPortfolioV2,
  ResearchSurgeTermsV2,
  TerritoryId,
  TerritoryViewV2,
  TotalManpowerV2,
  WarAccessV2,
  WarDeclarationStatusV2,
  WarForecastV2,
  WarOutcomeV2,
  LiveWarEstimateV2,
  WarStateV2,
  WeeklyFinanceBreakdownV2,
  WeeklyManpowerProjectionV2,
  WorldChangeV2,
  WorldCommandV2,
  WorldSpeedV2,
  WorldStateV2,
} from './types';
import { nationIdV2, territoryIdV2 } from './types';

type WorldListenerV2 = (state: WorldStateV2, change: WorldChangeV2) => void;

export interface QueuedWorldActionV2 {
  sequence: number;
  command: WorldCommandV2;
}

export type ClientCommandSinkV2 = (command: WorldCommandV2) => CommandResultV2;
type QueuedWorldActionListenerV2 = (action: QueuedWorldActionV2) => void;

interface HumanWarBaselineV2 {
  humanId: PlayerId;
  opponentId: PlayerId;
  humanRole: 'attacker' | 'defender';
  ownedTerritories: Set<TerritoryId>;
  touchedTerritories: Set<TerritoryId>;
  treasuryBefore: number;
  treasurySeized: number;
  treasuryLost: number;
  effectiveAttackBefore: number;
  effectiveDefenseBefore: number;
  combatPowerBefore: number;
  capacityBefore: number;
}

interface HumanNationBaselineV2 {
  humanId: PlayerId;
  ownedTerritories: Set<TerritoryId>;
  treasuryBefore: number;
  effectiveAttackBefore: number;
  effectiveDefenseBefore: number;
  combatPowerBefore: number;
  capacityBefore: number;
}

const BUDGET_DOMAINS: readonly BudgetDomainV2[] = ['military', 'research', 'development'];
const PRODUCTION_FULL_INVARIANT_INTERVAL_TICKS = 8;

function validBudgetV2(budget: BudgetPolicyV2): boolean {
  return BUDGET_DOMAINS.every((domain) => Number.isInteger(budget[domain]) && budget[domain] >= 5 && budget[domain] <= 90)
    && budget.military + budget.research + budget.development === 100;
}

export class WorldEngineV2 {
  readonly content: WorldContentV2;
  readonly state: WorldStateV2;
  private readonly listeners = new Set<WorldListenerV2>();
  private readonly queuedActionListeners = new Set<QueuedWorldActionListenerV2>();
  private clock?: ReturnType<typeof setInterval>;
  private readonly pendingActions: QueuedWorldActionV2[] = [];
  private clientCommandSink?: ClientCommandSinkV2;
  private hasClockAuthority = true;
  private _viewerPlayerId: PlayerId;
  private applyingCommand = false;
  private sequenceAlreadyAssigned = false;
  private logisticsMovements: LogisticsMovementV2[] = [];
  private readonly humanWarBaselines = new Map<string, HumanWarBaselineV2>();

  constructor(seed = 1, content: WorldContentV2 = WORLD_CONTENT_V2, initialState?: WorldStateV2) {
    this.content = content;
    this.state = initialState ?? createWorldStateV2(seed, content);
    this.state.humanPlayerIds = [...selectHumanPlayerIdsV2(this.state)];
    this._viewerPlayerId = this.state.humanPlayerId;
    this.trackHumanWars();
  }

  static fromSave(input: string | SaveGameV2, content: WorldContentV2 = WORLD_CONTENT_V2): WorldEngineV2 {
    return new WorldEngineV2(1, content, loadSaveV2(input, content));
  }

  save(): string {
    if (this.pendingActions.length > 0) throw new Error('V2 saves are only allowed after queued actions have reached a tick boundary.');
    return serializeSaveV2(this.state, this.content);
  }

  canonicalHash(): string {
    return createSaveV2(this.state, this.content).canonicalStateHash;
  }

  subscribe(listener: WorldListenerV2): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeQueuedActions(listener: QueuedWorldActionListenerV2): () => void {
    this.queuedActionListeners.add(listener);
    return () => this.queuedActionListeners.delete(listener);
  }

  setClientCommandSink(sink?: ClientCommandSinkV2): void {
    this.clientCommandSink = sink;
  }

  get clockAuthority(): boolean {
    return this.hasClockAuthority;
  }

  setClockAuthority(authoritative: boolean): void {
    if (this.hasClockAuthority === authoritative) return;
    this.hasClockAuthority = authoritative;
    if (authoritative) this.startClock();
    else this.stopClock();
  }

  get viewerPlayerId(): PlayerId {
    return this._viewerPlayerId;
  }

  setViewerPlayerId(playerId: string): CommandResultV2 {
    const id = nationIdV2(playerId);
    if (!isHumanPlayerV2(this.state, id)) {
      return { accepted: false, reason: 'The viewer must be assigned to a human-controlled country.' };
    }
    if (this._viewerPlayerId === id) return { accepted: true };
    this._viewerPlayerId = id;
    this.humanWarBaselines.clear();
    this.trackHumanWars();
    this.emit({ reason: 'viewer-changed' });
    return { accepted: true };
  }

  private emit(change: WorldChangeV2): void {
    for (const listener of this.listeners) listener(this.state, change);
  }

  private emitQueuedAction(action: QueuedWorldActionV2): void {
    for (const listener of this.queuedActionListeners) listener(action);
  }

  private assertStateIntegrity(force = false): void {
    // Full world invariants remain exhaustive in development and tests. In the
    // production loop they run at a bounded cadence, plus every terminal path,
    // instead of rescanning the entire world after every visible week.
    if (force || import.meta.env.DEV
      || this.state.tick % PRODUCTION_FULL_INVARIANT_INTERVAL_TICKS === 0) {
      assertInvariantsV2(this.state, this.content);
    }
  }

  private forwardClientCommand(command: WorldCommandV2): CommandResultV2 | undefined {
    if (!this.hasClockAuthority && !this.applyingCommand) {
      if (!this.clientCommandSink) {
        return { accepted: false, reason: 'The authoritative host is not connected.' };
      }
      return this.clientCommandSink(command);
    }
    return undefined;
  }

  private queue(command: WorldCommandV2): CommandResultV2 {
    const forwarded = this.forwardClientCommand(command);
    if (forwarded) return forwarded;
    const sequence = ++this.state.actionSequence;
    const action = { sequence, command };
    this.pendingActions.push(action);
    this.emitQueuedAction(action);
    this.emit({ reason: 'action-queued' });
    return { accepted: true };
  }

  enqueueAuthoritativeAction(action: QueuedWorldActionV2): CommandResultV2 {
    const expectedSequence = this.state.actionSequence + 1;
    if (!Number.isSafeInteger(action.sequence) || action.sequence !== expectedSequence) {
      return {
        accepted: false,
        reason: `Expected authoritative action sequence ${expectedSequence}, received ${String(action.sequence)}.`,
      };
    }
    this.state.actionSequence = action.sequence;
    this.pendingActions.push({ sequence: action.sequence, command: action.command });
    this.emit({ reason: 'action-queued' });
    return { accepted: true };
  }

  private recordAppliedAction(): void {
    if (!this.sequenceAlreadyAssigned) this.state.actionSequence += 1;
  }

  /** Same national ATK/DEF view used by the HUD, forecasts and live combat. */
  private effectiveNationalRatings(playerId: PlayerId): { attack: number; defense: number } {
    const snapshot = createMilitaryBaseSnapshotV2(this.state, this.content);
    const base = snapshot.byNation.get(playerId) ?? { attack: 1, defense: 1 };
    const manpower = selectTotalManpowerV2(this.state, playerId);
    const army: ArmyStateV2 = {
      manpower: manpower.deployed,
      capacity: manpower.capacity,
      baseAttack: base.attack,
      baseDefense: base.defense,
    };
    return {
      attack: selectEffectiveAttackV2(this.state, this.content, playerId, army, snapshot),
      defense: selectEffectiveDefenseV2(this.state, this.content, playerId, army, snapshot),
    };
  }

  private captureHumanNationBaseline(): HumanNationBaselineV2 {
    const humanId = this._viewerPlayerId;
    const ratings = this.effectiveNationalRatings(humanId);
    const manpower = selectTotalManpowerV2(this.state, humanId);
    return {
      humanId,
      ownedTerritories: new Set(selectTerritoriesOfV2(this.state, humanId).map((territory) => territory.id)),
      treasuryBefore: this.state.players[humanId]?.treasury ?? 0,
      effectiveAttackBefore: ratings.attack,
      effectiveDefenseBefore: ratings.defense,
      combatPowerBefore: selectCurrentPowerV2(this.state, this.content, humanId),
      capacityBefore: manpower.capacity,
    };
  }

  private trackHumanWars(baseline?: HumanNationBaselineV2): void {
    const humanId = this._viewerPlayerId;
    let source = baseline?.humanId === humanId ? baseline : undefined;
    for (const war of this.state.wars) {
      if (war.attackerId !== humanId && war.defenderId !== humanId) continue;
      if (this.humanWarBaselines.has(war.id)) continue;
      source ??= this.captureHumanNationBaseline();
      this.humanWarBaselines.set(war.id, {
        humanId,
        opponentId: war.attackerId === humanId ? war.defenderId : war.attackerId,
        humanRole: war.attackerId === humanId ? 'attacker' : 'defender',
        ownedTerritories: new Set(source.ownedTerritories),
        touchedTerritories: new Set(),
        treasuryBefore: source.treasuryBefore,
        treasurySeized: 0,
        treasuryLost: 0,
        effectiveAttackBefore: source.effectiveAttackBefore,
        effectiveDefenseBefore: source.effectiveDefenseBefore,
        combatPowerBefore: source.combatPowerBefore,
        capacityBefore: source.capacityBefore,
      });
    }
  }

  private recordHumanWarBattle(battle: BattleEventV2): void {
    const baseline = this.humanWarBaselines.get(battle.warId);
    if (!baseline) return;
    if (battle.conquered) baseline.touchedTerritories.add(battle.targetId);
    if (battle.treasurySeized <= 0) return;
    if (battle.attackerId === baseline.humanId) baseline.treasurySeized = round(
      baseline.treasurySeized + battle.treasurySeized,
    );
    if (battle.defenderId === baseline.humanId) baseline.treasuryLost = round(
      baseline.treasuryLost + battle.treasurySeized,
    );
  }

  private emitWarConclusions(conclusions: readonly WarConclusionV2[]): void {
    for (const conclusion of conclusions) {
      const { war, settlement } = conclusion;
      const humanId = this._viewerPlayerId;
      if (war.attackerId !== humanId && war.defenderId !== humanId) continue;
      const fallback = this.captureHumanNationBaseline();
      const baseline = this.humanWarBaselines.get(war.id) ?? {
        humanId,
        opponentId: war.attackerId === humanId ? war.defenderId : war.attackerId,
        humanRole: war.attackerId === humanId ? 'attacker' as const : 'defender' as const,
        ownedTerritories: fallback.ownedTerritories,
        touchedTerritories: new Set<TerritoryId>(),
        treasuryBefore: fallback.treasuryBefore,
        treasurySeized: 0,
        treasuryLost: 0,
        effectiveAttackBefore: fallback.effectiveAttackBefore,
        effectiveDefenseBefore: fallback.effectiveDefenseBefore,
        combatPowerBefore: fallback.combatPowerBefore,
        capacityBefore: fallback.capacityBefore,
      };
      const gained = [...baseline.touchedTerritories].filter((territoryId) => (
        !baseline.ownedTerritories.has(territoryId)
          && this.state.territories[territoryId]?.owner === humanId
      )).sort((left, right) => left.localeCompare(right));
      const lost = [...baseline.touchedTerritories].filter((territoryId) => (
        baseline.ownedTerritories.has(territoryId)
          && this.state.territories[territoryId]?.owner !== humanId
      )).sort((left, right) => left.localeCompare(right));
      const sumTerritories = (territoryIds: readonly TerritoryId[], field: 'population' | 'economy'): number => round(
        territoryIds.reduce((sum, territoryId) => sum + (this.state.territories[territoryId]?.[field] ?? 0), 0),
      );
      const ratingsAfter = this.effectiveNationalRatings(humanId);
      const reparationsReceived = settlement?.kind === 'reparations' && settlement.payeeId === humanId
        ? settlement.amount ?? 0 : 0;
      const reparationsPaid = settlement?.kind === 'reparations' && settlement.payerId === humanId
        ? settlement.amount ?? 0 : 0;
      const treatyWeeklyPayment = settlement?.kind === 'ceasefire'
        ? (settlement.payeeId === humanId ? settlement.weeklyCost ?? 0
          : settlement.payerId === humanId ? -(settlement.weeklyCost ?? 0) : 0)
        : 0;
      const humanEliminated = selectTerritoriesOfV2(this.state, humanId).length === 0;
      const opponentEliminated = selectTerritoriesOfV2(this.state, baseline.opponentId).length === 0;
      const result: WarOutcomeV2['result'] = humanEliminated
        ? 'defeat'
        : opponentEliminated && gained.length > 0
          ? 'victory'
          : gained.length > lost.length
            ? 'territorial-gain'
            : lost.length > gained.length
              ? 'territorial-loss'
              : settlement
                ? 'treaty'
                : 'stalemate';
      const outcome: WarOutcomeV2 = {
        warId: war.id,
        startedTick: war.startedTick,
        endedTick: conclusion.endedTick,
        humanId,
        opponentId: baseline.opponentId,
        humanRole: baseline.humanRole,
        result,
        reason: conclusion.reason,
        battles: war.battles,
        warScore: round(baseline.humanRole === 'attacker' ? war.warScore : -war.warScore),
        ownLosses: baseline.humanRole === 'attacker' ? war.attackerLosses : war.defenderLosses,
        enemyLosses: baseline.humanRole === 'attacker' ? war.defenderLosses : war.attackerLosses,
        ownCivilianLosses: baseline.humanRole === 'attacker'
          ? war.attackerCivilianLosses ?? 0 : war.defenderCivilianLosses ?? 0,
        enemyCivilianLosses: baseline.humanRole === 'attacker'
          ? war.defenderCivilianLosses ?? 0 : war.attackerCivilianLosses ?? 0,
        survivingManpower: selectTotalManpowerV2(this.state, humanId).deployed,
        territoriesGained: gained,
        territoriesLost: lost,
        gainedPopulation: sumTerritories(gained, 'population'),
        lostPopulation: sumTerritories(lost, 'population'),
        gainedEconomy: sumTerritories(gained, 'economy'),
        lostEconomy: sumTerritories(lost, 'economy'),
        treasuryBefore: baseline.treasuryBefore,
        treasuryAfter: this.state.players[humanId]?.treasury ?? 0,
        treasurySeized: baseline.treasurySeized,
        treasuryLost: baseline.treasuryLost,
        reparationsReceived,
        reparationsPaid,
        treatyWeeklyPayment,
        treatyPaymentWeeks: settlement?.kind === 'ceasefire' ? settlement.paymentWeeks ?? 0 : 0,
        effectiveAttackBefore: baseline.effectiveAttackBefore,
        effectiveAttackAfter: ratingsAfter.attack,
        effectiveDefenseBefore: baseline.effectiveDefenseBefore,
        effectiveDefenseAfter: ratingsAfter.defense,
        combatPowerBefore: baseline.combatPowerBefore,
        combatPowerAfter: selectCurrentPowerV2(this.state, this.content, humanId),
        capacityBefore: baseline.capacityBefore,
        capacityAfter: selectTotalManpowerV2(this.state, humanId).capacity,
      };
      this.humanWarBaselines.delete(war.id);
      this.emit({ reason: 'war-outcome', warOutcome: outcome, critical: true });
    }
  }

  player(playerId: string): NationViewV2 | undefined {
    return selectNationViewV2(this.state, this.content, nationIdV2(playerId));
  }

  territoriesOf(playerId: string): TerritoryViewV2[] {
    return selectTerritoriesOfV2(this.state, nationIdV2(playerId));
  }

  /** Configures the immutable multiplayer seats before the first shared tick. */
  configureHumanPlayers(playerIds: readonly string[], viewerPlayerId: string): CommandResultV2 {
    if (this.state.tick > 0) return { accepted: false, reason: 'Human seats are locked after the campaign begins.' };
    const ids = [...new Set(playerIds.map(nationIdV2))]
      .sort((left, right) => left.localeCompare(right));
    const viewerId = nationIdV2(viewerPlayerId);
    if (ids.length < 1 || ids.length > 8) return { accepted: false, reason: 'A campaign supports 1–8 human countries.' };
    if (!ids.includes(viewerId)) return { accepted: false, reason: 'The viewer needs an assigned human country.' };
    if (ids.some((id) => !this.state.players[id] || this.territoriesOf(id).length === 0)) {
      return { accepted: false, reason: 'Every human seat needs a living country.' };
    }
    const primaryId = ids.includes(this.state.humanPlayerId)
      ? this.state.humanPlayerId
      : ids[0]!;

    this.stopClock();
    // The primary id is canonical shared state; the viewer is local runtime
    // state. Never let different client seats produce different save hashes.
    this.state.humanPlayerId = primaryId;
    this.state.humanPlayerIds = ids;
    this._viewerPlayerId = viewerId;
    this.state.speed = 1;
    this.state.aiEscalation = {
      lastWarStartTick: -1_000_000,
      lastFederationTick: -1_000_000,
      resistanceLevel: 0,
      globalThreat: 0,
      coalitionMembers: [],
      lastHumanTerritoryCount: this.territoriesOf(primaryId).length,
      lastHumanPower: selectCurrentPowerV2(this.state, this.content, primaryId),
    };
    this.humanWarBaselines.clear();
    this.trackHumanWars();
    this.emit({ reason: 'human-players-configured' });
    return { accepted: true };
  }

  chooseCountry(countryId: string): CommandResultV2 {
    const id = nationIdV2(countryId);
    if (this.state.tick > 0) return { accepted: false, reason: 'Country selection is locked after the campaign begins.' };
    if (!this.state.players[id] || this.territoriesOf(id).length === 0) return { accepted: false, reason: 'Unknown or eliminated country.' };
    const command: WorldCommandV2 = { type: 'choose-country', countryId: id };
    const forwarded = this.forwardClientCommand(command);
    if (forwarded) return forwarded;
    const publishAction = !this.applyingCommand;
    const formerHumanId = this.state.humanPlayerId;
    if (this.state.tick === 0 && formerHumanId !== id) {
      this.state.players[formerHumanId]!.propagandaProgram = null;
      this.state.players[formerHumanId]!.propagandaAvailableTick = 0;
    }
    this.state.humanPlayerId = id;
    this.state.humanPlayerIds = [id];
    this._viewerPlayerId = id;
    this.humanWarBaselines.clear();
    this.trackHumanWars();
    this.state.aiEscalation = {
      lastWarStartTick: -1_000_000,
      lastFederationTick: -1_000_000,
      resistanceLevel: 0,
      globalThreat: 0,
      coalitionMembers: [],
      lastHumanTerritoryCount: this.territoriesOf(id).length,
      lastHumanPower: selectCurrentPowerV2(this.state, this.content, id),
    };
    this.state.speed = 1;
    this.recordAppliedAction();
    if (publishAction) this.emitQueuedAction({ sequence: this.state.actionSequence, command });
    this.startClock();
    this.emit({ reason: 'country-chosen' });
    return { accepted: true };
  }

  startClock(): void {
    this.stopClock();
    if (!this.hasClockAuthority || this.state.speed === 0) return;
    this.clock = setInterval(() => this.step(), V2_TICK_DURATION_MS / this.state.speed);
  }

  stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = undefined;
  }

  setSpeed(speed: WorldSpeedV2): CommandResultV2 {
    if (![0, 1, 2].includes(speed)) return { accepted: false, reason: 'Speed must be 0, 1 or 2.' };
    const forwarded = this.forwardClientCommand({ type: 'set-speed', speed });
    if (forwarded) return forwarded;
    return this.setAuthoritativeSpeed(speed);
  }

  /** Applies host-broadcast speed without feeding it back into the client sink. */
  setAuthoritativeSpeed(speed: WorldSpeedV2): CommandResultV2 {
    if (![0, 1, 2].includes(speed)) return { accepted: false, reason: 'Speed must be 0, 1 or 2.' };
    this.state.speed = speed;
    this.startClock();
    this.emit({ reason: 'speed-changed' });
    return { accepted: true };
  }

  setEmpireName(playerId: string, name: string): CommandResultV2 {
    const id = nationIdV2(playerId);
    const canonical = name.trim().replace(/\s+/g, ' ');
    const initialTerritories = this.content.territoryIds.filter((territoryId) => (
      this.content.territories[territoryId]?.initialOwnerId === id
    )).length;
    if (!isHumanPlayerV2(this.state, id)) return { accepted: false, reason: 'Only a human player empire can be named.' };
    if (this.territoriesOf(id).length <= initialTerritories) return { accepted: false, reason: 'Win your first conquest before naming the empire.' };
    if (canonical.length < 3 || canonical.length > 36
      || !/^[\p{L}\p{N}][\p{L}\p{N} .,'’&-]*$/u.test(canonical)) {
      return { accepted: false, reason: 'Use 3–36 letters, numbers, spaces or basic punctuation.' };
    }
    if (!this.applyingCommand) return this.queue({ type: 'set-empire-name', playerId: id, name: canonical });
    this.state.players[id]!.empireName = canonical;
    this.recordAppliedAction();
    this.emit({ reason: 'empire-named', critical: true });
    return { accepted: true };
  }

  controlledPopulation(playerId: string): number {
    return selectControlledPopulationV2(this.state, nationIdV2(playerId));
  }

  weeklyPopulationTrend(playerId: string): number {
    return selectWeeklyPopulationTrendV2(this.state, this.content, nationIdV2(playerId));
  }

  populationDynamics(playerId: string, populationGrowthFunding?: number): PopulationDynamicsV2 {
    return selectPopulationDynamicsV2(
      this.state,
      this.content,
      nationIdV2(playerId),
      populationGrowthFunding,
    );
  }

  weeklyManpowerTrend(playerId: string): number {
    return selectWeeklyManpowerTrendV2(this.state, this.content, nationIdV2(playerId));
  }

  weeklyManpowerProjection(playerId: string): WeeklyManpowerProjectionV2 {
    return selectWeeklyManpowerProjectionV2(this.state, this.content, nationIdV2(playerId));
  }

  nationalEconomy(playerId: string): NationalEconomyV2 {
    return selectNationalEconomyV2(this.state, this.content, nationIdV2(playerId));
  }

  economicOutputLedger(playerId: string): EconomicOutputLedgerV2 {
    return selectEconomicOutputLedgerV2(this.state, this.content, nationIdV2(playerId));
  }

  totalManpower(playerId: string): TotalManpowerV2 {
    return selectTotalManpowerV2(this.state, nationIdV2(playerId));
  }

  /** Ephemeral one-week map telemetry; never part of saves or deterministic hashes. */
  recentLogisticsMovements(): readonly LogisticsMovementV2[] {
    return this.logisticsMovements;
  }

  rapidRecruitmentTerms(playerId: string): RapidRecruitmentTermsV2 {
    return selectRapidRecruitmentTermsV2(this.state, this.content, nationIdV2(playerId));
  }

  rapidRecruitment(playerId: string): CommandResultV2 {
    const id = nationIdV2(playerId);
    const terms = this.rapidRecruitmentTerms(id);
    // Re-evaluate this rule when queued commands are applied as well as when
    // they are requested, so a war starting in between cannot bypass reserves.
    if (terms.atWar) return { accepted: false, reason: terms.reason ?? 'Rapid Recruitment is unavailable during war.' };
    if (!terms.allowed) return { accepted: false, reason: terms.reason };
    if (!this.applyingCommand) return this.queue({ type: 'rapid-recruitment', playerId: id });

    const nation = this.state.players[id]!;
    const owned = this.territoriesOf(id);
    const territories = owned
      .map((view) => ({
        id: view.id,
        gap: Math.max(0, this.state.territories[view.id]!.army.capacity - this.state.territories[view.id]!.army.manpower),
      }))
      .filter((item) => item.gap > 0)
      .sort((left, right) => right.gap - left.gap || left.id.localeCompare(right.id));
    const totalGap = territories.reduce((sum, item) => sum + item.gap, 0);
    let remaining = terms.amount;
    for (let index = 0; index < territories.length; index += 1) {
      const item = territories[index]!;
      const territory = this.state.territories[item.id]!;
      const share = index === territories.length - 1
        ? remaining : Math.min(remaining, terms.amount * item.gap / Math.max(0.0000001, totalGap));
      const added = addArmyManpowerWithQualityV2(
        territory.army,
        Math.min(item.gap, share),
        localArmyBaseQualityV2(this.content, item.id),
      );
      remaining = Math.max(0, remaining - added);
    }
    nation.treasury = round(nation.treasury - terms.cost);
    nation.manualActionUses.rapidRecruitment += 1;
    nation.rapidRecruitmentAvailableTick = this.state.tick + RAPID_RECRUITMENT_COOLDOWN_TICKS;
    this.recordAppliedAction();
    this.emit({ reason: 'rapid-recruitment' });
    return { accepted: true };
  }

  armyStrength(playerId: string): ArmyStrengthV2 {
    return selectArmyStrengthV2(this.state, this.content, nationIdV2(playerId));
  }

  weeklyFinanceBreakdown(playerId: string): WeeklyFinanceBreakdownV2 {
    return selectWeeklyFinanceBreakdownV2(this.state, this.content, nationIdV2(playerId));
  }

  openingCandidateFinancePlans(
    powerSnapshot?: PowerSnapshotV2,
  ): ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2> {
    return selectOpeningCandidateFinancePlansV2(this.state, this.content, powerSnapshot);
  }

  /** Pure authoritative preview; does not queue or mutate the proposed budget. */
  weeklyFinanceBreakdownForBudget(playerId: string, budget: BudgetPolicyV2): WeeklyFinanceBreakdownV2 {
    if (!validBudgetV2(budget)) throw new Error('Budget must be integer 5–90 allocations summing to 100.');
    return selectWeeklyFinanceBreakdownV2(
      this.state,
      this.content,
      nationIdV2(playerId),
      undefined,
      budget,
    );
  }

  weeklyNetCashflow(playerId: string): number {
    return this.weeklyFinanceBreakdown(playerId).net;
  }

  nationalAiPlan(playerId: string): NationalAiPlanV2 {
    return selectNationalAiPlanV2(this.state, this.content, nationIdV2(playerId));
  }

  globalResistance(): GlobalResistanceV2 {
    return selectGlobalResistanceV2(this.state);
  }

  globalRanking(powerSnapshot?: PowerSnapshotV2): RankingEntryV2[] {
    return selectGlobalRankingV2(this.state, this.content, powerSnapshot);
  }

  /** One fresh derived blend for bulk UI/map reads; never retained in saves. */
  militaryBaseSnapshot(): MilitaryBaseSnapshotV2 {
    return createMilitaryBaseSnapshotV2(this.state, this.content);
  }

  /** One shared conventional-power view for bulk finance and ranking reads. */
  powerSnapshot(militaryBaseSnapshot?: MilitaryBaseSnapshotV2): PowerSnapshotV2 {
    return createPowerSnapshotV2(this.state, this.content, militaryBaseSnapshot);
  }

  strategicScore(playerId: string): number {
    return selectStrategicScoreV2(this.state, this.content, nationIdV2(playerId));
  }

  currentPower(playerId: string, militaryBaseSnapshot?: MilitaryBaseSnapshotV2): number {
    return selectCurrentPowerV2(this.state, this.content, nationIdV2(playerId), militaryBaseSnapshot);
  }

  territoryPower(territoryId: string): number {
    return selectTerritoryPowerV2(this.state, this.content, territoryIdV2(territoryId));
  }

  conventionalPower(playerId: string): number {
    return selectConventionalPowerV2(this.state, this.content, nationIdV2(playerId));
  }

  nuclearPower(playerId: string): NuclearPowerViewV2 {
    return selectNuclearPowerV2(this.state, this.content, nationIdV2(playerId));
  }

  conquestForecast(attackerId: string, targetId: string): ConquestForecastV2 {
    return selectConquestForecastV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(targetId));
  }

  effectiveAttack(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number {
    return selectEffectiveAttackV2(this.state, this.content, nationIdV2(playerId), army, snapshot);
  }

  effectiveDefense(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number {
    return selectEffectiveDefenseV2(this.state, this.content, nationIdV2(playerId), army, snapshot);
  }

  effectiveRecovery(playerId: string, army: ArmyStateV2): number {
    return selectEffectiveRecoveryV2(this.state, this.content, nationIdV2(playerId), army);
  }

  effectivePower(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number {
    return selectEffectivePowerV2(this.state, this.content, nationIdV2(playerId), army, snapshot);
  }

  armyCapacityTarget(playerId: string): number {
    return selectArmyCapacityTargetV2(this.state, this.content, nationIdV2(playerId));
  }

  weeklyRecruitment(playerId: string): number {
    return selectWeeklyRecruitmentV2(this.state, this.content, nationIdV2(playerId));
  }

  /** Ordered ten-program view. Weekly funding sums to the one committed Research pot. */
  researchPortfolio(playerId: string): ResearchPortfolioV2 {
    return selectResearchPortfolioV2(this.state, this.content, nationIdV2(playerId));
  }

  researchSurgeTerms(playerId: string, targetBranch: ResearchBranchV2): ResearchSurgeTermsV2 {
    return selectResearchSurgeTermsV2(this.state, this.content, nationIdV2(playerId), targetBranch);
  }

  researchSurge(playerId: string, targetBranch: ResearchBranchV2): CommandResultV2 {
    const id = nationIdV2(playerId);
    const terms = this.researchSurgeTerms(id, targetBranch);
    if (!terms.allowed) return { accepted: false, reason: terms.reason };
    if (!this.applyingCommand) return this.queue({ type: 'research-surge', playerId: id, targetBranch });

    const nation = this.state.players[id]!;
    nation.research.progress[targetBranch] = round(
      nation.research.progress[targetBranch] + terms.progressAdded,
    );
    nation.treasury = round(nation.treasury - terms.cost);
    nation.manualActionUses.researchSurge += 1;
    nation.researchSurgeAvailableTick = this.state.tick + RESEARCH_SURGE_COOLDOWN_TICKS;
    this.recordAppliedAction();
    this.emit({ reason: 'research-surge' });
    return { accepted: true };
  }

  propagandaTerms(playerId: string): PropagandaTermsV2 {
    return selectPropagandaTermsV2(this.state, this.content, nationIdV2(playerId));
  }

  launchPropaganda(playerId: string): CommandResultV2 {
    const id = nationIdV2(playerId);
    const terms = this.propagandaTerms(id);
    if (!terms.allowed) return { accepted: false, reason: terms.reason };
    if (!this.applyingCommand) return this.queue({ type: 'launch-propaganda', playerId: id });

    const nation = this.state.players[id]!;
    nation.treasury = round(nation.treasury - terms.cost);
    nation.manualActionUses.propaganda += 1;
    nation.propagandaAvailableTick = this.state.tick + terms.cooldownTicks;
    nation.propagandaProgram = {
      startedTick: this.state.tick,
      endsTick: this.state.tick + terms.durationTicks,
      totalSuspicionReduction: terms.totalSuspicionReduction,
      weeklySuspicionReduction: terms.weeklySuspicionReduction,
    };
    this.recordAppliedAction();
    this.emit({ reason: 'propaganda-launched' });
    return { accepted: true };
  }

  /** Atomically queues the exact-100 extra-attention mix for the next tick boundary. */
  setResearchAllocations(playerId: string, allocations: ResearchAllocationsV2): CommandResultV2 {
    const id = nationIdV2(playerId);
    const nation = this.state.players[id];
    if (!nation || this.territoriesOf(id).length === 0) return { accepted: false, reason: 'Nation has no gameplay agency.' };
    if (!validResearchAllocationsV2(allocations)) return { accepted: false, reason: 'Development allocations must contain all ten integer programs and sum to 100.' };
    const canonical = copyResearchAllocationsV2(allocations);
    if (!this.applyingCommand) return this.queue({ type: 'set-research-allocations', playerId: id, allocations: canonical });
    nation.research.allocations = canonical;
    this.recordAppliedAction();
    this.emit({ reason: 'research-allocations' });
    return { accepted: true };
  }

  private applyBudgetPolicy(playerId: PlayerId, budget: BudgetPolicyV2, notify = true): CommandResultV2 {
    const nation = this.state.players[playerId];
    if (!nation || this.territoriesOf(playerId).length === 0) return { accepted: false, reason: 'Nation has no gameplay agency.' };
    if (!validBudgetV2(budget)) return { accepted: false, reason: 'Budget must be integer 5–90 allocations summing to 100.' };
    nation.budget = { ...budget };
    this.recordAppliedAction();
    if (notify) this.emit({ reason: 'budget-changed' });
    return { accepted: true };
  }

  /** Atomically queues an exact 100% three-way budget mix for the next tick boundary. */
  setBudgetPolicy(playerId: string, budget: BudgetPolicyV2): CommandResultV2 {
    const id = nationIdV2(playerId);
    const nation = this.state.players[id];
    if (!nation || this.territoriesOf(id).length === 0) return { accepted: false, reason: 'Nation has no gameplay agency.' };
    if (!validBudgetV2(budget)) return { accepted: false, reason: 'Budget must be integer 5–90 allocations summing to 100.' };
    if (!this.applyingCommand) return this.queue({ type: 'set-budget-policy', playerId: id, budget: { ...budget } });
    return this.applyBudgetPolicy(id, budget);
  }

  adjustBudget(playerId: string, domain: BudgetDomainV2, delta: number): CommandResultV2 {
    const id = nationIdV2(playerId);
    const nation = this.state.players[id];
    if (!nation || this.territoriesOf(id).length === 0 || !BUDGET_DOMAINS.includes(domain) || !Number.isInteger(delta)) return { accepted: false, reason: 'Invalid budget change or nation has no gameplay agency.' };
    if (!this.applyingCommand) return this.queue({ type: 'adjust-budget', playerId: id, domain, delta });
    const next = { ...nation.budget };
    const desired = clamp(next[domain] + delta, 5, 90);
    let remaining = desired - next[domain];
    next[domain] = desired;
    const others = BUDGET_DOMAINS.filter((candidate) => candidate !== domain)
      .sort((a, b) => remaining > 0 ? next[b] - next[a] || a.localeCompare(b) : next[a] - next[b] || a.localeCompare(b));
    while (remaining !== 0) {
      const candidate = others.find((other) => remaining > 0 ? next[other] > 5 : next[other] < 90);
      if (!candidate) return { accepted: false, reason: 'Budget bounds prevent that change.' };
      const unit = remaining > 0 ? 1 : -1;
      next[candidate] -= unit;
      remaining -= unit;
    }
    return this.applyBudgetPolicy(id, next);
  }

  activeWarBetween(leftId: string, rightId: string): WarStateV2 | undefined {
    return selectActiveWarBetweenV2(this.state, nationIdV2(leftId), nationIdV2(rightId));
  }

  warOperation(warId: string, commanderId: string) {
    return selectWarOperationV2(this.state, warId, nationIdV2(commanderId));
  }

  warAccessType(attackerId: string, defenderId: string): WarAccessV2 {
    return selectWarAccessTypeV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(defenderId));
  }

  warMobilizationCost(attackerId: string, defenderId: string): number {
    return selectWarMobilizationCostV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(defenderId));
  }

  canDeclareWar(attackerId: string, defenderId: string): boolean {
    return canDeclareWarV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(defenderId));
  }

  warDeclarationStatus(attackerId: string, defenderId: string): WarDeclarationStatusV2 {
    return warDeclarationStatusV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(defenderId));
  }

  warForecast(attackerId: string, defenderId: string): WarForecastV2 {
    return forecastWarV2(this.state, this.content, nationIdV2(attackerId), nationIdV2(defenderId));
  }

  liveWarEstimate(warId: string, viewerId: string): LiveWarEstimateV2 | undefined {
    return estimateLiveWarV2(this.state, this.content, warId, nationIdV2(viewerId));
  }

  declareWar(attackerId: string, defenderId: string, escalatedFromWarId?: string): CommandResultV2 {
    const attacker = nationIdV2(attackerId);
    const defender = nationIdV2(defenderId);
    if (!this.applyingCommand) {
      if (!canDeclareWarV2(this.state, this.content, attacker, defender)) return { accepted: false, reason: 'War is not legal or affordable.' };
      return this.queue({ type: 'declare-war', attackerId: attacker, defenderId: defender, escalatedFromWarId });
    }
    const humanBaseline = this.captureHumanNationBaseline();
    const result = declareWarV2(this.state, this.content, attacker, defender, escalatedFromWarId);
    if (result.accepted) {
      this.trackHumanWars(humanBaseline);
      this.recordAppliedAction();
      this.emit({ reason: 'war-declared', critical: true });
    }
    return result;
  }

  ceasefireTerms(warId: string, requesterId: string): CeasefireTermsV2 {
    return ceasefireTermsV2(this.state, this.content, warId, nationIdV2(requesterId));
  }

  requestCeasefire(warId: string, requesterId: string): CommandResultV2 {
    const requester = nationIdV2(requesterId);
    if (!this.applyingCommand) {
      const terms = ceasefireTermsV2(this.state, this.content, warId, requester);
      if (!terms.allowed) return { accepted: false, reason: terms.reason };
      return this.queue({ type: 'request-ceasefire', warId, requesterId: requester });
    }
    const result = requestCeasefireV2(this.state, this.content, warId, requester);
    if (result.accepted) {
      this.recordAppliedAction();
      this.emit({ reason: 'ceasefire-requested' });
    }
    return result;
  }

  peaceProposalTerms(warId: string, playerId: string): PeaceProposalTermsV2 {
    return peaceProposalTermsV2(this.state, this.content, warId, nationIdV2(playerId));
  }

  proposePeaceSettlement(fromId: string, targetId: string, settlement: PeaceSettlementV2): CommandResultV2 {
    const from = nationIdV2(fromId);
    const target = nationIdV2(targetId);
    if (!this.applyingCommand) {
      const war = selectActiveWarBetweenV2(this.state, from, target);
      if (!war || !peaceProposalTermsV2(this.state, this.content, war.id, from).allowed) return { accepted: false, reason: 'Peace terms are not available.' };
      return this.queue({ type: 'propose-peace', fromId: from, targetId: target, settlement });
    }
    const result = proposePeaceSettlementV2(this.state, this.content, from, target, settlement);
    if (result.accepted) this.recordAppliedAction();
    return result;
  }

  respondToOffer(offerId: string, accept: boolean): CommandResultV2 {
    if (!this.applyingCommand) {
      if (!this.state.offers.some((offer) => (
        offer.id === offerId && offer.status === 'pending' && offer.expiresTick > this.state.tick
      ))) return { accepted: false, reason: 'Offer is unavailable.' };
      return this.queue({ type: 'respond-to-offer', offerId, accept });
    }
    const conclusions: WarConclusionV2[] = [];
    const result = respondToOfferV2(this.state, this.content, offerId, accept, conclusions);
    if (result.accepted) {
      this.recordAppliedAction();
      this.emit({ reason: accept ? 'peace-accepted' : 'peace-declined' });
      if (accept) this.emitWarConclusions(conclusions);
    }
    return result;
  }

  markAllEventsRead(): void {
    for (const event of this.state.events) event.unread = false;
    this.emit({ reason: 'events-read' });
  }

  submitCommand(command: WorldCommandV2): CommandResultV2 {
    switch (command.type) {
      case 'choose-country': return this.chooseCountry(command.countryId);
      case 'set-speed': return this.applyingCommand
        ? this.setAuthoritativeSpeed(command.speed)
        : this.setSpeed(command.speed);
      case 'set-research-allocations': return this.setResearchAllocations(command.playerId, command.allocations);
      case 'adjust-budget': return this.adjustBudget(command.playerId, command.domain, command.delta);
      case 'set-budget-policy': return this.setBudgetPolicy(command.playerId, command.budget);
      case 'rapid-recruitment': return this.rapidRecruitment(command.playerId);
      case 'research-surge': return this.researchSurge(command.playerId, command.targetBranch);
      case 'launch-propaganda': return this.launchPropaganda(command.playerId);
      case 'set-empire-name': return this.setEmpireName(command.playerId, command.name);
      case 'declare-war': return this.declareWar(command.attackerId, command.defenderId, command.escalatedFromWarId);
      case 'request-ceasefire': return this.requestCeasefire(command.warId, command.requesterId);
      case 'propose-peace': return this.proposePeaceSettlement(command.fromId, command.targetId, command.settlement);
      case 'respond-to-offer': return this.respondToOffer(command.offerId, command.accept);
    }
  }

  private applyCommand(command: WorldCommandV2): CommandResultV2 {
    return this.submitCommand(command);
  }

  private flushQueuedActions(): void {
    if (this.pendingActions.length === 0) return;
    const actions = this.pendingActions.splice(0);
    if (actions.length > 1) actions.sort((a, b) => a.sequence - b.sequence);
    this.applyingCommand = true;
    this.sequenceAlreadyAssigned = true;
    try {
      for (const action of actions) this.applyCommand(action.command);
    } finally {
      this.sequenceAlreadyAssigned = false;
      this.applyingCommand = false;
    }
  }

  private applyAiCommand(command: WorldCommandV2): void {
    this.applyingCommand = true;
    try {
      this.applyCommand(command);
    } finally {
      this.applyingCommand = false;
    }
  }

  private deriveVictory(): void {
    // Full integration may retire the selected country's backend record before
    // global conquest. Preserve that terminal defeat while other AI owners
    // continue to exist on the map.
    if (!this.state.players[this.state.humanPlayerId]
      && this.state.winnerId && this.state.players[this.state.winnerId]) {
      this.state.gameOver = true;
      this.state.speed = 0;
      return;
    }
    let soleOwner: PlayerId | undefined;
    let territoryCount = 0;
    for (const territoryId in this.state.territories) {
      if (!Object.prototype.hasOwnProperty.call(this.state.territories, territoryId)) continue;
      const owner = this.state.territories[territoryIdV2(territoryId)]!.owner;
      territoryCount += 1;
      if (soleOwner === undefined) soleOwner = owner;
      else if (owner !== soleOwner) {
        this.state.winnerId = undefined;
        this.state.gameOver = false;
        return;
      }
    }
    const winner = territoryCount === this.content.territoryIds.length
      ? soleOwner : undefined;
    this.state.winnerId = winner;
    this.state.gameOver = Boolean(winner);
    if (winner) this.state.speed = 0;
  }

  step(ticks = 1): void {
    for (let index = 0; index < Math.max(1, Math.floor(ticks)); index += 1) {
      if (this.state.gameOver) return;
      this.flushQueuedActions();
      this.state.tick += 1;
      processOpeningConflictsV2(this.state, this.content);
      this.trackHumanWars();
      const financePowers = createPowerSnapshotV2(this.state, this.content);
      const finance = createFinancePlansV2(this.state, this.content, financePowers);
      const integrationCompletions = processFinanceMilitaryV2(this.state, this.content, finance);
      for (const completion of integrationCompletions) this.emit({
        reason: 'integration-complete',
        victorId: completion.ownerId,
        defeatedId: completion.formerCoreOwnerId,
        critical: completion.ownerId === this._viewerPlayerId,
      });
      if (this.state.gameOver) {
        pruneWorldHistoryV2(this.state);
        this.assertStateIntegrity(true);
        this.emit({ reason: 'tick', critical: true });
        return;
      }
      const researchPowers = createPowerSnapshotV2(this.state, this.content);
      processResearchV2(this.state, this.content, finance, researchPowers);
      processDevelopmentPhaseV2(this.state, this.content, finance);
      const ownersBeforeWar = this.state.wars.length > 0
        ? new Map(this.content.territoryIds.map((territoryId) => [
            territoryId,
            this.state.territories[territoryId]!.owner,
          ]))
        : undefined;
      this.logisticsMovements = [];
      const conclusions: WarConclusionV2[] = [];
      const battles = processWarsV2(this.state, this.content, this.logisticsMovements, conclusions);
      synchronizeArmyCapacityV2(this.state, this.content);
      for (const battle of battles) {
        this.recordHumanWarBattle(battle);
        this.emit({ reason: battle.conquered ? 'conquest' : 'battle', battle, critical: battle.conquered });
      }
      this.emitWarConclusions(conclusions);
      const formerOwners = new Set(ownersBeforeWar?.values() ?? []);
      const livingOwners = new Set(Object.values(this.state.territories).map((territory) => territory.owner));
      for (const defeatedId of [...formerOwners].filter((id) => !livingOwners.has(id)).sort((a, b) => a.localeCompare(b))) {
        const conquerors = new Map<PlayerId, number>();
        for (const [territoryId, formerOwner] of ownersBeforeWar ?? []) {
          if (formerOwner !== defeatedId) continue;
          const victorId = this.state.territories[territoryId]!.owner;
          if (victorId !== defeatedId) conquerors.set(victorId, (conquerors.get(victorId) ?? 0) + 1);
        }
        const victorId = [...conquerors].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
        if (victorId) {
          // Notify while the defeated identity is still available for labels,
          // then retire an exile whose last foreign holding was restored
          // directly to its sovereign core. Ordinary conquests remain alive
          // because their unfinished integration still references them.
          this.emit({ reason: 'nation-defeated', victorId, defeatedId, critical: true });
          retireAbsorbedNationV2(this.state, this.content, defeatedId, victorId);
        }
      }
      // An exile can enter the week without land while an older war still
      // references it. Once that final war concludes, retirement resolves its
      // deterministic home-core successor (falling back to the opponent).
      for (const { war } of conclusions) {
        for (const [candidateId, successorId] of [
          [war.attackerId, war.defenderId],
          [war.defenderId, war.attackerId],
        ] as const) {
          if (!livingOwners.has(candidateId)) {
            retireAbsorbedNationV2(this.state, this.content, candidateId, successorId);
          }
        }
      }
      if (this.state.gameOver) {
        pruneWorldHistoryV2(this.state);
        this.assertStateIntegrity(true);
        this.emit({ reason: 'tick', critical: true });
        return;
      }
      // Battles may have changed surviving manpower, local army quality and
      // ownership. Resistance decisions need fresh additive post-war power.
      const resistancePowers = createPowerSnapshotV2(this.state, this.content);
      const resistanceLevel = updateGlobalResistanceV2(this.state, this.content, resistancePowers);
      processPropagandaProgramsV2(this.state);
      if (resistanceLevel) this.emit({ reason: 'resistance-formed', critical: true });
      for (const command of planAiCommandsV2(this.state, this.content)) this.applyAiCommand(command);
      this.deriveVictory();
      pruneWorldHistoryV2(this.state);
      this.assertStateIntegrity();
      this.emit({ reason: 'tick' });
    }
  }
}

export default WorldEngineV2;
