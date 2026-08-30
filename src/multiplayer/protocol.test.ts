import { describe, expect, it } from 'vitest';
import type { SaveGameV2 } from '../sim/v2/persistence';
import { V2_RULES_VERSION } from '../sim/v2/balance';
import { ARCTIC_PROJECT_IDS_V2 } from '../sim/v2/polarEndgame';
import { normalizeScenarioConfigV2 } from '../sim/v2/scenarios';
import { nationIdV2, type ResearchAllocationsV2 } from '../sim/v2/types';
import { createNeutralMultiplayerDeploymentSnapshotV1 } from './deployment';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  MultiplayerProtocolError,
  WireMessageAssembler,
  assertSignalCompatibility,
  decodeProtocolMessage,
  decodeSignalCode,
  encodeProtocolMessage,
  encodeSignalCode,
  encodeWireFrames,
  validateProtocolMessage,
  type DirectInviteSignal,
  type DirectAnswerSignal,
  type MultiplayerProtocolMessage,
  type SnapshotMessage,
} from './protocol';

const RULES_VERSION = V2_RULES_VERSION;
const STANDARD_SCENARIO = normalizeScenarioConfigV2({ mode: 'standard-2026', seed: 12_345 });

const allocations: ResearchAllocationsV2 = {
  'population-recruitment': 10,
  'military-industry': 10,
  'advanced-weapons': 10,
  'defensive-systems': 10,
  'logistics-medicine': 10,
  'economy-science': 10,
  'food-systems': 10,
  'reserve-doctrine': 10,
  'public-administration': 10,
  'education-intelligence': 10,
};

function snapshotWithExtraPayload(payload: string): SnapshotMessage {
  const save = {
    schemaVersion: 22,
    rulesVersion: RULES_VERSION,
    tick: 42,
    canonicalStateHash: '0123abcd',
    testPayload: payload,
  } as unknown as SaveGameV2;
  return {
    type: 'snapshot',
    reason: 'resync',
    tick: 42,
    hash: '0123abcd',
    nextClientSequence: 8,
    save,
  };
}

