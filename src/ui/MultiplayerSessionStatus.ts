import type { GameSessionStatus, GuestCommandResultEvent } from '../multiplayer/gameSession';
import type { MultiplayerReconnectStatus } from '../multiplayer/reconnect';

export const GUEST_COMMAND_ACCEPT_NOTICE_MS = 1_400;
export const GUEST_COMMAND_REJECT_NOTICE_MS = 4_200;

export interface MultiplayerSessionStatusOptions {
  onReconnect?: () => void;
}

function phaseLabel(status: GameSessionStatus): string {
  return ({
    lobby: 'LOBBY',
    'waiting-snapshot': 'SYNCING',
    running: 'LIVE',
    resyncing: 'RESYNCING',
    disconnected: 'OFFLINE',
    error: 'ERROR',
    closed: 'CLOSED',
  })[status.phase];
}

export class MultiplayerSessionStatus {
  private readonly root = document.createElement('aside');
  private latestStatus?: GameSessionStatus;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private noticeActive = false;
  private destroyed = false;

  constructor(private readonly options: MultiplayerSessionStatusOptions = {}) {
    this.root.className = 'multiplayer-session-status glass-panel';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '55',
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      padding: '6px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: '800',
      letterSpacing: '.08em',
      color: '#c9f7ff',
      background: 'rgba(5, 16, 25, .78)',
      border: '1px solid rgba(107, 221, 242, .24)',
      backdropFilter: 'blur(10px)',
    });
    this.root.addEventListener('click', this.onClick);
    document.body.append(this.root);
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('[data-mp-reconnect]')) return;
    this.options.onReconnect?.();
  };

  update(status: GameSessionStatus): void {
    this.latestStatus = status;
    if (this.noticeActive || this.destroyed) return;
    this.renderStatus(status);
  }

  showCommandResult({ result }: GuestCommandResultEvent): void {
    if (this.destroyed) return;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeActive = true;

    const accepted = result.accepted;
    const reason = result.reason?.trim().slice(0, 180) || 'The host declined this action.';
    const sequence = result.assignedSequence === undefined ? '' : ` · #${result.assignedSequence}`;
    this.root.textContent = accepted
      ? `ORDER QUEUED${sequence}`
      : `HOST REJECTED COMMAND · ${reason}`;
    this.root.classList.toggle('has-command-error', !accepted);
    this.root.classList.toggle('has-command-success', accepted);
    this.root.classList.remove('has-error', 'is-offline');
    this.root.setAttribute('role', accepted ? 'status' : 'alert');
    this.root.setAttribute('aria-live', accepted ? 'polite' : 'assertive');
    this.root.title = accepted ? 'The host accepted and queued this command.' : reason;
    this.root.style.color = accepted ? '#c9f7ff' : '#ffd6d6';
    this.root.style.background = accepted ? 'rgba(5, 24, 30, .86)' : 'rgba(45, 8, 14, .92)';
    this.root.style.borderColor = accepted ? 'rgba(107, 221, 242, .38)' : 'rgba(255, 86, 104, .72)';

    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = undefined;
      this.noticeActive = false;
      if (!this.destroyed && this.latestStatus) this.renderStatus(this.latestStatus);
    }, accepted ? GUEST_COMMAND_ACCEPT_NOTICE_MS : GUEST_COMMAND_REJECT_NOTICE_MS);
  }

  showReconnectStatus(status: MultiplayerReconnectStatus): void {
    if (this.destroyed) return;
    this.noticeActive = false;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    const retry = status.phase === 'error' || status.phase === 'expired';
    const phase = status.phase === 'connected' ? 'RECONNECTED'
      : retry ? 'RECONNECT PAUSED' : 'RECONNECTING';
    this.root.textContent = `${phase} · ${status.message}`;
    if (retry && this.options.onReconnect) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mpReconnect = 'true';
      button.textContent = 'RETRY';
      button.setAttribute('aria-label', 'Retry multiplayer reconnect');
      Object.assign(button.style, {
        marginLeft: '4px',
        border: '1px solid rgba(255, 211, 116, .55)',
        borderRadius: '999px',
        padding: '4px 9px',
        color: '#fff2c8',
        background: 'rgba(87, 54, 8, .78)',
        font: 'inherit',
        cursor: 'pointer',
      });
      this.root.append(button);
    }
    this.root.classList.toggle('is-offline', retry);
    this.root.classList.toggle('has-error', status.phase === 'error');
    this.root.classList.remove('has-command-error', 'has-command-success');
    this.root.setAttribute('role', retry ? 'alert' : 'status');
    this.root.setAttribute('aria-live', retry ? 'assertive' : 'polite');
    this.root.title = status.message;
    this.root.style.color = retry ? '#fff2c8' : '#c9f7ff';
    this.root.style.background = retry ? 'rgba(49, 34, 9, .92)' : 'rgba(5, 24, 30, .86)';
    this.root.style.borderColor = retry
      ? 'rgba(255, 196, 96, .55)'
      : 'rgba(107, 221, 242, .38)';
  }

  private renderStatus(status: GameSessionStatus): void {
    const playerStatus = status.role === 'host'
      ? `${Math.min(status.seatCount, status.connectedPeers + 1)}/${status.seatCount} PLAYERS`
      : status.connectedPeers > 0 ? 'HOST ONLINE' : 'HOST OFFLINE';
    const speed = status.speed === 0 ? 'PAUSED' : `${status.speed}×`;
    const label = `${status.role.toUpperCase()} · ${phaseLabel(status)} · ${playerStatus} · DAY ${status.tick} · ${speed}`;
    this.root.textContent = label;
    if (status.role === 'guest'
      && (status.phase === 'disconnected' || status.phase === 'error')
      && this.options.onReconnect) {
      const help = document.createElement('span');
      help.textContent = ' Your seat is reserved.';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mpReconnect = 'true';
      button.textContent = 'RECONNECT';
      button.setAttribute('aria-label', 'Reconnect to multiplayer campaign');
      Object.assign(button.style, {
        marginLeft: '4px',
        border: '1px solid rgba(255, 211, 116, .55)',
        borderRadius: '999px',
        padding: '4px 9px',
        color: '#fff2c8',
        background: 'rgba(87, 54, 8, .78)',
        font: 'inherit',
        cursor: 'pointer',
      });
      this.root.append(help, button);
    }
    this.root.classList.toggle('has-error', status.phase === 'error');
    this.root.classList.toggle('is-offline', status.phase === 'disconnected');
    this.root.classList.remove('has-command-error', 'has-command-success');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.title = status.lastError ?? 'Host-authoritative multiplayer timeline';
    this.root.style.color = '#c9f7ff';
    this.root.style.background = 'rgba(5, 16, 25, .78)';
    this.root.style.borderColor = status.phase === 'error'
      ? 'rgba(255, 96, 96, .55)'
      : status.phase === 'disconnected'
        ? 'rgba(255, 196, 96, .45)'
        : 'rgba(107, 221, 242, .24)';
  }

  destroy(): void {
    this.destroyed = true;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    this.noticeActive = false;
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}
