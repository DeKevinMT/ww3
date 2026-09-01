import { describe, expect, it, vi } from 'vitest';
import type {
  CommandResultV2,
  ResearchBranchV2,
  ResearchEffectV2,
  WorldChangeV2,
  WorldCommandV2,
} from '../sim/v2/types';
import { WorldUIV2 } from './WorldUIV2';
import worldUiSource from './WorldUIV2.ts?raw';

type ResearchCommand = Extract<WorldCommandV2, {
  type: 'set-research-direction' | 'research-surge';
}>;

type FakeState = {
  tick: number;
  actionSequence: number;
  players: Record<string, {
    treasury: number;
    manualActionUses: { researchSurge: number };
    research: {
      activeProgram: ResearchBranchV2 | null;
      categoryDirections: Record<string, {
        branch: ResearchBranchV2;
        effect: ResearchEffectV2;
      }>;
      progress: Record<string, number>;
      effectLevels: Record<string, number>;
    };
  }>;
};

type PendingHarness = {
  pendingResearchAction?: {
    command: ResearchCommand;
    queuedActionSequence: number;
  };
  submitResearchAction(
    command: ResearchCommand,
    submit: () => CommandResultV2,
    rejectionFallback: string,
  ): void;
  resolvePendingResearchActionFromChange(change: WorldChangeV2): boolean;
  handleAuthoritativeResearchCommandResult(
    command: WorldCommandV2,
    result: CommandResultV2 & { assignedSequence?: number },
  ): void;
};

function createHarness(): {
  ui: PendingHarness;
  state: FakeState;
  toast: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} {
  const state: FakeState = {
    tick: 14,
    actionSequence: 6,
    players: {
      human: {
        treasury: 100,
        manualActionUses: { researchSurge: 0 },
        research: {
          activeProgram: null,
          categoryDirections: {
            people: { branch: 'population-recruitment', effect: 'population-growth' },
            army: { branch: 'reserve-doctrine', effect: 'training' },
            combat: { branch: 'advanced-weapons', effect: 'attack' },
            sustainment: { branch: 'logistics-medicine', effect: 'recovery' },
            state: { branch: 'economy-science', effect: 'economy-growth' },
          },
          progress: { 'advanced-weapons': 0, 'defensive-systems': 0 },
          effectLevels: { attack: 0, defense: 0 },
        },
      },
    },
  };
  const toast = vi.fn();
  const render = vi.fn();
  const ui = Object.create(WorldUIV2.prototype) as PendingHarness;
  Object.assign(ui, { engine: { state }, toast, render });
  return { ui, state, toast, render };
}

