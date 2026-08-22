import { describe, expect, it } from 'vitest';
import {
  captureScrollSessions,
  drawerScrollSessionId,
  restoreScrollSessions,
  type ScrollSessionTarget,
} from './scrollSessions';

function target(session: string, scrollTop: number): ScrollSessionTarget {
  return { dataset: { scrollSession: session }, scrollTop };
}

describe('DOM scroll sessions', () => {
  it('preserves the position when a weekly render replaces the same drawer', () => {
    const before = target(drawerScrollSessionId('war'), 438);
    const snapshot = captureScrollSessions([before]);
    const after = target(drawerScrollSessionId('war'), 0);

    restoreScrollSessions([after], snapshot);

    expect(after.scrollTop).toBe(438);
  });

  it('starts a different command subtab at the top', () => {
    const war = target(drawerScrollSessionId('war'), 281);
    const snapshot = captureScrollSessions([war]);
    const economy = target(drawerScrollSessionId('economy'), 0);

    restoreScrollSessions([economy], snapshot);

    expect(economy.scrollTop).toBe(0);
  });

  it('resets when a different full panel replaces the drawer', () => {
    const command = target(drawerScrollSessionId('nation'), 196);
    const snapshot = captureScrollSessions([command]);
    const ranking = target(drawerScrollSessionId('ranking'), 99);

    restoreScrollSessions([ranking], snapshot);

    expect(ranking.scrollTop).toBe(0);
  });

  it('resets a closed drawer when it is opened as a new session', () => {
    const closedSnapshot = captureScrollSessions([]);
    const reopened = target(drawerScrollSessionId('progress'), 73);

    restoreScrollSessions([reopened], closedSnapshot);

    expect(reopened.scrollTop).toBe(0);
  });

  it('keeps one territory inspector live but resets for a different territory', () => {
    const luxembourg = target(drawerScrollSessionId('war', 'lux'), 144);
    const snapshot = captureScrollSessions([luxembourg]);
    const sameTerritory = target(drawerScrollSessionId('economy', 'lux'), 0);
    const belgium = target(drawerScrollSessionId('war', 'bel'), 144);

    restoreScrollSessions([sameTerritory, belgium], snapshot);

    expect(sameTerritory.scrollTop).toBe(144);
    expect(belgium.scrollTop).toBe(0);
  });
});
