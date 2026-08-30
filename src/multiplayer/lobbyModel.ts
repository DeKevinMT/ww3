import {
  MAX_MULTIPLAYER_PLAYERS,
  MIN_MULTIPLAYER_PLAYERS,
  validateMultiplayerDeploymentSnapshotV1,
  type LobbyAction,
  type LobbyPlayer,
  type LobbyStateMessage,
} from './protocol';
import type { CommandResultV2 } from '../sim/v2/types';
import type { WorldContentV2 } from '../sim/v2/content';
import {
  normalizeScenarioConfigV2,
  resolveScenarioV2,
  type ScenarioConfigV2,
} from '../sim/v2/scenarios';

export const LOBBY_REJOIN_GRACE_MS = 2 * 60_000;
export const SURVIVAL_COOP_PLAYER_COUNT_V1 = 2;

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export class HostLobbyModel {
  private readonly players = new Map<string, LobbyPlayer>();
  private revision = 0;
  private started = false;
  private startedRevision?: number;
  private scenario: ScenarioConfigV2;
  private content: WorldContentV2;
  private readonly disconnectedAt = new Map<string, number>();

  constructor(
    readonly hostPeerId: string,
    hostName: string,
    scenario: ScenarioConfigV2 = normalizeScenarioConfigV2({ mode: 'standard-2026', seed: 1 }),
    private readonly now: () => number = Date.now,
    private readonly rejoinGraceMs = LOBBY_REJOIN_GRACE_MS,
  ) {
    const resolved = resolveScenarioV2(scenario);
    this.scenario = resolved.config;
    this.content = resolved.content;
    this.players.set(hostPeerId, {
      peerId: hostPeerId,
      displayName: cleanName(hostName) || 'Host',
      countryId: null,
      deployment: null,
      ready: false,
      connected: true,
    });
  }

  connect(peerId: string, displayName: string): CommandResultV2 {
    if (this.started) return { accepted: false, reason: 'The campaign has already started.' };
    this.releaseExpiredDisconnected();
    const existing = this.players.get(peerId);
    if (!existing && this.players.size >= MAX_MULTIPLAYER_PLAYERS) {
      return { accepted: false, reason: `This room is full (${MAX_MULTIPLAYER_PLAYERS} players).` };
    }
    const name = cleanName(displayName);
    if (!name) return { accepted: false, reason: 'Enter a player name.' };
    if ([...this.players.values()].some((player) => (
      player.peerId !== peerId && player.displayName.toLocaleLowerCase('en') === name.toLocaleLowerCase('en')
    ))) return { accepted: false, reason: 'That player name is already in use.' };

    this.players.set(peerId, existing
      ? { ...existing, displayName: name, connected: true }
      : {
          peerId,
          displayName: name,
          countryId: null,
          deployment: null,
          ready: false,
          connected: true,
        });
    this.disconnectedAt.delete(peerId);
    this.revision += 1;
    return { accepted: true };
  }

  disconnect(peerId: string): void {
    const player = this.players.get(peerId);
    if (!player || !player.connected) return;
    // Stable Direct Connect identity reclaims this exact seat during grace;
    // country and display name cannot be stolen by a new transport.
    this.players.set(peerId, { ...player, connected: false, ready: false });
    if (peerId !== this.hostPeerId) this.disconnectedAt.set(peerId, this.now());
    this.revision += 1;
  }

  apply(peerId: string, action: LobbyAction, expectedRevision?: number): CommandResultV2 {
    if (expectedRevision !== undefined && expectedRevision !== this.revision) {
      return { accepted: false, reason: 'That lobby action is stale. Wait for the latest room update.' };
    }
    if (this.started) return { accepted: false, reason: 'The campaign has already started.' };
    const player = this.players.get(peerId);
    if (!player?.connected) return { accepted: false, reason: 'This player is not connected.' };

    switch (action.type) {
      case 'set-name':
        return this.connect(peerId, action.displayName);
      case 'set-scenario': {
        if (peerId !== this.hostPeerId) {
          return { accepted: false, reason: 'Only the room host can change the scenario.' };
        }
        let resolved: ReturnType<typeof resolveScenarioV2>;
        try {
          resolved = resolveScenarioV2(action.scenario);
        } catch (error) {
          return {
            accepted: false,
            reason: error instanceof Error ? error.message : 'That scenario is not supported.',
          };
        }
        if (resolved.config.mode === this.scenario.mode
          && resolved.config.version === this.scenario.version
          && resolved.config.seed === this.scenario.seed) return { accepted: true };
        const preserveCountryChoices = resolved.config.mode === this.scenario.mode;
        this.scenario = resolved.config;
        this.content = resolved.content;
        for (const [candidatePeerId, candidate] of this.players) {
          const countryId = preserveCountryChoices
            && candidate.countryId && this.content.nations[candidate.countryId]
            ? candidate.countryId
            : null;
          this.players.set(candidatePeerId, {
            ...candidate,
            countryId,
            deployment: countryId ? candidate.deployment : null,
            ready: false,
          });
        }
        this.revision += 1;
        return { accepted: true };
      }
      case 'select-country':
        if (!this.content.nations[action.countryId]) {
          return { accepted: false, reason: 'That country is not available in this scenario.' };
        }
        let deployment: LobbyPlayer['deployment'];
        try {
          deployment = validateMultiplayerDeploymentSnapshotV1(action.deployment);
        } catch (error) {
          return {
            accepted: false,
            reason: error instanceof Error ? error.message : 'That account deployment is invalid.',
          };
        }
        if (deployment.countryId !== action.countryId) {
          return { accepted: false, reason: 'The account deployment does not match that country.' };
        }
        if ([...this.players.values()].some((candidate) => (
          candidate.peerId !== peerId && candidate.countryId === action.countryId
        ))) return { accepted: false, reason: 'That country is already claimed.' };
        this.players.set(peerId, {
          ...player,
          countryId: action.countryId,
          deployment,
          ready: false,
        });
        this.revision += 1;
        return { accepted: true };
      case 'clear-country':
        this.players.set(peerId, {
          ...player,
          countryId: null,
          deployment: null,
          ready: false,
        });
        this.revision += 1;
        return { accepted: true };
      case 'set-ready':
        if (action.ready && (!player.countryId || !player.deployment)) {
          return { accepted: false, reason: 'Choose a country first.' };
        }
        this.players.set(peerId, { ...player, ready: action.ready });
        this.revision += 1;
        return { accepted: true };
      case 'start': {
        if (peerId !== this.hostPeerId) return { accepted: false, reason: 'Only the room host can start.' };
        const reason = this.startBlockReason();
        if (reason) return { accepted: false, reason };
        this.started = true;
        this.revision += 1;
        this.startedRevision = this.revision;
        return { accepted: true };
      }
    }
  }

  /**
   * Reopens a lobby only when the host's matching asynchronous launch attempt
   * failed. This is deliberately not a wire-level LobbyAction, so a guest can
   * never forge a rollback after the campaign has started successfully.
   */
  resetStartAfterLaunchFailure(peerId: string, startedRevision: number): CommandResultV2 {
    if (peerId !== this.hostPeerId) return { accepted: false, reason: 'Only the room host can recover a failed start.' };
    if (!this.started || this.startedRevision === undefined) {
      return { accepted: false, reason: 'There is no failed campaign start to recover.' };
    }
    if (startedRevision !== this.startedRevision) {
      return { accepted: false, reason: 'That campaign start attempt is no longer current.' };
    }
    this.started = false;
    this.startedRevision = undefined;
    this.revision += 1;
    return { accepted: true };
  }

  startBlockReason(): string | undefined {
    this.releaseExpiredDisconnected();
    const connected = [...this.players.values()].filter((player) => player.connected);
    if (connected.length < MIN_MULTIPLAYER_PLAYERS) return 'At least two connected players are required.';
    if (this.scenario.mode === 'survival'
      && connected.length !== SURVIVAL_COOP_PLAYER_COUNT_V1) {
      return 'Survival co-op deploys exactly two sovereign commands.';
    }
    if (connected.some((player) => !player.countryId || !player.deployment)) {
      return 'Every connected player must choose a country.';
    }
    if (connected.some((player) => !player.ready)) return 'Every connected player must be ready.';
    return undefined;
  }

  snapshot(): LobbyStateMessage {
    this.releaseExpiredDisconnected();
    return {
      type: 'lobby-state',
      revision: this.revision,
      hostPeerId: this.hostPeerId,
      scenario: { ...this.scenario },
      started: this.started,
      players: [...this.players.values()]
        .sort((left, right) => (
          Number(right.peerId === this.hostPeerId) - Number(left.peerId === this.hostPeerId)
          || left.displayName.localeCompare(right.displayName, 'en')
          || left.peerId.localeCompare(right.peerId)
        ))
        .map((player) => ({
          ...player,
          deployment: player.deployment ? structuredClone(player.deployment) : null,
        })),
    };
  }

  releaseExpiredDisconnected(now = this.now()): string[] {
    const released: string[] = [];
    for (const [peerId, disconnectedAt] of this.disconnectedAt) {
      if (now - disconnectedAt < this.rejoinGraceMs) continue;
      this.disconnectedAt.delete(peerId);
      const player = this.players.get(peerId);
      if (player && !player.connected) {
        this.players.delete(peerId);
        released.push(peerId);
      }
    }
    if (released.length > 0) this.revision += 1;
    return released;
  }
}