describe('queued research UI', () => {
  it('keeps exactly one order pending through the local action-queued notification', () => {
    const { ui, state, toast, render } = createHarness();
    const direction: ResearchCommand = {
      type: 'set-research-direction',
      playerId: 'human',
      category: 'combat',
      branch: 'defensive-systems',
      effect: 'defense',
    };
    const submit = vi.fn(() => {
      state.actionSequence += 1;
      return { accepted: true };
    });

    ui.submitResearchAction(direction, submit, 'Unavailable.');

    expect(submit).toHaveBeenCalledOnce();
    expect(ui.pendingResearchAction?.command).toEqual(direction);
    expect(ui.pendingResearchAction?.queuedActionSequence).toBe(7);
    expect(toast).toHaveBeenCalledWith('RESEARCH ORDER QUEUED · AWAITING CONFIRMATION');
    expect(render).toHaveBeenCalledOnce();
    expect(ui.resolvePendingResearchActionFromChange({ reason: 'action-queued' })).toBe(false);
    expect(ui.pendingResearchAction).toBeDefined();

    const duplicateSubmit = vi.fn(() => ({ accepted: true }));
    ui.submitResearchAction({
      ...direction,
      branch: 'advanced-weapons',
      effect: 'attack',
    }, duplicateSubmit, 'Unavailable.');
    expect(duplicateSubmit).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith('A RESEARCH ORDER IS ALREADY AWAITING CONFIRMATION');

    state.players.human!.research.categoryDirections.combat = {
      branch: 'defensive-systems',
      effect: 'defense',
    };
    expect(ui.resolvePendingResearchActionFromChange({ reason: 'research-focus' })).toBe(true);
    expect(ui.pendingResearchAction).toBeUndefined();
  });

  it('uses the next authoritative tick as the rejection/state boundary on a replica', () => {
    const { ui, state } = createHarness();
    const surge: ResearchCommand = {
      type: 'research-surge',
      playerId: 'human',
      targetBranch: 'advanced-weapons',
    };
    ui.submitResearchAction(surge, () => ({ accepted: true }), 'Unavailable.');

    expect(ui.resolvePendingResearchActionFromChange({ reason: 'viewer-changed' })).toBe(false);
    expect(ui.pendingResearchAction).toBeDefined();
    state.tick += 1;
    expect(ui.resolvePendingResearchActionFromChange({ reason: 'tick' })).toBe(true);
    expect(ui.pendingResearchAction).toBeUndefined();
  });

  it('waits after a host acceptance but unlocks immediately on a matching host rejection', () => {
    const { ui, toast } = createHarness();
    const direction: ResearchCommand = {
      type: 'set-research-direction',
      playerId: 'human',
      category: 'state',
      branch: 'economy-science',
      effect: 'research-efficiency',
    };
    ui.submitResearchAction(direction, () => ({ accepted: true }), 'Unavailable.');

    ui.handleAuthoritativeResearchCommandResult(direction, { accepted: true, assignedSequence: 19 });
    expect(ui.pendingResearchAction?.queuedActionSequence).toBe(19);

    ui.handleAuthoritativeResearchCommandResult(direction, {
      accepted: false,
      reason: 'The host rejected that direction.',
    });
    expect(ui.pendingResearchAction).toBeUndefined();
    expect(toast).toHaveBeenLastCalledWith('The host rejected that direction.');
  });

  it('disables every research decision surface and never announces queued work as applied', () => {
    const renderStart = worldUiSource.indexOf('  private renderResearchPanel(');
    const renderEnd = worldUiSource.indexOf('  private renderWarPanel(', renderStart);
    const handlerStart = worldUiSource.indexOf("          case 'set-research-direction': {");
    const handlerEnd = worldUiSource.indexOf("          case 'research-surge': {", handlerStart);
    expect(renderStart).toBeGreaterThan(0);
    expect(renderEnd).toBeGreaterThan(renderStart);
    expect(handlerStart).toBeGreaterThan(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const research = worldUiSource.slice(renderStart, renderEnd);
    const handlers = worldUiSource.slice(handlerStart, handlerEnd);

    expect(research).toContain("researchOrderPending || !surgeTerms.allowed ? 'disabled aria-disabled=\"true\"' : ''");
    expect(research).toContain("researchOrderPending || isActive || program.maxed ? 'disabled aria-disabled=\"true\"' : ''");
    expect(research).toContain("isPending ? 'aria-busy=\"true\"' : ''");
    expect(research).toContain("researchOrderPending ? 'ORDER QUEUED'");
    expect(research).not.toMatch(/BREAKTHROUGH READY|CHOICE READY/i);
    expect(research).not.toContain('data-action="choose-research-breakthrough"');
    expect(handlers.match(/this\.submitResearchAction\(/g)).toHaveLength(1);
    expect(handlers).toContain('this.engine.setResearchDirection(playerId, category, branch, effect)');
    expect(handlers).not.toContain('IS NOW THE ACTIVE FOCUS');
    expect(handlers).not.toContain('ADDED TO THE EMPIRE');
    expect(handlers).not.toContain('NATIONAL RESEARCH INITIATIVE LAUNCHED');
    expect(worldUiSource).not.toContain('choose-research-breakthrough');
  });
});
