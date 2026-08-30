import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSessionStatus, GuestCommandResultEvent } from '../multiplayer/gameSession';
import {
  GUEST_COMMAND_ACCEPT_NOTICE_MS,
  GUEST_COMMAND_REJECT_NOTICE_MS,
  MultiplayerSessionStatus,
} from './MultiplayerSessionStatus';

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  remove(...names: string[]): void {
    for (const name of names) this.values.delete(name);
  }

  contains(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  className = '';
  textContent = '';
  title = '';
  removed = false;
  type = '';
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(name: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event: Event) => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.removed = true;
  }
}

const runningStatus: GameSessionStatus = {
  role: 'guest',
  phase: 'running',
  tick: 18,
  speed: 1,
  connectedPeers: 1,
  seatCount: 2,
  pendingCommands: 0,
  lastHashTick: 16,
};

function commandResult(accepted: boolean): GuestCommandResultEvent {
  return {
    result: accepted
      ? { type: 'command-result', requestId: 'request_12345678', accepted: true, assignedSequence: 23 }
      : { type: 'command-result', requestId: 'request_12345678', accepted: false, reason: 'That country is not your seat.' },
    command: { type: 'set-speed', speed: 1 },
  };
}

describe('multiplayer session command feedback', () => {
  let element: FakeElement;

  beforeEach(() => {
    vi.useFakeTimers();
    element = new FakeElement();
    vi.stubGlobal('document', {
      createElement: (tag: string) => tag === 'aside' ? element : new FakeElement(),
      body: { append: () => undefined },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps a host rejection visible while ordinary status updates continue', () => {
    const view = new MultiplayerSessionStatus();
    view.update(runningStatus);
    view.showCommandResult(commandResult(false));
    view.update({ ...runningStatus, tick: 19 });

    expect(element.textContent).toContain('HOST REJECTED COMMAND');
    expect(element.textContent).toContain('not your seat');
    expect(element.classList.contains('has-command-error')).toBe(true);
    expect(element.attributes.get('role')).toBe('alert');

    vi.advanceTimersByTime(GUEST_COMMAND_REJECT_NOTICE_MS);
    expect(element.textContent).toContain('WEEK 19');
    expect(element.classList.contains('has-command-error')).toBe(false);
    expect(element.attributes.get('role')).toBe('status');
  });

  it('shows accepted orders briefly and cancels its timer during cleanup', () => {
    const view = new MultiplayerSessionStatus();
    view.update(runningStatus);
    view.showCommandResult(commandResult(true));
    expect(element.textContent).toBe('ORDER QUEUED · #23');

    vi.advanceTimersByTime(GUEST_COMMAND_ACCEPT_NOTICE_MS - 1);
    expect(element.textContent).toContain('ORDER QUEUED');
    view.destroy();
    vi.runAllTimers();
    expect(element.removed).toBe(true);
    expect(element.textContent).toContain('ORDER QUEUED');
  });

  it('offers one clear reconnect action while the guest seat is offline', () => {
    const reconnect = vi.fn();
    const view = new MultiplayerSessionStatus({ onReconnect: reconnect });
    view.update({ ...runningStatus, phase: 'disconnected', connectedPeers: 0 });

    expect(element.textContent).toContain('GUEST · OFFLINE');
    expect(element.children.some((child) => child.textContent === 'RECONNECT')).toBe(true);
    expect(element.children.filter((child) => child.dataset.mpReconnect === 'true')).toHaveLength(1);
    view.destroy();
  });

  it('replaces stale command feedback with an explicit retryable reconnect state', () => {
    const reconnect = vi.fn();
    const view = new MultiplayerSessionStatus({ onReconnect: reconnect });
    view.update(runningStatus);
    view.showCommandResult(commandResult(false));
    view.showReconnectStatus({
      peerId: 'guest_stable',
      phase: 'error',
      message: 'Reconnect timed out; your seat remains reserved.',
    });

    expect(element.textContent).toContain('RECONNECT PAUSED');
    expect(element.textContent).not.toContain('HOST REJECTED COMMAND');
    expect(element.children.filter((child) => child.dataset.mpReconnect === 'true')).toHaveLength(1);
    expect(element.attributes.get('role')).toBe('alert');
    expect(element.attributes.get('aria-live')).toBe('assertive');
    expect(element.classList.contains('has-command-error')).toBe(false);
    view.destroy();
  });
});
