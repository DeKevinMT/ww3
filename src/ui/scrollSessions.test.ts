import { describe, expect, it } from 'vitest';
import {
  captureDisclosureSessions,
  captureScrollSessions,
  drawerScrollSessionId,
  restoreDisclosureSessions,
  restoreScrollSessions,
  type DisclosureSessionTarget,
  type ScrollSessionTarget,
} from './scrollSessions';
import worldUiSource from './WorldUIV2.ts?raw';

function target(
  session: string,
  scrollTop: number,
  dimensions?: { scrollHeight: number; clientHeight: number },
): ScrollSessionTarget {
  return { dataset: { scrollSession: session }, scrollTop, ...dimensions };
}

describe('DOM scroll sessions', () => {
  it('preserves the position when a daily render replaces the same drawer', () => {
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

describe('drawer disclosure sessions', () => {
  const disclosure = (session: string, open: boolean): DisclosureSessionTarget => ({
    dataset: { disclosureSession: session },
    open,
  });

  it('keeps an Economy detail section open across a daily render', () => {
    const snapshot = captureDisclosureSessions([
      disclosure('drawer:economy:annual-ledger', true),
    ]);
    const rerendered = disclosure('drawer:economy:annual-ledger', false);

    restoreDisclosureSessions([rerendered], snapshot);

    expect(rerendered.open).toBe(true);
  });

  it('keeps independent drawer sections isolated', () => {
    let snapshot = captureDisclosureSessions([
      disclosure('drawer:nation:people-food', true),
      disclosure('drawer:nation:apex-purge', false),
    ]);
    snapshot = captureDisclosureSessions([
      disclosure('drawer:research:programs', true),
    ], snapshot);
    const nationPeople = disclosure('drawer:nation:people-food', false);
    const nationPurge = disclosure('drawer:nation:apex-purge', true);
    const research = disclosure('drawer:research:programs', false);

    restoreDisclosureSessions([nationPeople, nationPurge, research], snapshot);

    expect(nationPeople.open).toBe(true);
    expect(nationPurge.open).toBe(false);
    expect(research.open).toBe(true);
  });

  it('does not force a never-opened disclosure away from its authored default', () => {
    const fresh = disclosure('drawer:war:campaigns', true);

    restoreDisclosureSessions([fresh], new Map());

    expect(fresh.open).toBe(true);
  });

  it('does not leak one completed war report choice into the next report', () => {
    const firstReport = disclosure('modal:war-outcome:war-1:full-breakdown', true);
    const snapshot = captureDisclosureSessions([firstReport]);
    const secondReport = disclosure('modal:war-outcome:war-2:full-breakdown', false);

    restoreDisclosureSessions([secondReport], snapshot);

    expect(secondReport.open).toBe(false);
  });

  it('gives every live World UI disclosure an explicit stable surface key', () => {
    const disclosureTags = worldUiSource.match(/<details\b[^>]*>/g) ?? [];

    expect(disclosureTags.length).toBeGreaterThan(0);
    expect(disclosureTags.every((tag) => tag.includes('data-disclosure-session='))).toBe(true);
    expect(worldUiSource).toContain('data-disclosure-session="drawer:economy:annual-ledger"');
    expect(worldUiSource).not.toContain('data-disclosure-session="drawer:research:programs"');
    expect(worldUiSource).toContain(
      'data-disclosure-session="modal:war-outcome:${escapeHtml(outcome.warId)}:full-breakdown"',
    );
  });

  it('restores disclosure and scroll state in both normal and eliminated renders', () => {
    expect(worldUiSource.match(/restoreDisclosureSessions\(/g)).toHaveLength(2);
    expect(worldUiSource.match(/restoreScrollSessions\(/g)).toHaveLength(2);
  });
});
