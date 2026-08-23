import { describe, expect, it, vi } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { advanceTerritoryIntegrationProgramsV2, beginTerritoryIntegrationV2 } from './integration';
import { invariantErrorsV2 } from './invariants';
import { WorldEngineV2, type QueuedWorldActionV2 } from './WorldEngineV2';
import type { PlayerId, WarOutcomeV2, WorldStateV2 } from './types';
import { nationIdV2 } from './types';

describe('V2 authoritative host and replica engine hooks', () => {
  it('forwards a client command, assigns it on the host and stays hash-identical after the tick', () => {
    const host = new WorldEngineV2(71_001);
    const replica = new WorldEngineV2(1, WORLD_CONTENT_V2, structuredClone(host.state));
    const belgium = nationIdV2('bel');
    const desired = { military: 55, research: 20, development: 25 } as const;
    const observed: QueuedWorldActionV2[] = [];
    const sequenceBefore = host.state.actionSequence;

    replica.setClockAuthority(false);
    host.subscribeQueuedActions((action) => {
      observed.push(action);
      expect(replica.enqueueAuthoritativeAction(action)).toEqual({ accepted: true });
    });
    replica.setClientCommandSink((command) => host.submitCommand(command));

    expect(replica.submitCommand({
      type: 'set-budget-policy',
      playerId: belgium,
      budget: desired,
    })).toEqual({ accepted: true });
    expect(observed).toEqual([{
      sequence: sequenceBefore + 1,
      command: {
        type: 'set-budget-policy',
        playerId: belgium,
        budget: desired,
      },
    }]);
    expect(host.state.actionSequence).toBe(sequenceBefore + 1);
    expect(replica.state.actionSequence).toBe(sequenceBefore + 1);
    expect(host.state.players[belgium].budget).not.toEqual(desired);
    expect(replica.state.players[belgium].budget).not.toEqual(desired);
    expect(replica.canonicalHash()).toBe(host.canonicalHash());

    host.step();
    replica.step();

    expect(host.state.players[belgium].budget).toEqual(desired);
    expect(replica.state.players[belgium].budget).toEqual(desired);
    expect(replica.canonicalHash()).toBe(host.canonicalHash());
  }, 20_000);

  it('keeps the canonical primary human independent from each replica viewer seat', () => {
    const hostView = new WorldEngineV2(71_006);
    const guestView = new WorldEngineV2(71_006);
    const primary = hostView.state.humanPlayerId;
    const guest = WORLD_CONTENT_V2.nationIds.find((playerId) => playerId !== primary)!;
    const roster = [primary, guest];

    expect(hostView.configureHumanPlayers(roster, primary)).toEqual({ accepted: true });
    expect(guestView.configureHumanPlayers(roster, guest)).toEqual({ accepted: true });

    expect(hostView.state.humanPlayerId).toBe(primary);
    expect(guestView.state.humanPlayerId).toBe(primary);
    expect(hostView.state.humanPlayerIds).toEqual(guestView.state.humanPlayerIds);
    expect(hostView.viewerPlayerId).toBe(primary);
    expect(guestView.viewerPlayerId).toBe(guest);
    expect(guestView.canonicalHash()).toBe(hostView.canonicalHash());
  });

  it('rejects skipped or duplicate authoritative action sequences without mutating the replica', () => {
    const replica = new WorldEngineV2(71_002);
    const belgium = nationIdV2('bel');
    const beforeSequence = replica.state.actionSequence;
    const command = {
      type: 'adjust-budget',
      playerId: belgium,
      domain: 'military',
      delta: 1,
    } as const;

    replica.setClockAuthority(false);
    expect(replica.enqueueAuthoritativeAction({
      sequence: beforeSequence + 2,
      command,
    })).toMatchObject({ accepted: false });
    expect(replica.state.actionSequence).toBe(beforeSequence);

    expect(replica.enqueueAuthoritativeAction({
      sequence: beforeSequence + 1,
      command,
    })).toEqual({ accepted: true });
    expect(replica.enqueueAuthoritativeAction({
      sequence: beforeSequence + 1,
      command,
    })).toMatchObject({ accepted: false });
    expect(replica.state.actionSequence).toBe(beforeSequence + 1);
  });

  it('keeps replica speed commands remote and never starts a replica interval', () => {
    vi.useFakeTimers();
    try {
      const replica = new WorldEngineV2(71_003);
      const commands: unknown[] = [];
      const initialSpeed = replica.state.speed;
      const initialSequence = replica.state.actionSequence;
      replica.setClockAuthority(false);
      replica.setClientCommandSink((command) => {
        commands.push(command);
        return { accepted: true };
      });

      expect(replica.setSpeed(2)).toEqual({ accepted: true });
      expect(commands).toEqual([{ type: 'set-speed', speed: 2 }]);
      expect(replica.state.speed).toBe(initialSpeed);
      expect(replica.state.actionSequence).toBe(initialSequence);

      expect(replica.setAuthoritativeSpeed(2)).toEqual({ accepted: true });
      expect(replica.state.speed).toBe(2);
      replica.startClock();
      vi.advanceTimersByTime(10_000);
      expect(replica.state.tick).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves the local viewer with a host country choice and publishes its assigned sequence', () => {
    vi.useFakeTimers();
    try {
      const host = new WorldEngineV2(71_005);
      const canada = nationIdV2('can');
      const actions: QueuedWorldActionV2[] = [];
      const sequenceBefore = host.state.actionSequence;
      host.subscribeQueuedActions((action) => actions.push(action));

      expect(host.chooseCountry(canada)).toEqual({ accepted: true });
      expect(host.state.humanPlayerId).toBe(canada);
      expect(host.viewerPlayerId).toBe(canada);
      expect(actions).toEqual([{
        sequence: sequenceBefore + 1,
        command: { type: 'choose-country', countryId: canada },
      }]);
      host.stopClock();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks war outcomes for the local viewer instead of only the primary human', () => {
    const state = createWorldStateV2(71_004, WORLD_CONTENT_V2) as WorldStateV2 & {
      humanPlayerIds: PlayerId[];
    };
    const primary = nationIdV2('bel');
    const viewer = nationIdV2('can');
    const opponent = nationIdV2('lux');
    state.humanPlayerId = primary;
    state.humanPlayerIds = [primary, viewer];
    state.tick = 80;
    state.aiEscalation.lastWarStartTick = 1_000_000;
    state.wars = [{
      id: 'war-viewer-outcome',
      attackerId: viewer,
      defenderId: opponent,
      startedTick: 20,
      lastBattleTick: 78,
      warScore: 4,
      battles: 10,
      attackerLosses: 0.012,
      defenderLosses: 0.021,
      attackerCivilianLosses: 0.004,
      defenderCivilianLosses: 0.009,
      lastPeaceOfferTick: 79,
      attackerOperations: [],
      defenderOperations: [],
    }];
    state.players[opponent].treasury = 20;
    state.offers = [{
      id: 'offer-viewer-outcome',
      fromId: opponent,
      toId: viewer,
      warId: 'war-viewer-outcome',
      settlement: 'reparations',
      createdTick: 79,
      expiresTick: 100,
      status: 'pending',
      cashAmount: 4,
    }];
    const engine = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    const outcomes: WarOutcomeV2[] = [];
    engine.subscribe((_next, change) => {
      if (change.warOutcome) outcomes.push(change.warOutcome);
    });

    expect(engine.viewerPlayerId).toBe(primary);
    expect(engine.setViewerPlayerId(viewer)).toEqual({ accepted: true });
    expect(engine.viewerPlayerId).toBe(viewer);
    expect(engine.respondToOffer('offer-viewer-outcome', true)).toEqual({ accepted: true });
    engine.step();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      warId: 'war-viewer-outcome',
      humanId: viewer,
      opponentId: opponent,
      humanRole: 'attacker',
    });
  }, 15_000);

  it('turns one absorbed human seat into a spectator without ending the shared campaign', () => {
    const state = createWorldStateV2(71_007, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const luxembourg = nationIdV2('lux');
    const luxembourgTerritory = WORLD_CONTENT_V2.territoryIds.find((territoryId) => (
      WORLD_CONTENT_V2.territories[territoryId]?.initialOwnerId === luxembourg
    ))!;
    state.humanPlayerId = luxembourg;
    state.humanPlayerIds = [belgium, luxembourg].sort((left, right) => left.localeCompare(right));

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, belgium);
    state.tick = state.territories[luxembourgTerritory].integrationProgram!.completesTick;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(state.players[luxembourg]).toBeUndefined();
    expect(state.players[belgium]).toBeDefined();
    expect(state.humanPlayerId).toBe(belgium);
    expect(state.humanPlayerIds).toEqual([belgium, luxembourg].sort((left, right) => left.localeCompare(right)));
    expect(state.gameOver).toBe(false);
    expect(invariantErrorsV2(state, WORLD_CONTENT_V2)).toEqual([]);

    const resumed = WorldEngineV2.fromSave(new WorldEngineV2(1, WORLD_CONTENT_V2, state).save());
    expect(resumed.state.humanPlayerIds).toEqual(
      [belgium, luxembourg].sort((left, right) => left.localeCompare(right)),
    );
    expect(resumed.state.humanPlayerId).toBe(belgium);
    expect(resumed.state.gameOver).toBe(false);
  });
});
