import { describe, expect, it } from 'vitest';
import {
  captureScrollSessions,
  drawerScrollSessionId,
  restoreScrollSessions,
  type ScrollSessionTarget,
} from './scrollSessions';

function target(
  session: string,
  scrollTop: number,
  dimensions?: { scrollHeight: number; clientHeight: number },
): ScrollSessionTarget {
  return { dataset: { scrollSession: session }, scrollTop, ...dimensions };
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

  it('keeps each command tab position when switching away and back', () => {
    let sessions = captureScrollSessions([
      target(drawerScrollSessionId('war'), 281),
    ]);
    const economy = target(drawerScrollSessionId('economy'), 0);
    restoreScrollSessions([economy], sessions);
    economy.scrollTop = 94;
    sessions = captureScrollSessions([economy], sessions);

    const warAgain = target(drawerScrollSessionId('war'), 0);
    restoreScrollSessions([warAgain], sessions);

    expect(warAgain.scrollTop).toBe(281);
    expect(sessions.get(drawerScrollSessionId('economy'))).toBe(94);
  });

  it('resets when a different full panel replaces the drawer', () => {
    const command = target(drawerScrollSessionId('nation'), 196);
    const snapshot = captureScrollSessions([command]);
    const ranking = target(drawerScrollSessionId('ranking'), 0);

    restoreScrollSessions([ranking], snapshot);

    expect(ranking.scrollTop).toBe(0);
  });

  it('starts a never-visited drawer at the top', () => {
    const closedSnapshot = captureScrollSessions([]);
    const reopened = target(drawerScrollSessionId('research'), 0);

    restoreScrollSessions([reopened], closedSnapshot);

    expect(reopened.scrollTop).toBe(0);
  });

  it('keeps one territory inspector live but resets for a different territory', () => {
    const luxembourg = target(drawerScrollSessionId('war', 'lux'), 144);
    const snapshot = captureScrollSessions([luxembourg]);
    const sameTerritory = target(drawerScrollSessionId('economy', 'lux'), 0);
    const belgium = target(drawerScrollSessionId('war', 'bel'), 0);

    restoreScrollSessions([sameTerritory, belgium], snapshot);

    expect(sameTerritory.scrollTop).toBe(144);
    expect(belgium.scrollTop).toBe(0);
  });

  it('captures and restores independent nested scroll regions', () => {
    const modal = target('modal:inbox', 62);
    const nestedList = target('modal:inbox:list', 418);
    const snapshot = captureScrollSessions([modal, nestedList]);
    const nextModal = target('modal:inbox', 0);
    const nextList = target('modal:inbox:list', 0);

    restoreScrollSessions([nextModal, nextList], snapshot);

    expect(nextModal.scrollTop).toBe(62);
    expect(nextList.scrollTop).toBe(418);
  });

  it('clamps a saved position when live content becomes shorter', () => {
    const snapshot = captureScrollSessions([target('drawer:nation', 700)]);
    const shortened = target('drawer:nation', 0, { scrollHeight: 540, clientHeight: 320 });

    restoreScrollSessions([shortened], snapshot);

    expect(shortened.scrollTop).toBe(220);
  });

  it('keeps a user anchored to the bottom when live content grows', () => {
    const current = target('drawer:nation', 680, { scrollHeight: 1_000, clientHeight: 320 });
    const snapshot = captureScrollSessions([current]);
    const grown = target('drawer:nation', 0, { scrollHeight: 1_140, clientHeight: 320 });

    restoreScrollSessions([grown], snapshot);

    expect(grown.scrollTop).toBe(820);
  });

  it('leaves an unrelated existing surface untouched', () => {
    const unrelated = target('modal:new', 37);

    restoreScrollSessions([unrelated], new Map([['drawer:war', 120]]));

    expect(unrelated.scrollTop).toBe(37);
  });
});