describe('multiplayer protocol', () => {
  it('uses multiplayer protocol version 6 for reload-safe guest command ordering', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(6);
  });

  it('requires the host-owned next client sequence in every authoritative snapshot', () => {
    const snapshot = snapshotWithExtraPayload('reconnect-sequence');
    expect(validateProtocolMessage(snapshot)).toMatchObject({
      type: 'snapshot',
      nextClientSequence: 8,
    });
    const { nextClientSequence: _omitted, ...missingSequence } = snapshot;
    expect(() => validateProtocolMessage(missingSequence)).toThrow(/nextClientSequence/i);
    expect(() => validateProtocolMessage({
      ...snapshot,
      nextClientSequence: 0,
    })).toThrow(/nextClientSequence/i);
  });

  it('validates a country, mastery, APEX and doctrine as one exact deployment action', () => {
    const belgium = nationIdV2('bel');
    const neutral = createNeutralMultiplayerDeploymentSnapshotV1(belgium);
    const deployment = {
      ...neutral,
      activeDoctrine: 'vanguard' as const,
      apex: {
        ...neutral.apex,
        manpower: neutral.apex.capacity,
        capabilities: {
          ...neutral.apex.capabilities,
          assaultSpecialist: true,
        },
      },
    };
    const action = {
      type: 'lobby-action' as const,
      revision: 2,
      action: { type: 'select-country' as const, countryId: belgium, deployment },
    };

    expect(validateProtocolMessage(action)).toEqual(action);
    expect(() => validateProtocolMessage({
      ...action,
      action: {
        ...action.action,
        deployment: {
          ...deployment,
          apex: { ...deployment.apex, trainedReserves: deployment.apex.capacity + 1 },
        },
      },
    })).toThrow(/integrity and recharge buffer must fit inside max integrity/i);
    expect(() => validateProtocolMessage({
      ...action,
      action: { ...action.action, deployment: { ...deployment, activeDoctrine: 'forged' } },
    })).toThrow(/activeDoctrine is invalid/i);
    expect(() => validateProtocolMessage({
      ...action,
      action: { ...action.action, deployment: { ...deployment, editableProfile: {} } },
    })).toThrow(/must contain exactly/i);
    expect(() => validateProtocolMessage({
      ...action,
      action: {
        ...action.action,
        deployment: { ...deployment, countryId: nationIdV2('nld') },
      },
    })).toThrow(/must match action.countryId/i);
  });

  it('round-trips rejoin credentials only when session and token are paired', () => {
    const hello = {
      type: 'hello',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      rulesVersion: 'rules-v1',
      roomId: 'room_12345678',
      invitationId: 'invite_12345678',
      peerId: 'guest_12345678',
      displayName: 'Guest',
      role: 'guest',
      sessionId: 'session_12345678',
      rejoinToken: 'rejoin_12345678',
    } as const;
    expect(decodeProtocolMessage(encodeProtocolMessage(hello))).toEqual(hello);
    expect(() => validateProtocolMessage({ ...hello, rejoinToken: undefined })).toThrow(/supplied together/i);
  });

  it('rejects retired run-draft choices on the wire', () => {
    const command = {
      type: 'command',
      requestId: 'request_run_upgrade',
      clientSequence: 1,
      baseTick: 12,
      command: {
        type: 'choose-run-upgrade',
        playerId: nationIdV2('bel'),
        offerId: 'run-draft:1:bel:campaign-region',
        upgradeId: 'combined-arms',
      },
    } as const;
    expect(() => validateProtocolMessage(command)).toThrow(/retired/i);
  });

  it('round-trips only canonical APEX narrative responses', () => {
    const command = {
      type: 'command',
      requestId: 'request_apex_story',
      clientSequence: 2,
      baseTick: 14,
      command: {
        type: 'respond-apex-transmission',
        playerId: nationIdV2('bel'),
        transmissionId: 'campaign-signal-anomaly',
        choice: 'accept',
      },
    } as const;
    expect(decodeProtocolMessage(encodeProtocolMessage(command))).toEqual(command);
    expect(() => validateProtocolMessage({
      ...command,
      command: { ...command.command, transmissionId: 'forged-message' },
    })).toThrow(/transmissionId is invalid/i);
    expect(() => validateProtocolMessage({
      ...command,
      command: { ...command.command, choice: 'yes' },
    })).toThrow(/choice must be accept or acknowledge/i);
    expect(() => validateProtocolMessage({
      ...command,
      command: { ...command.command, choice: 'later' },
    })).toThrow(/mandatory/i);
    expect(() => validateProtocolMessage({
      ...command,
      command: { ...command.command, admin: true },
    })).toThrow(/must contain exactly/i);

    const acknowledgement = {
      ...command,
      command: {
        ...command.command,
        transmissionId: 'campaign-first-conquest' as const,
        choice: 'acknowledge' as const,
      },
    };
    expect(decodeProtocolMessage(encodeProtocolMessage(acknowledgement)))
      .toEqual(acknowledgement);
    expect(() => validateProtocolMessage({
      ...acknowledgement,
      command: { ...acknowledgement.command, choice: 'accept' },
    })).toThrow(/informational/i);
  });

  it('round-trips typed lobby and unicode player data', () => {
    const message: MultiplayerProtocolMessage = {
      type: 'lobby-state',
      revision: 7,
      hostPeerId: 'host_12345678',
      scenario: STANDARD_SCENARIO,
      started: false,
      players: [
        {
          peerId: 'host_12345678',
          displayName: 'Kévin 🇧🇪',
          countryId: nationIdV2('BEL'),
          deployment: createNeutralMultiplayerDeploymentSnapshotV1(nationIdV2('BEL')),
          ready: true,
          connected: true,
        },
        {
          peerId: 'guest_12345678',
          displayName: 'Zoë',
          countryId: null,
          deployment: null,
          ready: false,
          connected: true,
        },
      ],
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
  });

  it('strictly validates scenario state and scenario-change actions', () => {
    const randomScenario = normalizeScenarioConfigV2({ mode: 'random-world', seed: 987_654_321 });
    expect(validateProtocolMessage({
      type: 'lobby-action',
      revision: 4,
      action: { type: 'set-scenario', scenario: randomScenario },
    })).toEqual({
      type: 'lobby-action',
      revision: 4,
      action: { type: 'set-scenario', scenario: randomScenario },
    });
    expect(() => validateProtocolMessage({
      type: 'lobby-action',
      revision: 4,
      action: { type: 'set-scenario', scenario: { ...randomScenario, extra: true } },
    })).toThrow(/exactly mode, seed and version/i);
    expect(() => validateProtocolMessage({
      type: 'lobby-action',
      revision: 4,
      action: { type: 'set-scenario', scenario: { ...randomScenario, seed: 0 } },
    })).toThrow(/seed must be an integer/i);
    expect(() => validateProtocolMessage({
      type: 'lobby-action',
      revision: 4,
      action: { type: 'set-scenario', scenario: { ...randomScenario, version: 999 } },
    })).toThrow(/unsupported alternative universe scenario version/i);
    expect(() => validateProtocolMessage({
      type: 'lobby-state',
      revision: 4,
      hostPeerId: 'host_12345678',
      started: false,
      players: [{
        peerId: 'host_12345678', displayName: 'Host', countryId: null, ready: false, connected: true,
      }],
    })).toThrow(/message\.scenario/i);
    const survivalScenario = normalizeScenarioConfigV2({ mode: 'survival', seed: 987_654_322 });
    expect(validateProtocolMessage({
      type: 'lobby-action',
      revision: 5,
      action: { type: 'set-scenario', scenario: survivalScenario },
    })).toEqual({
      type: 'lobby-action',
      revision: 5,
      action: { type: 'set-scenario', scenario: survivalScenario },
    });
  });

  it('round-trips bounded canonical Survival empire commands', () => {
    const message: MultiplayerProtocolMessage = {
      type: 'command',
      requestId: 'survival_empire_1',
      clientSequence: 7,
      baseTick: 0,
      command: {
        type: 'form-survival-empire',
        flagshipId: nationIdV2('bel'),
        memberIds: [nationIdV2('bel'), nationIdV2('lux'), nationIdV2('nld')],
      },
    };
    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
    expect(() => validateProtocolMessage({
      ...message,
      command: { ...message.command, memberIds: ['bel', 'bel'] },
    })).toThrow(/duplicate country IDs/i);
    expect(() => validateProtocolMessage({
      ...message,
      command: { ...message.command, memberIds: [] },
    })).toThrow(/1 through 256/i);
  });

  it('validates all research branches inside a client command', () => {
    const message: MultiplayerProtocolMessage = {
      type: 'command',
      requestId: 'request_12345678',
      clientSequence: 3,
      baseTick: 18,
      command: {
        type: 'set-research-allocations',
        playerId: nationIdV2('BEL'),
        allocations,
      },
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
    expect(() => validateProtocolMessage({
      ...message,
      command: { ...message.command, allocations: { 'military-industry': 100 } },
    })).toThrow(/every supported research branch/i);
  });

  it('round-trips manual Commander orders and strictly validates their policy and front', () => {
    const policy: MultiplayerProtocolMessage = {
      type: 'command', requestId: 'commander_policy_1', clientSequence: 6, baseTick: 20,
      command: {
        type: 'set-commander-priorities',
        playerId: nationIdV2('bel'),
        priorities: { training: 45, logistics: 35, development: 20 },
      },
    };
    const order: MultiplayerProtocolMessage = {
      type: 'command', requestId: 'commander_order_1', clientSequence: 7, baseTick: 20,
      command: {
        type: 'issue-commander-order',
        playerId: nationIdV2('bel'),
        destinationId: 'bel' as never,
        mission: 'defense',
        front: { warId: 'war-1', sourceId: 'nld' as never, targetId: 'bel' as never },
      },
    };
    expect(decodeProtocolMessage(encodeProtocolMessage(policy))).toEqual(policy);
    expect(decodeProtocolMessage(encodeProtocolMessage(order))).toEqual(order);
    expect(() => validateProtocolMessage({
      ...policy,
      command: { ...policy.command, priorities: { training: 60, logistics: 30, development: 20 } },
    })).toThrow(/total exactly 100/i);
    expect(() => validateProtocolMessage({
      ...order,
      command: { ...order.command, front: { ...order.command.front!, autoTarget: true } },
    })).toThrow(/exactly sourceId, targetId and warId/i);
    expect(() => validateProtocolMessage({
      ...order,
      command: { ...order.command, autoTarget: true },
    })).toThrow(/Commander orders must contain exactly/i);
    expect(() => validateProtocolMessage({
      ...order,
      // Autonomy is host-simulation state, never a client-selectable command field.
      command: { ...order.command, orderSource: 'autonomous' },
    })).toThrow(/Commander orders must contain exactly/i);
  });

  it('preserves the canonical country-trait and Commander doctrine snapshot in resyncs', () => {
    const message = snapshotWithExtraPayload('commander-meta');
    (message.save as unknown as Record<string, any>).commanderForces = {
      bel: {
        countryTraitScale: 0.6,
        capabilities: {
          mobileHeadquarters: true,
          fieldHospital: true,
          rapidResponse: false,
          assaultSpecialist: true,
          defenseSpecialist: false,
          emergencyExtractionCharges: 1,
        },
      },
    };
    const decoded = decodeProtocolMessage(encodeProtocolMessage(message)) as SnapshotMessage;
    expect((decoded.save as unknown as Record<string, any>).commanderForces.bel).toEqual(
      (message.save as unknown as Record<string, any>).commanderForces.bel,
    );
  });

  it('round-trips polar commands and rejects invalid project, sector and manpower payloads', () => {
    const commands: MultiplayerProtocolMessage[] = [
      {
        type: 'command', requestId: 'polar_project_1', clientSequence: 10, baseTick: 50,
        command: {
          type: 'start-arctic-project', playerId: nationIdV2('can'), projectId: 'polar-demography',
        },
      },
      {
        type: 'command', requestId: 'polar_project_2', clientSequence: 11, baseTick: 51,
        command: {
          type: 'start-arctic-project', playerId: nationIdV2('can'), projectId: 'ice-theatre-simulation',
        },
      },
      {
        type: 'command', requestId: 'polar_warning_1', clientSequence: 12, baseTick: 52,
        command: { type: 'acknowledge-polar-warning', playerId: nationIdV2('can') },
      },
      {
        type: 'command', requestId: 'polar_deploy_1', clientSequence: 13, baseTick: 53,
        command: {
          type: 'deploy-antarctic-expedition', playerId: nationIdV2('can'),
          sectorId: 'drake-entry', manpower: 1.25,
        },
      },
    ];
    for (const message of commands) {
      expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
    }
    for (const [index, projectId] of ARCTIC_PROJECT_IDS_V2.entries()) {
      const message: MultiplayerProtocolMessage = {
        type: 'command',
        requestId: `polar_all_stages_${index}`,
        clientSequence: 100 + index,
        baseTick: 60 + index,
        command: {
          type: 'start-arctic-project', playerId: nationIdV2('can'), projectId,
        },
      };
      expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
    }

    const envelope = {
      type: 'command', requestId: 'polar_invalid_1', clientSequence: 14, baseTick: 54,
    } as const;
    expect(() => validateProtocolMessage({
      ...envelope,
      command: { type: 'start-arctic-project', playerId: 'can', projectId: 'moon-base' },
    })).toThrow(/projectId is invalid/i);
    expect(() => validateProtocolMessage({
      ...envelope,
      command: { type: 'deploy-antarctic-expedition', playerId: 'can', sectorId: 'south-pole', manpower: 1 },
    })).toThrow(/sectorId is invalid/i);
    expect(() => validateProtocolMessage({
      ...envelope,
      command: {
        type: 'deploy-antarctic-expedition', playerId: 'can', sectorId: 'ross-entry',
        manpower: Number.MAX_SAFE_INTEGER,
      },
    })).not.toThrow();
    for (const manpower of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => validateProtocolMessage({
        ...envelope,
        command: {
          type: 'deploy-antarctic-expedition', playerId: 'can', sectorId: 'ross-entry', manpower,
        },
      })).toThrow(/manpower/i);
    }
  });

  it('round-trips directed alliance invitations and addressed responses', () => {
    const invitation: MultiplayerProtocolMessage = {
      type: 'command',
      requestId: 'alliance_invite_1',
      clientSequence: 4,
      baseTick: 18,
      command: {
        type: 'propose-alliance',
        fromId: nationIdV2('bel'),
        targetId: nationIdV2('can'),
      },
    };
    const response: MultiplayerProtocolMessage = {
      type: 'command',
      requestId: 'alliance_response_1',
      clientSequence: 5,
      baseTick: 19,
      command: {
        type: 'respond-to-alliance',
        fromId: nationIdV2('bel'),
        toId: nationIdV2('can'),
        accept: true,
      },
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(invitation))).toEqual(invitation);
    expect(decodeProtocolMessage(encodeProtocolMessage(response))).toEqual(response);
    expect(() => validateProtocolMessage({
      ...response,
      command: { ...response.command, accept: 'yes' },
    })).toThrow(/accept must be a boolean/i);
  });

  it('carries explicit accepted and rejected command results', () => {
    expect(validateProtocolMessage({
      type: 'command-result',
      requestId: 'request_12345678',
      accepted: true,
      assignedSequence: 91,
    })).toMatchObject({ accepted: true, assignedSequence: 91 });

    expect(validateProtocolMessage({
      type: 'command-result',
      requestId: 'request_87654321',
      accepted: false,
      reason: 'Only the selected country may issue this order.',
    })).toMatchObject({ accepted: false });

    expect(() => validateProtocolMessage({
      type: 'command-result',
      requestId: 'request_12345678',
      accepted: true,
    })).toThrow(/assigned sequence/i);
  });

  it('allows cheap ticks between periodic hash checkpoints', () => {
    expect(validateProtocolMessage({ type: 'tick', tick: 40, commands: [] })).toEqual({
      type: 'tick',
      tick: 40,
      commands: [],
    });
    expect(validateProtocolMessage({ type: 'tick', tick: 48, hash: '89abcdef', commands: [] })).toMatchObject({
      tick: 48,
      hash: '89abcdef',
    });
  });

  it('rejects malformed JSON, unknown messages and duplicate lobby countries', () => {
    expect(() => decodeProtocolMessage('{')).toThrow(MultiplayerProtocolError);
    expect(() => validateProtocolMessage({ type: 'teleport' })).toThrow(/unknown multiplayer/i);
    expect(() => validateProtocolMessage({
      type: 'lobby-state',
      revision: 1,
      hostPeerId: 'host_12345678',
      scenario: STANDARD_SCENARIO,
      started: false,
      players: [
        {
          peerId: 'host_12345678', displayName: 'Host', countryId: 'BEL',
          deployment: createNeutralMultiplayerDeploymentSnapshotV1('BEL'),
          ready: true, connected: true,
        },
        {
          peerId: 'guest_12345678', displayName: 'Guest', countryId: 'BEL',
          deployment: createNeutralMultiplayerDeploymentSnapshotV1('BEL'),
          ready: true, connected: true,
        },
      ],
    })).toThrow(/countries must be unique/i);
  });

  it('encodes complete offer signals into portable URL-safe codes', () => {
    const signal: DirectInviteSignal = {
      kind: 'direct-invite',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      roomId: 'room_12345678',
      invitationId: 'invite_12345678',
      hostPeerId: 'host_12345678',
      hostName: 'Hôte 🇫🇷',
      description: {
        type: 'offer',
        sdp: 'v=0\r\na=candidate:complete-test\r\n',
      },
    };

    const code = encodeSignalCode(signal);
    expect(code).toMatch(/^FCMP1\.[A-Za-z0-9_-]+$/);
    expect(decodeSignalCode(`  ${code}  `)).toEqual(signal);
    expect(() => assertSignalCompatibility(signal, 'different-rules')).toThrow(/rules do not match/i);
    expect(() => decodeSignalCode('not-a-direct-code')).toThrow(/not a Frontier Command/i);
  });

  it('round-trips the matching complete answer and rejects cross-room use', () => {
    const answer: DirectAnswerSignal = {
      kind: 'direct-answer',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      roomId: 'room_12345678',
      invitationId: 'invite_12345678',
      guestPeerId: 'guest_12345678',
      guestName: 'Friend',
      description: {
        type: 'answer',
        sdp: 'v=0\r\na=candidate:complete-answer\r\n',
      },
    };

    expect(decodeSignalCode(encodeSignalCode(answer))).toEqual(answer);
    expect(() => assertSignalCompatibility(answer, RULES_VERSION, {
      roomId: 'room_different',
      invitationId: answer.invitationId,
    })).toThrow(/different room/i);
  });

  it('fragments and reassembles a large snapshot without breaking unicode', () => {
    const message = snapshotWithExtraPayload(`start-${'🚀'.repeat(40_000)}-end`);
    const frames = encodeWireFrames(message, 'message_12345678');
    expect(frames.length).toBeGreaterThan(1);

    const assembler = new WireMessageAssembler();
    let result: MultiplayerProtocolMessage | null = null;
    for (const frame of frames) result = assembler.accept(frame, 100);
    expect(result).toEqual(message);
  });

  it('rejects conflicting duplicate wire frames and oversized snapshots', () => {
    const frames = encodeWireFrames(snapshotWithExtraPayload('x'.repeat(40_000)), 'message_87654321');
    const assembler = new WireMessageAssembler();
    expect(assembler.accept(frames[0]!, 100)).toBeNull();
    expect(() => assembler.accept(`${frames[0]!}tampered`, 100)).toThrow(/conflicting data/i);

    expect(() => encodeProtocolMessage(snapshotWithExtraPayload('x'.repeat(4 * 1024 * 1024)))).toThrow(/may not exceed/i);
  });
});
