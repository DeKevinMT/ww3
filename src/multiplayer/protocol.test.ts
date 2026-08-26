import { describe, expect, it } from 'vitest';
import type { SaveGameV2 } from '../sim/v2/persistence';
import { V2_RULES_VERSION } from '../sim/v2/balance';
import { normalizeScenarioConfigV2 } from '../sim/v2/scenarios';
import { nationIdV2, type ResearchAllocationsV2 } from '../sim/v2/types';
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
    save,
  };
}

describe('multiplayer protocol', () => {
  it('uses multiplayer protocol version 2 for scenario-aware rooms', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(2);
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
          ready: true,
          connected: true,
        },
        {
          peerId: 'guest_12345678',
          displayName: 'Zoë',
          countryId: null,
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
        { peerId: 'host_12345678', displayName: 'Host', countryId: 'BEL', ready: true, connected: true },
        { peerId: 'guest_12345678', displayName: 'Guest', countryId: 'BEL', ready: true, connected: true },
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
