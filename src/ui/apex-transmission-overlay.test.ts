import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('APEX transmission overlay', () => {
  it('uses one compact secure-channel dialog with an abstract neural signal', () => {
    const render = methodSource(
      '  private renderApexTransmissionOverlay(',
      '  private renderSoundOptions(',
    );
    expect(render).toContain('role="dialog"');
    expect(render).toContain('aria-modal="true"');
    expect(render).toContain('SECURE ALLIED CHANNEL');
    expect(render).toContain('ALLIED STRATEGIC AI');
    expect(render).toContain('APEX LIVE');
    expect(render).toContain('CURRENT OBJECTIVE');
    expect(render).toContain('<svg viewBox="0 0 160 96"');
    expect(render).not.toMatch(/apex-robot|<img|robot/i);
    expect(stylesSource).toContain('width: min(840px, calc(100vw - 32px));');
    expect(stylesSource).toContain('backdrop-filter: blur(4px)');
    expect(stylesSource).toContain('font-size: 16px;');
  });

  it('makes the mandatory first briefing non-dismissible and routes it to Research', () => {
    const render = methodSource(
      '  private renderApexTransmissionOverlay(',
      '  private renderSoundOptions(',
    );
    expect(render).toContain('TUTORIAL · REQUIRED TO CONTINUE');
    expect(render).toContain('Start the required APEX analysis');
    expect(render).toContain('GAME PAUSED · REQUIRED');
    expect(render).toContain('START ANALYSIS');
    expect(render).toContain('SELECT FIRST TARGET');
    expect(render).toContain('data-choice="accept"');
    expect(render).not.toContain('OPEN RESEARCH');
    expect(render).not.toContain('LATER');
    expect(render).not.toContain('modal-close');
    expect(worldUiSource).toContain("if (event.key === 'Escape') {");
    expect(worldUiSource).toContain("this.panelMode = 'research';");
    expect(worldUiSource).not.toContain('NORTH POLE INVESTIGATION AUTHORISED');
  });

  it('reveals words live, supports click-to-complete, reduced motion and a focus trap', () => {
    expect(worldUiSource).toContain("split(/\\s+/).filter(Boolean)");
    expect(worldUiSource).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
    expect(worldUiSource).toContain("case 'complete-apex-transmission':");
    expect(worldUiSource).toContain('this.completeApexTransmissionReveal();');
    expect(worldUiSource).toContain("if (event.key !== 'Tab') return;");
    expect(worldUiSource).toContain('(focusable[0] ?? apexModal).focus();');
    expect(worldUiSource).toContain('const revealStep = words.length > 48 ? 3 : words.length > 24 ? 2 : 1;');
    expect(stylesSource).toContain('@keyframes apex-channel-cursor');
  });

  it('announces the complete briefing once instead of every animated word', () => {
    const render = methodSource(
      '  private renderApexTransmissionOverlay(',
      '  private renderSoundOptions(',
    );
    expect(render).toContain('aria-describedby="apex-transmission-full-copy"');
    expect(render).toContain('id="apex-transmission-full-copy"');
    expect(render).toContain('class="apex-transmission__visible-copy" aria-hidden="true"');
    expect(render).not.toContain('aria-live="polite"');
    expect(stylesSource).toContain('.world-ui-v2 .apex-transmission__sr-copy');
  });

  it('requires canonical acknowledgement for every later briefing', () => {
    const render = methodSource(
      '  private renderApexTransmissionOverlay(',
      '  private renderSoundOptions(',
    );
    expect(render).toContain('ACKNOWLEDGE');
    expect(render).toContain('data-choice="acknowledge"');
    expect(worldUiSource).toContain("choice !== 'accept' && choice !== 'acknowledge'");
  });

  it('pauses only the local singleplayer clock and restores it after the briefing', () => {
    const pause = methodSource(
      '  private syncApexTransmissionPause(',
      '  private transmissionRevealWords(',
    );
    expect(pause).toContain('if (this.options.multiplayer) return;');
    expect(pause).toContain('this.engine.setSpeed(0)');
    expect(pause).toContain('this.apexTransmissionResumeSpeed = this.engine.state.speed');
    expect(pause).toContain('this.engine.setSpeed(resumeSpeed)');
    expect(pause).toContain('this.warOutcomeQueue.length > 0');
    expect(worldUiSource).toContain('!warOutcome && !spectating && !state.gameOver');
    expect(worldUiSource).not.toContain('countryUnlockNotification');
  });

  it('keeps the message surface still instead of sweeping a glow over the copy', () => {
    expect(stylesSource).not.toContain('apex-channel-scan');
    expect(stylesSource).not.toContain('.apex-transmission-channel::after');
    expect(stylesSource).not.toContain('filter: drop-shadow(0 0 9px');
  });

  it('keeps the inbox clear about speaker, chronology and unresolved actions', () => {
    const inbox = methodSource(
      '  private renderInbox(',
      '  private renderWarConfirmation(',
    );
    expect(inbox).toContain('APEX · ALLIED AI');
    expect(inbox).toContain('Briefing log');
    expect(inbox).toContain('NEWEST FIRST');
    expect(inbox).toContain('OBJECTIVE COMPLETE');
    expect(inbox).toContain('START ANALYSIS');
    expect(inbox).toContain('SELECT FIRST TARGET');
  });
});
